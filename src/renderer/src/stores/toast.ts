import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'error' | 'success' | 'info'
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, type: Toast['type']) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const toast: Toast = { id, message, type }

    set((state) => ({ toasts: [...state.toasts, toast] }))

    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, 5000)
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  }
}))

// Convenience helpers
export const toast = {
  error: (message: string): void => useToastStore.getState().addToast(message, 'error'),
  success: (message: string): void => useToastStore.getState().addToast(message, 'success'),
  info: (message: string): void => useToastStore.getState().addToast(message, 'info')
}
