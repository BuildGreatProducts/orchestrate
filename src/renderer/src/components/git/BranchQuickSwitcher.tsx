import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Branch {
  name: string;
  isCurrent: boolean;
  isRemote?: boolean;
}

export function BranchQuickSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBranches = useCallback(async () => {
    try {
      setLoading(true);
      // Get local branches from git-manager IPC
      const result = await invoke<{ branches: Branch[] }>('git_list_branches', {
        showRemote: false,
      });
      setBranches(result.branches || []);
    } catch (err) {
      // Fallback: show a message that branches couldn't be loaded
      console.error('Failed to load branches:', err);
      setBranches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = branches.filter((b) => 
    b.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  const switchBranch = useCallback(async (branchName: string) => {
    try {
      await invoke('git_checkout', { branch: branchName });
      setIsOpen(false);
      setSearch('');
      // Reload branches after switch
      await loadBranches();
    } catch (err) {
      console.error('Failed to switch branch:', err);
    }
  }, [loadBranches]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+Shift+G: Open branch switcher
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        loadBranches();
        setIsOpen(true);
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
        switchBranch(filtered[selectedIndex].name);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, switchBranch, loadBranches]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      <div className="fixed inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
      <div className="relative w-full max-w-md bg-[#1e1e1e] rounded-lg shadow-2xl border border-[#333] overflow-hidden">
        <div className="p-3 border-b border-[#333]">
          <input
            type="text"
            placeholder="Switch branch... (⌘⇧G)"
            className="w-full bg-transparent text-white placeholder-gray-500 outline-none text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-gray-500 text-sm">Loading branches...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-gray-500 text-sm">No branches found</div>
          ) : (
            filtered.map((branch, idx) => (
              <button
                key={branch.name}
                onClick={() => switchBranch(branch.name)}
                className={`w-full px-4 py-2 text-left flex items-center justify-between ${
                  idx === selectedIndex ? 'bg-blue-600' : 'hover:bg-[#2a2a2a]'
                }`}
              >
                <span className="text-white text-sm font-medium">{branch.name}</span>
                {branch.isCurrent && (
                  <span className="text-xs text-green-400">current</span>
                )}
              </button>
            ))
          )}
        </div>
        <div className="p-2 border-t border-[#333] text-xs text-gray-500 flex gap-3">
          <span>⌘⇧G open</span>
          <span>↑↓ navigate</span>
          <span>↵ checkout</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}