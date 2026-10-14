import type { ReactNode } from 'react';

export default function UnauthorizedPage(): ReactNode {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Access denied</h1>
      <p>You do not have permission to view this page. Contact your administrator.</p>
    </main>
  );
}
