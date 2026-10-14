import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// We test the RequireAuth guard logic with mocked auth
vi.mock('@cb/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { useAuth } from '@cb/contexts/AuthContext';
import RequireAuth from '@cb/components/RequireAuth';

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

interface AuthState {
  user: import('firebase/auth').User | null;
  role: 'admin' | 'staff' | 'student' | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

function Wrapper({ auth }: { auth: AuthState }): ReactNode {
  mockUseAuth.mockReturnValue(auth);
  return (
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/unauthorized" element={<div>Unauthorized page</div>} />
        <Route element={<RequireAuth />}>
          <Route path="/protected" element={<div>Protected content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while auth is loading', () => {
    render(
      <Wrapper auth={{ user: null, role: null, loading: true, signIn: vi.fn(), signOut: vi.fn() }} />,
    );
    expect(screen.getByRole('status').textContent).toContain('Loading');
  });

  it('redirects unauthenticated user to /login', () => {
    render(
      <Wrapper auth={{ user: null, role: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }} />,
    );
    expect(screen.getByText('Login page')).toBeDefined();
  });

  it('renders protected content for authenticated user', () => {
    render(
      <Wrapper
        auth={{
          user: { email: 'student@example.com' } as unknown as import('firebase/auth').User,
          role: 'student',
          loading: false,
          signIn: vi.fn(),
          signOut: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText('Protected content')).toBeDefined();
  });

  it('redirects wrong-role user to /unauthorized', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'student@example.com' },
      role: 'student',
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={['/staff-only']}>
        <Routes>
          <Route path="/unauthorized" element={<div>Unauthorized page</div>} />
          <Route element={<RequireAuth allowedRoles={['staff', 'admin']} />}>
            <Route path="/staff-only" element={<div>Staff only content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Unauthorized page')).toBeDefined();
  });
});
