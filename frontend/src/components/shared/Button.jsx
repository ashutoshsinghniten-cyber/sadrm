import React from 'react';

// ==================== CLASSY BUTTON — NAVY/GOLD/RED PALETTE ====================
const Button = ({ variant = 'primary', size = 'md', icon: Icon, children, onClick, disabled, className = '' }) => {
  const sizes = { sm: 'px-2.5 py-1 text-[11px]', md: 'px-3.5 py-1.5 text-xs', lg: 'px-5 py-2.5 text-sm' };
  const variants = {
    primary: 'bg-gradient-to-b from-blue-800 to-blue-950 text-white hover:from-blue-700 hover:to-blue-900 shadow-md shadow-blue-950/30 border border-blue-950',
    success: 'bg-gradient-to-b from-emerald-600 to-emerald-800 text-white hover:from-emerald-500 hover:to-emerald-700 shadow-md shadow-emerald-900/20 border border-emerald-900/40',
    warning: 'bg-gradient-to-b from-amber-500 to-amber-700 text-white hover:from-amber-400 hover:to-amber-600 shadow-md shadow-amber-900/20 border border-amber-900/30',
    danger: 'bg-gradient-to-b from-red-700 to-red-900 text-white hover:from-red-600 hover:to-red-800 shadow-md shadow-red-950/30 border border-red-950',
    dark: 'bg-gradient-to-b from-slate-800 to-slate-950 text-white hover:from-slate-700 hover:to-slate-900 shadow-md shadow-slate-950/30 border border-slate-950',
    gold: 'bg-gradient-to-b from-amber-400 to-amber-600 text-amber-950 hover:from-amber-300 hover:to-amber-500 shadow-md shadow-amber-900/25 border border-amber-700',
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 shadow-sm',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border border-transparent'
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${sizes[size]} ${variants[variant]} font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}>
      {Icon && <Icon size={size === 'lg' ? 14 : 12} />}
      {children}
    </button>
  );
};

export default Button;
