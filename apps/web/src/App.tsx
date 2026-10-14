import type { ReactNode } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@cb/contexts/AuthContext';
import { router } from '@cb/router';

export default function App(): ReactNode {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
