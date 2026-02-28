import { useToastStore, type Toast } from '@renderer/stores/toast'

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }): React.JSX.Element {
  const bgColor =
    toast.type === 'error'
      ? 'bg-red-900/90 border-red-700/50'
      : toast.type === 'success'
        ? 'bg-emerald-900/90 border-emerald-700/50'
        : 'bg-zinc-800/90 border-zinc-700/50'

  const textColor =
    toast.type === 'error'
      ? 'text-red-200'
      : toast.type === 'success'
        ? 'text-emerald-200'
        : 'text-zinc-200'

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-right fade-in duration-200 ${bgColor}`}
    >
      <p className={`flex-1 text-sm ${textColor}`}>{toast.message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 3l8 8M11 3l-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}

export default function ToastContainer(): React.JSX.Element {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return <></>

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" style={{ maxWidth: 380 }}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </div>
  )
}
