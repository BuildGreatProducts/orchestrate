import { useState, useEffect, useCallback } from 'react';
import { useCommands } from '@/stores/commands';
import { useTerminalStore } from '@/stores/terminal';

interface SavedCommand {
  id: string;
  name: string;
  command: string;
}

export function TerminalCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { commands } = useCommands();
  const { runCommand } = useTerminalStore();

  const filtered: SavedCommand[] = commands.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) ||
           c.command.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  const executeCommand = useCallback(async (cmd: SavedCommand) => {
    setIsOpen(false);
    setSearch('');
    setSelectedIndex(0);
    // Run the command in terminal
    await runCommand(cmd.command);
  }, [runCommand]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSearch('');
        setSelectedIndex(0);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        executeCommand(filtered[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, executeCommand]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      <div className="fixed inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
      <div className="relative w-full max-w-xl bg-[#1e1e1e] rounded-lg shadow-2xl border border-[#333] overflow-hidden">
        <div className="p-3 border-b border-[#333]">
          <input
            type="text"
            placeholder="Search saved commands... (⌘K to toggle)"
            className="w-full bg-transparent text-white placeholder-gray-500 outline-none text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-gray-500 text-sm">No commands found</div>
          ) : (
            filtered.map((cmd, idx) => (
              <button
                key={cmd.id}
                onClick={() => executeCommand(cmd)}
                className={`w-full px-4 py-2 text-left flex items-center justify-between group ${
                  idx === selectedIndex ? 'bg-blue-600' : 'hover:bg-[#2a2a2a]'
                }`}
              >
                <span className="text-white text-sm font-medium">{cmd.name}</span>
                <span className="text-gray-500 text-xs font-mono group-hover:text-gray-400">{cmd.command}</span>
              </button>
            ))
          )}
        </div>
        <div className="p-2 border-t border-[#333] text-xs text-gray-500 flex gap-3">
          <span>↑↓ navigate</span>
          <span>↵ run in terminal</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}