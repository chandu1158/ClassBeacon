import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@cb/contexts/AuthContext';

export default function LoginPage(): ReactNode {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [userIdOrEmail, setUserIdOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await signIn(userIdOrEmail.trim(), password);
      // Redirect based on user role
      if (user.role === 'admin') {
        void navigate('/admin', { replace: true });
      } else if (user.role === 'staff') {
        void navigate('/staff', { replace: true });
      } else {
        void navigate('/student', { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid User ID/Email or Password';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fillSampleCredentials = (user: string, pass: string): void => {
    setUserIdOrEmail(user);
    setPassword(pass);
    setError(null);
  };

  return (
    <main
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          padding: '2.5rem',
          color: '#0f172a',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 800, color: '#0f172a' }}>
            ClassBeacon 🎓
          </h1>
          <p style={{ margin: '0.5rem 0 0 0', color: '#475569', fontSize: '0.95rem' }}>
            Sign in to access your college portal
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '0.875rem',
              background: '#fef2f2',
              borderLeft: '4px solid #ef4444',
              borderRadius: '6px',
              color: '#991b1b',
              fontSize: '0.875rem',
              marginBottom: '1.5rem',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label htmlFor="userIdOrEmail" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.375rem' }}>
              User ID / Roll No / Email
            </label>
            <input
              id="userIdOrEmail"
              type="text"
              value={userIdOrEmail}
              onChange={(e) => setUserIdOrEmail(e.target.value)}
              placeholder="e.g. ADMIN001 or STU2026001"
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1.5px solid #94a3b8',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                fontSize: '0.95rem',
                fontWeight: 600,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label htmlFor="password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.375rem' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  paddingRight: '4.5rem',
                  borderRadius: '8px',
                  border: '1.5px solid #94a3b8',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: '#e2e8f0',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  color: '#0f172a',
                  fontWeight: 700,
                }}
              >
                {showPassword ? '🙈 Hide' : '👁️ Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.875rem',
              fontSize: '1rem',
              fontWeight: 700,
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Quick Demo Login Credentials:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => fillSampleCredentials('admin', 'Admin@123')}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#f1f5f9',
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              🔑 Admin (admin / Admin@123)
            </button>
            <button
              type="button"
              onClick={() => fillSampleCredentials('STAFF001', '12345')}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#f1f5f9',
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              👨‍🏫 Staff (STAFF001 / 12345)
            </button>
            <button
              type="button"
              onClick={() => fillSampleCredentials('STU2026001', '12345')}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#f1f5f9',
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              🎓 Student (STU2026001 / 12345)
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
