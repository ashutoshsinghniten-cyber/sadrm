import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { queryClient } from './lib/queryClient.js'
import { ToastProvider } from './context/ToastContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/*
      Provider order (outermost → innermost):
        QueryClientProvider  — server-state cache, available everywhere
        BrowserRouter        — routing context
        ToastProvider        — global toast notifications
        App                  — app routes + AuthProvider

      ToastProvider is inside BrowserRouter so toasts can use navigation hooks.
      QueryClientProvider wraps everything so React Query is available to all
      hooks including those inside AuthProvider.
    */}
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
