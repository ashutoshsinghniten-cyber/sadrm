import { useAuth } from '../context/AuthContext';

export function usePermission(code) {
  const { hasPermission } = useAuth();
  return hasPermission(code);
}

export function usePermissions(...codes) {
  const { hasPermission } = useAuth();
  return codes.reduce((acc, code) => ({ ...acc, [code]: hasPermission(code) }), {});
}
