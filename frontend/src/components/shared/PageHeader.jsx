import React from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

// ==================== STANDARD PAGE HEADER ====================
export const PageHeader = ({ title, eyebrow = null, description, actions = null, tone = 'light', className = '', logo = null }) => {
  const titleColor = tone === 'dark' ? 'text-white' : 'text-slate-800';
  const descColor = tone === 'dark' ? 'text-slate-400' : 'text-slate-500';
  const eyebrowColor = tone === 'dark' ? 'text-slate-400' : 'text-slate-500';
  return (
    <div className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5 md:mb-6 ${className}`}>
      <div className="min-w-0 flex items-end gap-3">
        {logo}
        <div className="min-w-0">
          {eyebrow && (
            <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${eyebrowColor} mb-1.5`}>
              {eyebrow}
            </div>
          )}
          <h2 className={`text-xl md:text-2xl font-black ${titleColor} tracking-tight leading-tight`}>{title}</h2>
          <div className="w-16 h-0.5 bg-gradient-to-r from-red-600 via-amber-400 to-blue-800 mt-1.5 opacity-80"></div>
          {description && <p className={`text-xs ${descColor} mt-2 leading-snug`}>{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
};

// SALogo — square red badge with "SA" text
export const SALogo = ({ size = 56 }) => (
  <div
    className="bg-red-700  flex items-center justify-center shadow-md shadow-red-900/30 flex-shrink-0"
    style={{ width: size, height: size }}
    aria-label="Salvation Army"
  >
    <span className="text-white font-black tracking-tight" style={{ fontSize: size * 0.42, letterSpacing: '0.02em' }}>SA</span>
  </div>
);

// Mapping from route id to sidebar group label
export const ROUTE_GROUP = {
  'dashboard':    'WORKSPACE',
  'pre-prep':     'WORKSPACE',
  'import':       'WORKSPACE',
  'extraction':   'PROCESSING',
  'hitl':         'PROCESSING',
  'qc':           'PROCESSING',
  'repository':   'ARCHIVE',
  'ai':           'ARCHIVE',
  'reports':      'INSIGHTS',
  'workflow':     'ADMIN',
  'users':        'ADMIN',
  'integrations': 'ADMIN',
  'settings':     'ADMIN'
};

export const Sparkline = ({ data, color, height = 30 }) => (
  <ResponsiveContainer width="100%" height={height}>
    <AreaChart data={data.map((v, i) => ({ i, v }))}>
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#grad-${color})`} />
    </AreaChart>
  </ResponsiveContainer>
);

export default PageHeader;
