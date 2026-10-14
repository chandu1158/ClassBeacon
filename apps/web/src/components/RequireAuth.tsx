import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@cb/contexts/AuthContext';

interface Props {
  allowedRoles?: ReadonlyArray<'admin' | 'staff' | 'student'>;
}

/**
 * Route guard (UX-only — enforcement is in Firestore rules).
 * Redirects unauthenticated users to /login.
 * If allowedRoles is set, redirects users with wrong roles to /unauthorized.
 */
export default function RequireAuth({ allowedRoles }: Props): ReactNode {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <div role="status" aria-live="polite">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
