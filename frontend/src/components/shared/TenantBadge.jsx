import { useAuth } from '../../context/AuthContext';

export default function TenantBadge() {
  const { auth } = useAuth();
  if (!auth?.tenantId) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-blue-900/30 text-blue-300 border border-blue-700/40 rounded tracking-wide uppercase">
      {auth.tenantId}
    </span>
  );
}
