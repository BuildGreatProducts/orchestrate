import { useAppStore } from '@renderer/stores/app'

export default function FolderSelector(): React.JSX.Element {
  const { currentFolder, setCurrentFolder } = useAppStore()

  const folderName = currentFolder ? currentFolder.split('/').pop() : 'Select a folder...'

  const handleClick = async (): Promise<void> => {
    const folder = await window.orchestrate.selectFolder()
    if (folder) {
      setCurrentFolder(folder)
    }
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 rounded px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
      title={currentFolder ?? 'No folder selected'}
    >
      <span className="text-zinc-500">&#9660;</span>
      <span className="max-w-[160px] truncate">{folderName}</span>
    </button>
  )
}
