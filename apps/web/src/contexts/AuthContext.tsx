import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken, setToken } from '@cb/lib/api';
import type { UserProfile, UserRole } from '@cb/types/user';

interface AuthContextValue {
  user: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (userIdOrEmail: string, password: string) => Promise<UserProfile>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setRole(null);
      setLoading(false);
      return;
    }

    try {
      const data = await api.get<{ user: UserProfile }>('/auth/me');
      setUser(data.user);
      setRole(data.user.role);
    } catch {
      setToken(null);
      setUser(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const signIn = useCallback(async (userIdOrEmail: string, password: string): Promise<UserProfile> => {
    const data = await api.post<{ token: string; user: UserProfile }>('/auth/login', {
      userIdOrEmail,
      password,
    });
    setToken(data.token);
    setUser(data.user);
    setRole(data.user.role);
    return data.user;
  }, []);

  const signOut = useCallback((): void => {
    setToken(null);
    setUser(null);
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
