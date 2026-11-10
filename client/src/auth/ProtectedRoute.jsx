import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, HOME } from './AuthContext.jsx';
import { PageSpinner } from '../components/ui/Feedback.jsx';

/**
 * UI-level guard only. The API enforces the same rules (403/404), so this exists purely for navigation UX.
 */
export default function ProtectedRoute({ roles, permission }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  if (permission && user.role === 'staff' && !user.permissions?.includes(permission)) return <Navigate to={HOME.staff} replace />;
  return <Outlet />;
}
