import type { OrchestrateAPI } from '../shared/types'

declare global {
  interface Window {
    orchestrate: OrchestrateAPI
  }
}
