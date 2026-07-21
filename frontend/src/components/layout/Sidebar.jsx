import React from 'react';
import {
  ChevronLeft, ChevronRight, X,
  LayoutDashboard, ClipboardCheck, ShieldCheck, Settings,
  Upload, BarChart3, Archive as ArchiveIcon, Scissors,
  Activity, DollarSign, Users, Plug, Zap, Building2, Lock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

// Role hierarchy — higher index = more privileged
const ROLE_RANK = { user: 0, client: 1, admin: 2, superadmin: 3 };
const rankOf = (role) => ROLE_RANK[role] ?? 0;

const Sidebar = ({ route, setRoute, collapsed, setCollapsed, pendingCounts, sidebarOpen, setSidebarOpen }) => {
  const { hasPermission, auth } = useAuth();
  const navigateTo = useNavigate();

  const currentRank = rankOf(auth?.role);

  const allSections = [
    { group: 'WORKSPACE', items: [
      { id: 'dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
      { id: 'pre-prep',   icon: Scissors,        label: 'Pre-Preparation', badge: pendingCounts.preprep, permission: 'BATCH_UPDATE' },
      { id: 'import',     icon: Upload,           label: 'Import Batches',  permission: 'BATCH_CREATE' },
    ] },
    { group: 'PROCESSING', items: [
      { id: 'extraction', icon: Zap,            label: 'AI Extraction',  badge: pendingCounts.extraction, live: pendingCounts.extraction > 0, permission: 'AI_EXTRACT' },
      { id: 'hitl',       icon: ClipboardCheck, label: 'HITL Review',    badge: pendingCounts.hitl, permission: 'BATCH_UPDATE' },
      { id: 'qc',         icon: ShieldCheck,    label: 'QC Approval',    badge: pendingCounts.qc,  permission: 'BATCH_UPDATE' },
    ] },
    { group: 'ARCHIVE', items: [
      { id: 'repository', icon: ArchiveIcon, label: 'Digital Repository', permission: 'ARCHIVED_RECORD_READ' },
    ] },
    { group: 'ADMIN', items: [
      { id: 'workflow',    icon: Activity,    label: 'Batch Manager',       permission: 'BATCH_READ' },
      { id: 'users',       icon: Users,       label: 'User Management',     permission: 'USER_READ',       minRole: 'admin' },
      { id: 'roles',       icon: ShieldCheck, label: 'Roles',               permission: 'ROLE_READ',       minRole: 'admin' },
      { id: 'permissions', icon: Lock,        label: 'Permissions',         permission: 'PERMISSION_READ', minRole: 'admin' },
      { id: 'tenants',     icon: Building2,   label: 'Tenants',             permission: 'TENANT_READ',     minRole: 'admin' },
      { id: 'reports',     icon: BarChart3,   label: 'Reports & Analytics', permission: 'REPORT_VIEW' },
      { id: 'integrations',icon: Plug,        label: 'Integrations' },
      { id: 'billing',     icon: DollarSign,  label: 'Session Billing' },
      { id: 'settings',    icon: Settings,    label: 'Settings',            permission: 'PAGE_SETTINGS' },
    ] },
  ];

  const sections = allSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        // Role gate — hard block if caller is below minRole
        if (item.minRole && currentRank < rankOf(item.minRole)) return false;
        // Permission gate — skipped when minRole is already satisfied (role is authoritative)
        if (item.permission && !item.minRole && !hasPermission(item.permission)) return false;
        return true;
      }),
    }))
    .filter(section => section.items.length > 0);

  // On mobile, clicking a nav item also closes the drawer
  const handleNavClick = (id) => {
    setRoute(id);
    if (setSidebarOpen) setSidebarOpen(false);
  };

  // On md+ screens the sidebar is in the flex flow; on mobile it's a fixed overlay.
  // collapsed only applies on md+ (icon-only mode).
  const isExpandedOnDesktop = !collapsed;

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen && setSidebarOpen(false)}
        />
      )}

      <aside className={[
        'flex-shrink-0 flex flex-col transition-all duration-200',
        // Mobile: fixed overlay drawer
        'fixed inset-y-0 left-0 z-50',
        // md+: back in the flex flow
        'md:relative md:inset-y-auto md:left-auto md:z-auto',
        // Width: 64 on mobile drawer, controlled by collapsed on md+
        'w-64',
        isExpandedOnDesktop ? 'md:w-56' : 'md:w-14',
        // Slide logic: mobile slides based on sidebarOpen; md+ always visible
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-blue-950 to-slate-950"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(30,64,175,0.15),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(245,158,11,0.06),transparent_50%)]"></div>
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-slate-700/50 to-transparent"></div>

        {/* Sidebar header */}
        <div className={`relative h-12 flex items-center ${collapsed ? 'md:justify-center' : 'justify-between px-3'} border-b border-slate-800/60`}>
          {/* Mobile: show "Console" label + close button; Desktop: show label only when expanded */}
          <span className={`text-[10px] font-bold text-slate-400 uppercase tracking-widest ${collapsed ? 'md:hidden' : ''}`}>Console</span>
          <div className="flex items-center gap-1">
            {/* Close button on mobile */}
            <button
              onClick={() => setSidebarOpen && setSidebarOpen(false)}
              className="md:hidden text-slate-400 hover:text-white p-1 rounded hover:bg-white/5"
              title="Close menu"
            >
              <X size={14} />
            </button>
            {/* Collapse toggle on md+ */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden md:flex text-slate-400 hover:text-white p-1 rounded hover:bg-white/5"
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
        </div>

        <nav className="relative flex-1 py-3 overflow-y-auto scroll-dark">
          {sections.map((section, si) => (
            <div key={si} className="mb-3">
              {/* Show group label when expanded (mobile always expanded, desktop only when not collapsed) */}
              <div className={`px-4 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] ${collapsed ? 'md:hidden' : ''}`}>
                {section.group}
              </div>
              {section.items.map(item => {
                const Icon = item.icon;
                const active = route === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`group w-full flex items-center ${collapsed ? 'md:justify-center md:px-2' : 'px-4 gap-3'} py-2.5 md:py-2 text-xs font-medium transition-all relative`}
                    title={collapsed && item.badge != null && item.badge > 0 ? `${item.label} (${item.badge})` : collapsed ? item.label : undefined}
                  >
                    {active && (
                      <>
                        <span className="absolute inset-0 bg-gradient-to-r from-blue-700/30 via-blue-600/15 to-transparent"></span>
                        <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-gradient-to-b from-amber-300 to-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.5)]"></span>
                      </>
                    )}
                    <div className="relative flex-shrink-0">
                      <Icon size={14} className={`${active ? 'text-white' : item.live ? 'text-slate-200' : 'text-slate-400 group-hover:text-slate-200'}`} />
                      {item.live && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-slate-200 animate-pulse shadow-[0_0_6px_rgba(226,232,240,0.8)]"></span>}
                    </div>
                    {/* Badge in collapsed mode (md+) */}
                    {collapsed && item.badge != null && item.badge > 0 && !item.live && (
                      <span className={`absolute right-1 top-1 h-4 bg-amber-400 text-slate-900 text-[9px] font-black hidden md:flex items-center justify-center shadow-md shadow-amber-500/50 ring-1 ring-slate-900 leading-none ${item.badge < 10 ? 'w-4' : 'min-w-[16px] px-1'}`}>
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                    {/* Label — always shown on mobile, shown on md+ only when not collapsed */}
                    <span className={`relative flex-1 text-left truncate ${active ? 'text-white font-semibold' : 'text-slate-400 group-hover:text-slate-100'} ${collapsed ? 'md:hidden' : ''}`}>
                      {item.label}
                    </span>
                    {/* Badge in expanded mode */}
                    {item.badge != null && item.badge > 0 && (
                      <span className={`relative text-[9px] font-bold px-1.5 py-0.5 ${collapsed ? 'md:hidden' : ''} ${item.live ? 'bg-slate-200 text-slate-900 shadow-md shadow-slate-300/30' : active ? 'bg-amber-400 text-slate-900 shadow-md shadow-amber-500/30' : 'bg-blue-600/30 text-blue-200 border border-blue-400/30'}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
