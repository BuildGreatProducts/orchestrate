export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  variant = 'danger',
  onConfirm,
  onCancel
}: {
  title: string
  description: string
  confirmLabel: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}): React.JSX.Element {
  const confirmClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-500'
      : 'bg-blue-600 hover:bg-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-zinc-200">{title}</h3>
        <p className="mt-2 text-sm text-zinc-400">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded px-3 py-1.5 text-sm font-medium text-white ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
