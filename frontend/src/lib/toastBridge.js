// Imperative toast bridge — allows non-React modules (Axios interceptors, etc.)
// to trigger toasts without a hook. ToastContext subscribes on mount.
const listeners = new Set()

export const toastBus = {
  emit: (type, title, message) => listeners.forEach((fn) => fn(type, title, message)),
  subscribe: (fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
