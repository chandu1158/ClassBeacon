import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrivacyNoticePage from '@cb/pages/PrivacyNoticePage';

vi.mock('@cb/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'student123', email: 'student@school.edu' },
    role: 'student',
    loading: false,
    signOut: vi.fn(),
  }),
}));

describe('Privacy & Accessibility Checks (Stage 7)', () => {
  it('renders Privacy Notice Page with proper heading hierarchy', () => {
    render(
      <MemoryRouter>
        <PrivacyNoticePage />
      </MemoryRouter>,
    );

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('ClassBeacon Privacy & Data Protection Notice');

    const subHeadings = screen.getAllByRole('heading', { level: 2 });
    expect(subHeadings.length).toBeGreaterThanOrEqual(4);
  });

  it('renders accessible back button with aria-label', () => {
    render(
      <MemoryRouter>
        <PrivacyNoticePage />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: /go back/i });
    expect(button).toBeDefined();
  });
});
