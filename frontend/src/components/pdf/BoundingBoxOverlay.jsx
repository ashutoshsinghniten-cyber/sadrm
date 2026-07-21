import React, { useMemo } from 'react';
import { FileText } from 'lucide-react';

// ===== BoundingBoxOverlay — renders interactive boxes over a PDF page =====
const BoundingBoxOverlay = ({ boxes, fieldDefs, activeFieldKey, activePageCode, confidences = {}, onActivate }) => {
  const labelByKey = useMemo(() => {
    const m = {};
    for (const fd of fieldDefs) m[fd.key] = fd.label;
    return m;
  }, [fieldDefs]);

  const visibleBox = useMemo(() => {
    if (!activeFieldKey) return null;
    const b = boxes?.[activeFieldKey];
    if (!b || b.page !== activePageCode || b.w <= 0 || b.h <= 0) return null;
    return { key: activeFieldKey, ...b };
  }, [boxes, activeFieldKey, activePageCode]);

  if (!visibleBox) return null;

  const colorFor = (conf) => {
    if (conf >= 90) return { border: '#10b981', bg: 'rgba(16, 185, 129, 0.10)', activeBorder: '#047857' };
    if (conf >= 70) return { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.10)', activeBorder: '#b45309' };
    return { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.10)', activeBorder: '#b91c1c' };
  };

  const b = visibleBox;
  const c = colorFor(confidences[b.key] || 0);
  const label = labelByKey[b.key] || b.key;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div
        key={b.key}
        className="absolute pointer-events-auto cursor-pointer transition-all duration-150"
        style={{
          left: `${Math.max(0, b.x * 100 + 0.1)}%`,
          top: `${Math.max(0, b.y * 100 + 0.1)}%`,
          width: `${Math.max(0, b.w * 100 - 0.2)}%`,
          height: `${Math.max(0, b.h * 100 - 0.2)}%`,
          border: `2px solid #1e40af`,
          background: 'rgba(30, 64, 175, 0.10)',
          borderRadius: '1px',
          boxShadow: '0 0 0 1px rgba(30, 64, 175, 0.15)',
          zIndex: 20
        }}
        onClick={() => onActivate?.(b.key)}
        title={`${label} · ${confidences[b.key] || 0}%`}
      >
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '2px',
            background: '#1e40af',
            color: 'white',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.02em',
            padding: '2px 6px',
            borderRadius: '3px 3px 3px 0',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            pointerEvents: 'none'
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
};

export default BoundingBoxOverlay;
