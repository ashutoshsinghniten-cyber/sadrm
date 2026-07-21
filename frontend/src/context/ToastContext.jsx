import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { toastBus } from '../lib/toastBridge.js'

const ToastContext = createContext(null)

const CONFIG = {
  success: {
    Icon: CheckCircle2,
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    icon: 'text-emerald-500',
    duration: 4_000,
  },
  error: {
    Icon: AlertCircle,
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    icon: 'text-red-500',
    duration: 8_000,
  },
  warning: {
    Icon: AlertTriangle,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: 'text-amber-500',
    duration: 6_000,
  },
  info: {
    Icon: Info,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    icon: 'text-blue-500',
    duration: 4_000,
  },
}

let _id = 0

function Toast({ id, type, title, message, onDismiss }) {
  const { Icon, bg, border, text, icon, duration } = CONFIG[type] ?? CONFIG.info
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(id), duration)
    return () => clearTimeout(timerRef.current)
  }, [id, duration, onDismiss])

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-md max-w-[360px] w-full ${bg} ${border} ${text} pointer-events-auto`}
      style={{ animation: 'toastSlideIn 0.2s ease-out' }}
    >
      <Icon size={16} className={`mt-0.5 flex-shrink-0 ${icon}`} />
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold leading-tight">{title}</p>}
        {message && (
          <p className={`text-xs leading-snug mt-0.5 ${title ? 'opacity-80' : ''}`}>{message}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(id)}
        className="flex-shrink-0 p-0.5 rounded opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((type, title, message) => {
    const id = ++_id
    // Cap at 5 visible toasts; oldest is dropped to prevent UI overflow
    setToasts((prev) => [...prev.slice(-4), { id, type, title, message }])
    return id
  }, [])

  const api = {
    success: (title, message) => push('success', title, message),
    error: (title, message) => push('error', title, message),
    warning: (title, message) => push('warning', title, message),
    info: (title, message) => push('info', title, message),
    dismiss,
  }

  // Allow non-React code (e.g. Axios interceptors) to trigger toasts via toastBus
  useEffect(() => toastBus.subscribe((type, title, message) => push(type, title, message)), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Inject keyframe once */}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Toast stack — bottom-right corner, above everything */}
      <div
        aria-label="Notifications"
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: '360px', width: '100%' }}
      >
        {toasts.map((t) => (
          <Toast key={t.id} {...t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
