import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@cb/contexts/AuthContext';
import { api } from '@cb/lib/api';
import ChangePasswordModal from '@cb/components/ChangePasswordModal';

interface AssignmentItem {
  id: number;
  section_id: number;
  title: string;
  source_url: string;
  duration_sec: number;
  completion_threshold: number;
  required_watch_minutes?: number;
  section_name?: string;
}

interface SectionLink {
  id: number;
  section_id: number;
  teacher_id: number;
  title: string;
  url: string;
  description?: string;
  teacher_name?: string;
  section_name?: string;
  section_code?: string;
  created_at: string;
}

interface StudentReportItem {
  id: number;
  section_id: number;
  assignment_id?: number | null;
  assignment_title?: string;
  section_name?: string;
  text: string;
  status: 'pending' | 'reviewed' | 'resolved';
  created_at: string;
}

export default function StudentDashboardPage(): ReactNode {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [links, setLinks] = useState<SectionLink[]>([]);
  const [myReports, setMyReports] = useState<StudentReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  useEffect(() => {
    void fetchStudentData();
  }, []);

  const fetchStudentData = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch assigned video lessons for enrolled sections
      const data = await api.get<AssignmentItem[]>('/assignments/student');
      setAssignments(Array.isArray(data) ? data : []);

      // 2. Fetch section links assigned by the teacher for student's section
      const linkData = await api.get<SectionLink[]>('/links');
      setLinks(Array.isArray(linkData) ? linkData : []);

      // 3. Fetch reports submitted by the student
      const repData = await api.get<StudentReportItem[]>('/reports/my');
      setMyReports(Array.isArray(repData) ? repData : []);
    } catch (err: unknown) {
      console.error('Failed to load student data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load video lessons.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top Header */}
      <header
        style={{
          background: '#0f172a',
          color: '#fff',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>ClassBeacon Student Portal</h1>
          <span style={{ background: '#16a34a', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 700 }}>
            STUDENT
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => setIsPasswordModalOpen(true)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            🔒 Change Password
          </button>
          <button
            onClick={() => signOut()}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: '#ef4444',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: '1100px', margin: '2rem auto', padding: '0 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Student Admission & College Details Profile Card */}
        {user && (
          <section
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '2rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a', fontWeight: 800 }}>
                  🎓 College Profile & Student Record
                </h2>
                <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                  Registered admission details on file
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {user.section_name && (
                  <div style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem' }}>
                    🏛️ {user.section_name}
                  </div>
                )}
                <div style={{ background: '#dbeafe', color: '#1e40af', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem' }}>
                  Roll No: {user.user_id}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', fontSize: '0.9rem' }}>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Full Name</strong>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>{user.full_name}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Email Address</strong>
                <span style={{ fontWeight: 600, color: '#334155' }}>{user.email}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Department</strong>
                <span style={{ fontWeight: 600, color: '#334155' }}>{user.department || 'N/A'}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Year of Joining</strong>
                <span style={{ fontWeight: 600, color: '#334155' }}>{user.year_of_join || 'N/A'}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Beacon Tracking UUID</strong>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{user.beacon_uuid || 'N/A'}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Phone Number</strong>
                <span style={{ fontWeight: 600, color: '#334155' }}>{user.phone || 'N/A'}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Date of Birth</strong>
                <span style={{ fontWeight: 600, color: '#334155' }}>{user.date_of_birth ? String(user.date_of_birth).slice(0, 10) : 'N/A'}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #f1f5f9', gridColumn: 'span 2' }}>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Admission Residential Address</strong>
                <span style={{ fontWeight: 500, color: '#334155' }}>{user.address || 'N/A'}</span>
              </div>
            </div>
          </section>
        )}

        {/* Section Links & Resources from Teacher */}
        <section style={{ background: '#ffffff', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0', borderLeft: '6px solid #7c3aed' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', fontWeight: 800 }}>
                🔗 Academic Resources & Links from Your Teacher
              </h2>
              <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.875rem' }}>
                Important study links, live class links, and notes shared specifically for your section.
              </p>
            </div>
            <span style={{ background: '#f3e8ff', color: '#7e22ce', padding: '0.25rem 0.75rem', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>
              {links.length} Resources Available
            </span>
          </div>

          {links.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
              No academic links shared for your section yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {links.map((lnk) => (
                <div
                  key={lnk.id}
                  style={{
                    padding: '1.25rem',
                    background: '#faf5ff',
                    borderRadius: '12px',
                    border: '1px solid #e9d5ff',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#581c87', fontWeight: 700 }}>{lnk.title}</h3>
                    </div>
                    {lnk.teacher_name && (
                      <div style={{ fontSize: '0.8rem', color: '#7e22ce', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Shared by: {lnk.teacher_name} ({lnk.section_name || 'Your Section'})
                      </div>
                    )}
                    {lnk.description && (
                      <p style={{ margin: '0.5rem 0', color: '#4b5563', fontSize: '0.85rem' }}>
                        {lnk.description}
                      </p>
                    )}
                  </div>

                  <a
                    href={lnk.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-block',
                      marginTop: '0.75rem',
                      padding: '0.5rem 1rem',
                      background: '#7c3aed',
                      color: '#ffffff',
                      textDecoration: 'none',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      textAlign: 'center',
                    }}
                  >
                    Open Resource ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Assigned Lessons Section */}
        <section style={{ background: '#ffffff', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', fontWeight: 800 }}>
                📹 Enrolled Video Lessons
              </h2>
              <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.875rem' }}>
                Sequential playback enforced. Video forward skipping is turned off.
              </p>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading video lessons...</div>
          ) : error ? (
            <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '8px' }}>⚠️ {error}</div>
          ) : assignments.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
              No assigned video lessons available right now.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {assignments.map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: '1.25rem',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    borderLeft: '5px solid #2563eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <h3 style={{ margin: '0 0 0.375rem 0', fontSize: '1.1rem', color: '#0f172a' }}>{a.title}</h3>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                      Section: {a.section_name || 'Enrolled Section'} | Video Duration: {Math.floor(a.duration_sec / 60)}m {a.duration_sec % 60}s
                    </p>
                    <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.15rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700 }}>
                        ⏱️ Required Watch Time: {a.required_watch_minutes || Math.ceil((a.duration_sec * (a.completion_threshold || 0.8)) / 60)} Minutes
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>
                        🔒 Forward Skipping Disabled
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/student/lesson/${a.id}`)}
                    style={{
                      padding: '0.625rem 1.25rem',
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                    }}
                  >
                    ▶ Watch Video Lesson
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Student's Submitted Interruption / Issue Reports */}
        {myReports.length > 0 && (
          <section style={{ background: '#ffffff', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0', borderLeft: '6px solid #f59e0b' }}>
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#0f172a', fontWeight: 800 }}>
              📋 Your Submitted Issue & Interruption Reports
            </h2>
            <p style={{ margin: '0 0 1rem 0', color: '#64748b', fontSize: '0.875rem' }}>
              These reports are sent directly to your teacher for review and verification.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {myReports.map((rep) => (
                <div
                  key={rep.id}
                  style={{
                    padding: '1rem',
                    background: '#fffbeb',
                    borderRadius: '8px',
                    border: '1px solid #fde68a',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.9rem' }}>
                      {rep.assignment_title || 'Video Lesson'} ({rep.section_name || 'Section'})
                    </div>
                    <p style={{ margin: '0.25rem 0', color: '#451a03', fontSize: '0.85rem' }}>
                      "{rep.text}"
                    </p>
                    <span style={{ fontSize: '0.75rem', color: '#b45309' }}>
                      Shared on: {new Date(rep.created_at).toLocaleString()}
                    </span>
                  </div>

                  <span
                    style={{
                      padding: '0.25rem 0.6rem',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      background: rep.status === 'resolved' ? '#dcfce7' : rep.status === 'reviewed' ? '#dbeafe' : '#fef3c7',
                      color: rep.status === 'resolved' ? '#166534' : rep.status === 'reviewed' ? '#1e40af' : '#b45309',
                    }}
                  >
                    Teacher Status: {rep.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Change Password Modal */}
      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />
    </div>
  );
}
