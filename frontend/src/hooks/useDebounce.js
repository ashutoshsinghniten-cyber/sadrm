import { useState, useEffect } from 'react'

// Debounce a value. Returns the debounced copy after `delay` ms of no changes.
// Use for search inputs so the API is only called when the user pauses typing
// rather than on every keystroke — critical with 1B records in the archive.
export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
