// Shimmer loading skeletons. Use while data is in-flight to prevent layout
// shift and signal to the user that content is loading (not broken).

// Single table-style row skeleton
export function SkeletonRow({ cols = 4, heights }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-100 animate-pulse">
      {Array.from({ length: cols }, (_, i) => (
        <div
          key={i}
          className="bg-slate-200 rounded"
          style={{
            height: heights?.[i] ?? 14,
            flex: i === 0 ? '0 0 36px' : '1 1 0',
          }}
        />
      ))}
    </div>
  )
}

// Stack of skeleton rows for list/table loading states
export function SkeletonList({ rows = 8, cols = 4, heights }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} cols={cols} heights={heights} />
      ))}
    </div>
  )
}

// Card-shaped skeleton for grid/dashboard layouts
export function SkeletonCard({ lines = 3, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-100 p-4 animate-pulse ${className}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-slate-200 rounded w-3/4" />
          <div className="h-3 bg-slate-100 rounded w-1/2" />
        </div>
      </div>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`h-3 bg-slate-100 rounded mt-2 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

// Stat-card skeleton for the dashboard KPI tiles
export function SkeletonStat({ className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-100 p-4 animate-pulse ${className}`}>
      <div className="h-3 bg-slate-200 rounded w-16 mb-3" />
      <div className="h-8 bg-slate-200 rounded w-24 mb-1" />
      <div className="h-2.5 bg-slate-100 rounded w-12" />
    </div>
  )
}
