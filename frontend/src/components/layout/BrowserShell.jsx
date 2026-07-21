import React from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { APP_VERSION } from '../../constants/appConfig.js';
import { SALogo } from '../shared/PageHeader.jsx';
import RepositoryScreen from '../../screens/Repository/RepositoryScreen.jsx';

// ==================== BROWSER SHELL (v3.13.15) ====================
const BrowserShell = ({
  currentUser,
  archivedRecords = [],
  onLogout = () => {},
  aiPanelRequest = false,
  clearAiPanelRequest = () => {},
  sseActive = false
}) => {
  const { auth: jwtAuth } = useAuth();
  const displayName = jwtAuth?.username || currentUser?.name || 'User';
  const displayEmail = jwtAuth?.username ? `${jwtAuth.username}@tsa.org` : (currentUser?.email || '');
  const initials = displayName.slice(0, 2).toUpperCase();
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <header className="bg-white border-b border-slate-200 flex-shrink-0 relative">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-red-700 via-amber-400 to-blue-900 opacity-70"></div>
        <div className="flex items-center justify-between px-6 py-2.5">
          <div className="flex items-center gap-2">
            <SALogo size={28} />
            <span className="text-lg font-black tracking-tight">
              <span className="text-red-700">Digi</span><span className="text-blue-900">Find</span>
            </span>
            <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-700  border border-slate-300 font-mono tracking-wider">{APP_VERSION}</span>
            <span className="ml-2 px-2 py-0.5 text-[9px] font-bold bg-blue-50 text-blue-800  border border-blue-200 uppercase tracking-wider">Browser Mode</span>
          </div>
          <div className="hidden md:flex flex-col items-center">
            <h1 className="text-[11px] font-bold tracking-wider text-blue-900">SALVATION ARMY · DONATION RECORDS</h1>
            <div className="w-24 h-0.5 bg-gradient-to-r from-red-600 via-amber-400 to-blue-800 mt-0.5 opacity-80"></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-[11px] font-semibold text-slate-700">{displayName}</div>
              <div className="text-[9px] text-slate-500">{displayEmail}</div>
            </div>
            <div className="w-8 h-8  bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center ring-2 ring-slate-200 text-white font-bold text-xs">
              {initials}
            </div>
            <button
              onClick={onLogout}
              className="text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5  border border-slate-300 hover:border-red-300 transition-colors"
              title="Log out"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <RepositoryScreen
          archivedRecords={archivedRecords}
          requestEditOnArchivedRecord={() => {}}
          aiPanelRequest={aiPanelRequest}
          clearAiPanelRequest={clearAiPanelRequest}
          browserMode={true}
          sseActive={sseActive}
        />
      </div>
    </div>
  );
};

export default BrowserShell;
