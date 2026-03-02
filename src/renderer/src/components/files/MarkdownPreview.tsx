import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownPreviewProps {
  content: string
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps): React.JSX.Element {
  return (
    <div className="h-full overflow-auto bg-zinc-950 px-10 py-6">
      <div className="prose prose-invert max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-a:text-blue-400 prose-strong:text-zinc-200 prose-code:text-zinc-300 prose-code:bg-zinc-800 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 prose-blockquote:border-zinc-700 prose-blockquote:text-zinc-400 prose-th:text-zinc-300 prose-td:text-zinc-400 prose-hr:border-zinc-800 prose-li:marker:text-zinc-500">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children, ...props }) => (
              <a
                {...props}
                href={href}
                rel="noopener noreferrer"
                target="_blank"
                onClick={(e) => {
                  e.preventDefault()
                  if (href) window.open(href, '_blank', 'noopener,noreferrer')
                }}
              >
                {children}
              </a>
            )
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
