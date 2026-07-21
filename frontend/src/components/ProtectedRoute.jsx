import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requiredRole, requiredPermission }) {
  const { auth, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!auth) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  if (requiredRole && auth.role !== requiredRole) {
    if (!(requiredRole === 'admin' && auth.role === 'superadmin')) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
}
