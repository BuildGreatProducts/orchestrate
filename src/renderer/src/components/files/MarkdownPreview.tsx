import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownPreviewProps {
  content: string
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps): React.JSX.Element {
  return (
    <div className="h-full overflow-auto bg-zinc-950 px-10 py-6">
      <div className="markdown-preview max-w-3xl">
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      </div>
    </div>
  )
}
