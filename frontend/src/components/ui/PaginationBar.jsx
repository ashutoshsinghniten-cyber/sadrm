import { ChevronLeft, ChevronRight } from 'lucide-react'

// Pagination controls for offset-based list screens.
//
// Props:
//   page         — current page (0-indexed)
//   totalPages   — total number of pages (optional)
//   total        — total number of items (optional, for "1–50 of 100K" label)
//   limit        — current page size
//   onPage       — fn(pageNumber) called when user navigates
//   onLimitChange — fn(newLimit) called when user changes page size (optional)
//   limitOptions — available page sizes [default: [25, 50, 100, 250]]

const MAX_PAGE_PILLS = 5

export function PaginationBar({
  page,
  totalPages,
  total,
  limit,
  onPage,
  onLimitChange,
  limitOptions = [25, 50, 100, 250],
}) {
  const safeTotal = totalPages ?? 1
  const from = total != null ? page * limit + 1 : null
  const to = total != null ? Math.min((page + 1) * limit, total) : null

  // Build the visible page-pill range, centered around the current page
  const pills = buildPagePills(page, safeTotal, MAX_PAGE_PILLS)

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 bg-white text-xs text-slate-600 gap-4 flex-wrap">
      {/* Left: rows-per-page + total count */}
      <div className="flex items-center gap-3">
        {onLimitChange && (
          <>
            <span className="text-slate-400 whitespace-nowrap">Rows per page</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {limitOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </>
        )}
        {from != null && (
          <span className="text-slate-500 tabular-nums whitespace-nowrap">
            {from.toLocaleString()}–{to.toLocaleString()} of{' '}
            <span className="font-semibold">{total.toLocaleString()}</span>
          </span>
        )}
      </div>

      {/* Right: prev / page pills / next */}
      <div className="flex items-center gap-0.5">
        <NavBtn onClick={() => onPage(0)} disabled={page === 0} title="First page">
          «
        </NavBtn>
        <NavBtn onClick={() => onPage(page - 1)} disabled={page === 0} title="Previous page">
          <ChevronLeft size={13} />
        </NavBtn>

        {pills.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-slate-400 select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`min-w-[28px] h-7 px-1.5 rounded transition-colors text-xs font-medium tabular-nums ${
                p === page
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'hover:bg-slate-100 text-slate-600'
              }`}
            >
              {p + 1}
            </button>
          ),
        )}

        <NavBtn
          onClick={() => onPage(page + 1)}
          disabled={page >= safeTotal - 1}
          title="Next page"
        >
          <ChevronRight size={13} />
        </NavBtn>
        <NavBtn
          onClick={() => onPage(safeTotal - 1)}
          disabled={page >= safeTotal - 1}
          title="Last page"
        >
          »
        </NavBtn>
      </div>
    </div>
  )
}

function NavBtn({ onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center w-7 h-7 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-mono"
    >
      {children}
    </button>
  )
}

function buildPagePills(current, total, maxPills) {
  if (total <= maxPills) return Array.from({ length: total }, (_, i) => i)

  const half = Math.floor(maxPills / 2)
  let start = Math.max(0, current - half)
  let end = start + maxPills - 1

  if (end >= total) {
    end = total - 1
    start = Math.max(0, end - maxPills + 1)
  }

  const pills = []
  if (start > 0) { pills.push(0); if (start > 1) pills.push('…') }
  for (let i = start; i <= end; i++) pills.push(i)
  if (end < total - 1) { if (end < total - 2) pills.push('…'); pills.push(total - 1) }
  return pills
}
