import { useQuery, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query'

// Offset-paginated query.
//
// `queryKey` — stable array; page + limit are appended automatically so each
//              page is cached independently.
// `fetcher`  — async fn({ page, limit, signal }) → { items, total } or []
// `options`  — { page, limit, enabled }
//
// Returns the full TanStack Query result plus a `totalPages` helper.
export function usePaginatedQuery(queryKey, fetcher, { page = 0, limit = 50, enabled = true } = {}) {
  const result = useQuery({
    queryKey: [...queryKey, page, limit],
    queryFn: ({ signal }) => fetcher({ page, limit, signal }),
    enabled,
    placeholderData: keepPreviousData,
  })

  const total = result.data?.total
  const totalPages = total != null && limit > 0 ? Math.ceil(total / limit) : undefined

  return { ...result, totalPages }
}

// Infinite-scroll query.
//
// Each page load appends to `data.pages`. The component calls `fetchNextPage()`
// when the user scrolls near the bottom (see VirtualList's `onEndReached`).
//
// `getNextPageParam` defaults to offset-based: returns the next page number if
// the last page returned a full page of results, or undefined to stop.
export function useInfiniteListQuery(
  queryKey,
  fetcher,
  { limit = 50, enabled = true, getNextPageParam } = {},
) {
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 0, signal }) => fetcher({ page: pageParam, limit, signal }),
    initialPageParam: 0,
    enabled,
    getNextPageParam:
      getNextPageParam ??
      ((lastPage, _all, lastPageParam) => {
        const items = Array.isArray(lastPage?.items)
          ? lastPage.items
          : Array.isArray(lastPage)
          ? lastPage
          : []
        return items.length < limit ? undefined : lastPageParam + 1
      }),
  })
}

// Flatten all pages from useInfiniteListQuery into a single array.
export function flattenPages(data) {
  if (!data) return []
  return data.pages.flatMap((page) =>
    Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : [],
  )
}
