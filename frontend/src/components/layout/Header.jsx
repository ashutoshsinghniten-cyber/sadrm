import React, { useState } from 'react';
import { ChevronDown, Bell, Lock, Crown, User, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { APP_VERSION } from '../../constants/appConfig.js';
import { SALogo } from '../shared/PageHeader.jsx';

// ==================== HEADER ====================
const Header = ({ currentUser, allUsers = [], onSwitchUser = () => {}, onLogout = () => {}, reworkCount = 0, onClickBell = () => {}, onMenuClick = () => {} }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { auth: jwtAuth } = useAuth();

  const displayName = jwtAuth?.username || currentUser?.name || 'User';
  const displayRole = jwtAuth?.role === 'admin' ? 'Administrator'
    : jwtAuth?.role === 'superadmin' ? 'Super Administrator'
    : jwtAuth?.role === 'client' ? 'Client'
    : (jwtAuth?.role || currentUser?.role || 'User');
  const displayEmail = currentUser?.email || (jwtAuth?.username ? `${jwtAuth.username}@tsa.org` : '');
  const initials = displayName.charAt(0).toUpperCase();

  const roleTone = displayRole === 'Administrator' ? 'text-amber-700'
    : displayRole === 'Super Administrator' ? 'text-red-700'
    : displayRole === 'Client' ? 'text-purple-700'
    : displayRole === 'Supervisor' ? 'text-orange-700'
    : displayRole === 'Operator' ? 'text-emerald-700'
    : 'text-slate-600';
  const RoleIcon = (displayRole === 'Administrator' || displayRole === 'Super Administrator') ? Crown : User;

  return (
    <header className="bg-white border-b border-slate-200 flex-shrink-0 relative">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-red-700 via-amber-400 to-blue-900 opacity-70"></div>
      <div className="flex items-center justify-between px-3 md:px-6 py-2 md:py-3 gap-2">
        {/* Left: hamburger (mobile) + logo */}
        <div className="flex items-center gap-2">
          {/* Hamburger — only on small screens */}
          <button
            onClick={onMenuClick}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg md:hidden flex-shrink-0"
            title="Open menu"
          >
            <Menu size={18} />
          </button>
          <SALogo size={28} />
          <span className="text-lg font-black tracking-tight"><span className="text-red-700">Digi</span><span className="text-blue-900">Store</span></span>
          <span className="hidden sm:inline ml-1 px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-300 font-mono tracking-wider" title="Build version">{APP_VERSION}</span>
        </div>
        {/* Center title — hidden on small screens */}
        <div className="hidden lg:flex flex-col items-center flex-1 min-w-0 px-4">
          <h1 className="text-xs font-bold tracking-wider text-blue-900 text-center truncate">SALVATION ARMY — DONATION RECORDS MANAGEMENT (DRM) PLATFORM</h1>
          <div className="w-28 h-0.5 bg-gradient-to-r from-red-600 via-amber-400 to-blue-800 mt-0.5 opacity-80"></div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={onClickBell}
            disabled={reworkCount === 0}
            className={`relative p-2 hover:bg-slate-100  transition-colors ${reworkCount === 0 ? 'cursor-default' : 'cursor-pointer'}`}
            title={reworkCount === 0 ? 'No rework pending' : `${reworkCount} record${reworkCount === 1 ? '' : 's'} returned for rework — click to open HITL Review`}
          >
            <Bell size={15} className={reworkCount > 0 ? 'text-orange-600' : 'text-slate-400'} />
            {reworkCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 bg-orange-600 text-white text-[9px] font-black  ring-2 ring-white flex items-center justify-center tabular-nums shadow-sm"
              >
                {reworkCount > 99 ? '99+' : reworkCount}
              </span>
            )}
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-2 hover:bg-slate-50  px-1.5 py-1 transition-colors"
              title="Account menu"
            >
              <div className="text-right leading-tight hidden sm:block">
                <div className="text-[11px] font-bold text-slate-800 truncate max-w-[140px]">{displayName}</div>
                <div className={`text-[9px] font-semibold uppercase tracking-wider flex items-center gap-1 justify-end ${roleTone}`}>
                  <RoleIcon size={8} />{displayRole}
                </div>
              </div>
              <div className="w-9 h-9 bg-red-700  flex items-center justify-center shadow-sm">
                <span className="text-white font-black text-base">{initials}</span>
              </div>
              <ChevronDown size={11} className="text-slate-400" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200  shadow-xl z-50 overflow-hidden">
                  <div className="px-3 py-3 border-b border-slate-200 bg-gradient-to-br from-slate-50 to-white">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 bg-red-700 flex items-center justify-center shadow-sm flex-shrink-0">
                        <span className="text-white font-black text-base">{initials}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-bold text-slate-800 truncate">{displayName}</div>
                        {displayEmail && <div className="text-[10px] text-slate-500 truncate">{displayEmail}</div>}
                        <div className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 ${roleTone} flex items-center gap-1`}>
                          <RoleIcon size={8} />{displayRole}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => { onLogout(); setMenuOpen(false); }}
                    className="w-full px-3 py-2.5 text-left text-[11px] font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors flex items-center gap-2"
                  >
                    <Lock size={11} />Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
