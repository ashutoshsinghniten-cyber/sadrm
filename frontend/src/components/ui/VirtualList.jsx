import { useRef, useEffect, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

// Enterprise virtual list — renders only the rows visible in the viewport.
// Handles 1 billion items without OOM by recycling DOM nodes.
//
// Props:
//   items         — array of data items
//   estimateSize  — fn(index) → estimated row height in px  [default: 56]
//   renderRow     — fn({ item, index }) → ReactNode
//   overscan      — extra rows rendered above/below viewport for smooth scroll [default: 5]
//   className     — CSS class applied to the scrollable container
//   style         — inline style for the scrollable container (use for height)
//   onEndReached  — called when user scrolls within `endReachedThreshold` px of the bottom
//   endReachedThreshold — px from bottom to trigger onEndReached [default: 300]
//   getItemKey    — fn(item, index) → stable key string/number [default: index]
//
// Example:
//   <VirtualList
//     items={records}
//     style={{ height: '100%' }}
//     renderRow={({ item }) => <RecordRow record={item} />}
//     onEndReached={fetchNextPage}
//   />

export function VirtualList({
  items,
  estimateSize,
  renderRow,
  overscan = 5,
  className = '',
  style,
  onEndReached,
  endReachedThreshold = 300,
  getItemKey,
}) {
  const parentRef = useRef(null)
  const onEndReachedRef = useRef(onEndReached)
  onEndReachedRef.current = onEndReached

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: estimateSize ?? (() => 56),
    overscan,
    getItemKey: getItemKey ? (index) => getItemKey(items[index], index) : undefined,
  })

  // Trigger onEndReached when scrolled near the bottom
  const handleScroll = useCallback(() => {
    if (!onEndReachedRef.current || !parentRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current
    if (scrollHeight - scrollTop - clientHeight <= endReachedThreshold) {
      onEndReachedRef.current()
    }
  }, [endReachedThreshold])

  useEffect(() => {
    const el = parentRef.current
    if (!el || !onEndReached) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll, onEndReached])

  return (
    <div
      ref={parentRef}
      className={`overflow-auto ${className}`}
      style={style}
    >
      {/* Spacer that tells the browser the full scroll height */}
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {renderRow({ item: items[virtualRow.index], index: virtualRow.index })}
          </div>
        ))}
      </div>
    </div>
  )
}

// Table variant — wraps VirtualList in a <table> structure so rows render
// inside <tbody> with proper column alignment. Use when columns must align
// with a sticky <thead>.
//
// Props:
//   columns  — [{ key, header, width?, className? }]
//   items    — array of row data
//   renderCell — fn({ item, column, index }) → ReactNode
//   ...rest  — passed to VirtualList

export function VirtualTable({
  columns,
  items,
  renderCell,
  className = '',
  style,
  ...listProps
}) {
  return (
    <div className={`flex flex-col ${className}`} style={style}>
      {/* Sticky header */}
      <div className="flex-shrink-0 bg-slate-50 border-b border-slate-200">
        <div className="flex" role="row">
          {columns.map((col) => (
            <div
              key={col.key}
              role="columnheader"
              className={`px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex-shrink-0 ${col.className ?? ''}`}
              style={{ width: col.width, flex: col.width ? undefined : '1 1 0' }}
            >
              {col.header}
            </div>
          ))}
        </div>
      </div>

      {/* Virtualized rows */}
      <VirtualList
        items={items}
        className="flex-1"
        renderRow={({ item, index }) => (
          <div className="flex border-b border-slate-100 hover:bg-slate-50/60 transition-colors" role="row">
            {columns.map((col) => (
              <div
                key={col.key}
                role="cell"
                className={`px-3 py-3 flex-shrink-0 ${col.className ?? ''}`}
                style={{ width: col.width, flex: col.width ? undefined : '1 1 0' }}
              >
                {renderCell({ item, column: col, index })}
              </div>
            ))}
          </div>
        )}
        {...listProps}
      />
    </div>
  )
}
