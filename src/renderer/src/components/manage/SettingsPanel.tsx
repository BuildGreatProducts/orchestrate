import { useState } from 'react'
import ApiKeyPrompt from './ApiKeyPrompt'
import SkillsSettings from './SkillsSettings'

type SettingsTab = 'api-key' | 'skills'

interface SettingsPanelProps {
  onDone: () => void
}

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'api-key', label: 'API Key' },
  { id: 'skills', label: 'Skills' }
]

export default function SettingsPanel({ onDone }: SettingsPanelProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>('api-key')

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center border-b border-zinc-800">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-zinc-200 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={onDone}
          className="mr-3 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'api-key' && <ApiKeyPrompt onDone={onDone} />}
        {activeTab === 'skills' && <SkillsSettings />}
      </div>
    </div>
  )
}
