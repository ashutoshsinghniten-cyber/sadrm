import { useState } from 'react'
import { useDebounce } from './useDebounce.js'
import { useInfiniteListQuery, flattenPages } from './usePaginatedQuery.js'
import { archiveApi } from '../lib/api.js'

// Paginated, debounced archive search.
//
// Combines:
//   • useDebounce — waits 350ms after the user stops typing before querying
//   • useInfiniteListQuery — cursor/offset pagination so only one page of
//     records is in memory at a time, not all 100 crore
//   • flattenPages — presents a flat array to the component
//
// Usage:
//   const { query, setQuery, items, isFetching, fetchNextPage, hasNextPage } = useArchiveSearch()
//
// The component only needs to render `items` in a VirtualList and call
// `fetchNextPage()` from `onEndReached`.

const LIMIT = 50

export function useArchiveSearch(filters) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 350)

  const result = useInfiniteListQuery(
    ['archive', 'search', debouncedQuery, filters],
    ({ page, limit, signal }) =>
      archiveApi.list({ page, limit, search: debouncedQuery || undefined, filters, signal }),
    { limit: LIMIT },
  )

  return {
    query,
    setQuery,
    items: flattenPages(result.data),
    total: result.data?.pages?.[0]?.total,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
  }
}
