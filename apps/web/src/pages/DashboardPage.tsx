import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@cb/contexts/AuthContext';

export default function DashboardPage(): ReactNode {
  const { role, loading } = useAuth();

  if (loading) {
    return <div role="status" style={{ padding: '2rem' }}>Loading ClassBeacon Portal...</div>;
  }

  if (role === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  if (role === 'staff') {
    return <Navigate to="/staff" replace />;
  }
  return <Navigate to="/student" replace />;
}
