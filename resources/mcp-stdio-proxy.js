#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Stdio-to-HTTP MCP proxy for Codex.
 * Codex spawns this as a stdio MCP server; it bridges tool calls to the
 * Orchestrate HTTP MCP server running on localhost.
 *
 * Usage: node mcp-stdio-proxy.js http://127.0.0.1:PORT/mcp <secret> [projectFolder] [taskId]
 *
 * Self-contained — no npm dependencies (uses Node.js built-in fetch).
 */

const HTTP_URL = process.argv[2]
const MCP_SECRET = process.argv[3]
const PROJECT_FOLDER = process.argv[4]
const TASK_ID = process.argv[5]
if (!HTTP_URL || !MCP_SECRET) {
  process.stderr.write(
    'Usage: node mcp-stdio-proxy.js <http-mcp-url> <secret> [projectFolder] [taskId]\n'
  )
  process.exit(1)
}

let sessionId = null
let nextRpcId = 1

async function httpRpc(method, params) {
  const id = nextRpcId++
  const body = { jsonrpc: '2.0', method, id }
  if (params) body.params = params

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-MCP-Secret': MCP_SECRET
  }
  if (sessionId) headers['mcp-session-id'] = sessionId
  if (PROJECT_FOLDER) headers['X-Orchestrate-Project'] = PROJECT_FOLDER
  if (TASK_ID) headers['X-Orchestrate-Task'] = TASK_ID

  const res = await fetch(HTTP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  const sid = res.headers.get('mcp-session-id')
  if (sid) sessionId = sid

  return res.json()
}

async function ensureSession() {
  if (sessionId) return
  await httpRpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'orchestrate-proxy', version: '1.0.0' }
  })
  // Send initialized notification (no id = notification)
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-MCP-Secret': MCP_SECRET
  }
  if (sessionId) headers['mcp-session-id'] = sessionId
  if (PROJECT_FOLDER) headers['X-Orchestrate-Project'] = PROJECT_FOLDER
  if (TASK_ID) headers['X-Orchestrate-Task'] = TASK_ID
  await fetch(HTTP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
  })
}

async function callTool(name, args) {
  await ensureSession()
  const result = await httpRpc('tools/call', { name, arguments: args || {} })
  if (result.error) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ success: false, error: result.error.message }) }
      ]
    }
  }
  return result.result
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'orchestrate-proxy', version: '1.0.0' }
      }
    })
    return
  }

  if (msg.method === 'notifications/initialized') return

  if (msg.method === 'tools/list') {
    try {
      await ensureSession()
      const result = await httpRpc('tools/list', msg.params || {})
      if (result.error) {
        send({ jsonrpc: '2.0', id: msg.id, error: result.error })
      } else {
        send({ jsonrpc: '2.0', id: msg.id, result: result.result })
      }
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32603, message: err.message || String(err) }
      })
    }
    return
  }

  if (msg.method === 'tools/call') {
    try {
      const result = await callTool(msg.params.name, msg.params.arguments)
      send({ jsonrpc: '2.0', id: msg.id, result })
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32603, message: err.message || String(err) }
      })
    }
    return
  }

  if (msg.method === 'ping') {
    send({ jsonrpc: '2.0', id: msg.id, result: {} })
    return
  }

  // Unknown method
  if (msg.id !== undefined) {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: `Method not found: ${msg.method}` }
    })
  }
}

// Read newline-delimited JSON-RPC from stdin
let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      handleMessage(msg).catch((err) => {
        process.stderr.write(`[orchestrate-proxy] Error: ${err}\n`)
      })
    } catch {
      process.stderr.write(`[orchestrate-proxy] Invalid JSON: ${line}\n`)
    }
  }
})

process.stdin.on('end', () => process.exit(0))
