import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@cb/contexts/AuthContext';
import { getStudentEnrollments } from '@cb/services/assignmentService';
import type { EnrollmentDoc } from '@cb/types/firestore';

export default function StudentDataPage(): ReactNode {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const [enrollments, setEnrollments] = useState<Array<{ id: string; data: EnrollmentDoc }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.user_id) {
      void loadData(user.user_id);
    }
  }, [user]);

  const loadData = async (uid: string): Promise<void> => {
    try {
      setLoading(true);
      const enr = await getStudentEnrollments(uid);
      setEnrollments(enr);
    } catch (err) {
      console.error('Failed to load student data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>My Personal Data & Transparency View</h1>
          <p style={{ margin: 0, color: '#666' }}>GDPR / DPDP Right of Access Transparency Portal</p>
        </div>
        <button onClick={() => void signOut()} style={{ padding: '0.5rem 1rem' }}>Sign Out</button>
      </header>

      <section style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
        <h2>Identity Profile</h2>
        <p><strong>User UID:</strong> <code>{user?.user_id}</code></p>
        <p><strong>Email:</strong> {user?.email}</p>
        <p><strong>Assigned Role Claim:</strong> {role}</p>
      </section>

      <section style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
        <h2>Active Course Enrollments</h2>
        {loading ? (
          <div>Loading enrollments…</div>
        ) : enrollments.length === 0 ? (
          <p style={{ color: '#777' }}>No active section enrollments found.</p>
        ) : (
          <ul style={{ paddingLeft: '1.25rem' }}>
            {enrollments.map((e) => (
              <li key={e.id}>Section ID: <code>{e.data.sectionId}</code></li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ background: '#e3f2fd', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
        <h2>Request Data Export or Deletion</h2>
        <p>
          To obtain a downloadable JSON export of all your stored sessions, event logs, and progress history, or to request permanent account deletion, please provide your User UID (<code>{user?.user_id}</code>) to your section instructor or system administrator.
        </p>
        <p style={{ fontSize: '0.85rem', color: '#555' }}>
          Administrators execute these actions securely via local Node.js Admin SDK scripts (`exportStudent.js` / `deleteStudent.js`).
        </p>
      </section>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button onClick={() => void navigate('/student')} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Back to Dashboard
        </button>
        <button onClick={() => void navigate('/privacy')} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          View Privacy Notice
        </button>
      </div>
    </main>
  );
}
