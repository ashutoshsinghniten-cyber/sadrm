import { Flag } from 'lucide-react';

// Cross-stage flag indicator/toggle. Two modes:
//   - Pure display: pass only `flagged` — renders an amber pill when true, nothing when false.
//   - Toggle button: also pass `onToggle` — renders a clickable pill in both states so the
//     operator can flag/unflag from any stage screen.
export default function FlagBadge({ flagged, onToggle, reason, size = 'sm', className = '' }) {
  if (!onToggle && !flagged) return null;

  const sizeClasses = size === 'md' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]';
  const iconSize = size === 'md' ? 12 : 10;

  const base = `inline-flex items-center gap-1 font-bold uppercase tracking-wide rounded border transition-colors ${sizeClasses}`;
  const activeClasses = 'bg-amber-500/20 text-amber-700 border-amber-500/50';
  const inactiveClasses = 'bg-transparent text-slate-400 border-slate-300 hover:text-amber-600 hover:border-amber-400';

  if (!onToggle) {
    return (
      <span className={`${base} ${activeClasses} ${className}`} title={reason || 'Flagged'}>
        <Flag size={iconSize} />
        Flagged
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(!flagged); }}
      className={`${base} ${flagged ? activeClasses : inactiveClasses} ${className}`}
      title={flagged ? (reason ? `Flagged: ${reason}` : 'Flagged — click to unflag') : 'Click to flag'}
    >
      <Flag size={iconSize} />
      {flagged ? 'Flagged' : 'Flag'}
    </button>
  );
}
