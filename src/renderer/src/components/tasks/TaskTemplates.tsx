import { useState, useEffect } from 'react';
import { useTasksStore } from '@/stores/tasks';
import { toast } from '@/stores/toast';

export interface TaskTemplate {
  id: string;
  name: string;
  columnId: 'planning' | 'in-progress' | 'review' | 'done';
  steps?: { description: string; status: 'pending' | 'running' | 'completed' }[];
}

// Default templates
export const defaultTemplates: TaskTemplate[] = [
  { id: 'bug', name: '🐛 Report Bug', columnId: 'planning', steps: [
    { description: 'Reproduce the bug', status: 'pending' },
    { description: 'Identify root cause', status: 'pending' },
    { description: 'Write fix', status: 'pending' },
    { description: 'Add test case', status: 'pending' },
  ]},
  { id: 'feature', name: '✨ New Feature', columnId: 'planning', steps: [
    { description: 'Define requirements', status: 'pending' },
    { description: 'Design solution', status: 'pending' },
    { description: 'Implement feature', status: 'pending' },
    { description: 'Write tests', status: 'pending' },
    { description: 'Update docs', status: 'pending' },
  ]},
  { id: 'refactor', name: '🔧 Refactor', columnId: 'review', steps: [
    { description: 'Identify code to refactor', status: 'pending' },
    { description: 'Plan new structure', status: 'pending' },
    { description: 'Apply changes', status: 'pending' },
    { description: 'Verify tests pass', status: 'pending' },
  ]},
  { id: 'docs', name: '📝 Documentation', columnId: 'done', steps: [
    { description: 'Outline content', status: 'pending' },
    { description: 'Write draft', status: 'pending' },
    { description: 'Review and edit', status: 'pending' },
    { description: 'Publish', status: 'pending' },
  ]},
  { id: 'research', name: '🔍 Research', columnId: 'planning', steps: [
    { description: 'Gather requirements', status: 'pending' },
    { description: 'Research solutions', status: 'pending' },
    { description: 'Evaluate options', status: 'pending' },
    { description: 'Document findings', status: 'pending' },
  ]},
];

// Custom user templates (persisted in localStorage)
const STORAGE_KEY = 'orchestrate-task-templates';

function loadCustomTemplates(): TaskTemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: TaskTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function useTaskTemplates() {
  const [customTemplates, setCustomTemplates] = useState<TaskTemplate[]>(loadCustomTemplates);
  const createTask = useTasksStore((s) => s.createTask);
  
  const allTemplates = [...defaultTemplates, ...customTemplates];

  const createFromTemplate = async (template: TaskTemplate) => {
    try {
      await createTask(template.columnId, template.name);
      
      // If template has steps, add them after task creation
      if (template.steps && template.steps.length > 0) {
        // Get the created task - it's the last one in the column
        const board = useTasksStore.getState().board;
        if (board) {
          const columnTasks = board.columns[template.columnId];
          const taskId = columnTasks[columnTasks.length - 1];
          if (taskId && board.tasks[taskId]) {
            // Add steps to the task
            const task = board.tasks[taskId];
            // Update with steps - this would require additional API
            console.log('Would add steps to task:', taskId, template.steps);
          }
        }
      }
      
      toast.success(`Created: ${template.name}`);
    } catch (err) {
      console.error('Failed to create task from template:', err);
      toast.error('Failed to create task');
    }
  };

  const addCustomTemplate = (template: Omit<TaskTemplate, 'id'>) => {
    const newTemplate: TaskTemplate = {
      ...template,
      id: `custom-${Date.now()}`
    };
    const updated = [...customTemplates, newTemplate];
    setCustomTemplates(updated);
    saveCustomTemplates(updated);
    toast.success('Template saved');
  };

  const deleteCustomTemplate = (id: string) => {
    const updated = customTemplates.filter((t) => t.id !== id);
    setCustomTemplates(updated);
    saveCustomTemplates(updated);
    toast.success('Template deleted');
  };

  return {
    templates: allTemplates,
    customTemplates,
    createFromTemplate,
    addCustomTemplate,
    deleteCustomTemplate,
  };
}

// UI Component for template picker
export function TaskTemplatePicker({ 
  onSelect, 
  onClose 
}: { 
  onSelect: (template: TaskTemplate) => void;
  onClose: () => void;
}) {
  const { templates, createFromTemplate, addCustomTemplate, deleteCustomTemplate } = useTaskTemplates();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateColumn, setNewTemplateColumn] = useState<'planning' | 'in-progress' | 'review' | 'done'>('planning');

  const handleSelect = async (template: TaskTemplate) => {
    await createFromTemplate(template);
    onSelect(template);
    onClose();
  };

  const handleAddTemplate = () => {
    if (!newTemplateName.trim()) return;
    addCustomTemplate({
      name: newTemplateName,
      columnId: newTemplateColumn,
      steps: []
    });
    setNewTemplateName('');
    setShowAddForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#1e1e1e] rounded-lg shadow-2xl border border-[#333] overflow-hidden">
        <div className="p-3 border-b border-[#333] flex items-center justify-between">
          <h3 className="text-white font-medium">Task Templates</h3>
          <button onClick={() => setShowAddForm(!showAddForm)} className="text-gray-400 hover:text-white">
            {showAddForm ? '✕' : '+'}
          </button>
        </div>
        
        {showAddForm && (
          <div className="p-3 border-b border-[#333] bg-[#252525]">
            <input
              type="text"
              placeholder="Template name..."
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              className="w-full mb-2 px-2 py-1 bg-[#1a1a1a] text-white text-sm rounded"
            />
            <select
              value={newTemplateColumn}
              onChange={(e) => setNewTemplateColumn(e.target.value as any)}
              className="w-full mb-2 px-2 py-1 bg-[#1a1a1a] text-white text-sm rounded"
            >
              <option value="planning">Planning</option>
              <option value="in-progress">In Progress</option>
              <option value="review">Review</option>
              <option value="done">Done</option>
            </select>
            <button
              onClick={handleAddTemplate}
              className="w-full px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Save Template
            </button>
          </div>
        )}
        
        <div className="max-h-80 overflow-y-auto">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleSelect(template)}
              className="w-full px-4 py-2 text-left hover:bg-[#2a2a2a] flex items-center justify-between"
            >
              <span className="text-white text-sm">{template.name}</span>
              <span className="text-gray-500 text-xs capitalize">{template.columnId.replace('-', ' ')}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}