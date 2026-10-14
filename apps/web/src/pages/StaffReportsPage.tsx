import { useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@cb/contexts/AuthContext';
import { api } from '@cb/lib/api';

interface Section {
  id: number;
  section_code: string;
  name: string;
  owner_name?: string;
  student_count?: number;
}

interface MonitoringItem {
  student_id: number;
  roll_number: string;
  full_name: string;
  email: string;
  assignment_id: number | null;
  assignment_title: string;
  watched_sec: number;
  duration_sec: number;
  watched_percent: number;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Interrupted';
  session_id: number | null;
  last_active: string | null;
  attention_events: {
    face_absent: number;
    looking_away: number;
    multiple_faces: number;
    second_device: number;
    total: number;
  };
  latest_snapshot: {
    event_type: string;
    confidence: number;
    created_at: string;
    snapshot_data: string;
  } | null;
  snapshots?: Array<{
    id: number;
    event_type: string;
    confidence: number;
    created_at: string;
    snapshot_data: string;
  }>;
}

interface StudentReport {
  id: number;
  student_id: number;
  section_id: number;
  assignment_id: number | null;
  student_name: string;
  roll_number: string;
  student_email: string;
  assignment_title?: string;
  text: string;
  status: 'pending' | 'reviewed' | 'resolved';
  created_at: string;
}

export default function StaffReportsPage(): ReactNode {
  const { signOut } = useAuth();
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [monitoringItems, setMonitoringItems] = useState<MonitoringItem[]>([]);
  const [reports, setReports] = useState<StudentReport[]>([]);
  const [inspectItem, setInspectItem] = useState<MonitoringItem | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSections();
  }, []);

  useEffect(() => {
    if (selectedSectionId) {
      void loadSectionData(selectedSectionId);
    } else {
      setMonitoringItems([]);
      setReports([]);
    }
  }, [selectedSectionId]);

  const loadSections = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const secList = await api.get<Section[]>('/sections');
      setSections(secList);
      if (secList.length > 0 && secList[0]) {
        setSelectedSectionId(String(secList[0].id));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load assigned sections.');
    } finally {
      setLoading(false);
    }
  };

  const loadSectionData = async (sectionId: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const [mon, rep] = await Promise.all([
        api.get<MonitoringItem[]>(`/sessions/overview/section/${sectionId}`),
        api.get<StudentReport[]>(`/reports/section/${sectionId}`)
      ]);
      setMonitoringItems(Array.isArray(mon) ? mon : []);
      setReports(Array.isArray(rep) ? rep : []);
    } catch (err: unknown) {
      console.error('Failed to load section data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load monitoring reports.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCsv = (): void => {
    if (!selectedSectionId || monitoringItems.length === 0) return;
    const secObj = sections.find((s) => String(s.id) === selectedSectionId);
    const secName = secObj ? secObj.name : `Section-${selectedSectionId}`;

    const headers = [
      'Section Name',
      'Roll Number',
      'Student Name',
      'Email',
      'Assignment Title',
      'Watched (Seconds)',
      'Total Duration (Seconds)',
      'Progress %',
      'Session Status',
      'Absence Flags',
      'Looking Away Flags',
      'Multiple Persons Flags',
      'Second Device Flags',
      'Total AI Alerts',
      'Technical Reports Count',
      'Last Active'
    ];

    const rows = monitoringItems.map((item) => {
      const studentReports = reports.filter((r) => r.student_id === item.student_id);
      return [
        `"${secName}"`,
        `"${item.roll_number || ''}"`,
        `"${item.full_name || ''}"`,
        `"${item.email || ''}"`,
        `"${item.assignment_title || ''}"`,
        item.watched_sec || 0,
        item.duration_sec || 0,
        `"${item.watched_percent || 0}%"`,
        `"${item.status}"`,
        item.attention_events?.face_absent || 0,
        item.attention_events?.looking_away || 0,
        item.attention_events?.multiple_faces || 0,
        item.attention_events?.second_device || 0,
        item.attention_events?.total || 0,
        studentReports.length,
        `"${item.last_active || 'N/A'}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${secName.replace(/[^a-zA-Z0-9_-]/g, '_')}_monitoring_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedSection = sections.find((s) => String(s.id) === selectedSectionId);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', color: '#0f172a' }}>Staff Monitoring Reports & CSV Export</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#64748b' }}>Authorized Section Analytics & Session Inspection</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => { window.location.href = '/staff'; }}
            style={{ padding: '0.5rem 1rem', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            ← Back to Staff Workspace
          </button>
          <button onClick={() => void signOut()} style={{ padding: '0.5rem 1rem', border: 'none', background: '#ef4444', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
            Sign Out
          </button>
        </div>
      </header>

      {error && <div style={{ background: '#ffebee', color: '#c62828', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem', fontWeight: 600 }}>{error}</div>}

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 600, color: '#334155' }}>
          Select Section:
          <select
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
            style={{ marginLeft: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600, color: '#0f172a', minWidth: '240px' }}
          >
            {sections.length === 0 ? (
              <option value="">No Assigned Sections Found</option>
            ) : (
              sections.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  🏛️ {s.name} ({s.section_code})
                </option>
              ))
            )}
          </select>
        </label>

        {selectedSection && (
          <span style={{ fontSize: '0.85rem', color: '#64748b', background: '#e2e8f0', padding: '0.35rem 0.75rem', borderRadius: '6px' }}>
            Enrolled: <strong>{monitoringItems.length} Students</strong>
          </span>
        )}

        <button
          onClick={handleDownloadCsv}
          disabled={monitoringItems.length === 0}
          style={{
            marginLeft: 'auto',
            padding: '0.55rem 1.25rem',
            background: monitoringItems.length === 0 ? '#94a3b8' : '#15803d',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: monitoringItems.length === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          📥 Download Sanitized CSV Export
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Loading sessions and signals…</div>
      ) : monitoringItems.length === 0 ? (
        <div style={{ padding: '3rem', background: '#f8f9fa', borderRadius: '8px', textAlign: 'center', color: '#64748b' }}>
          No recorded sessions or students found for this section.
        </div>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Roll No / Student</th>
                <th style={{ padding: '0.75rem 1rem' }}>Lesson / Assignment</th>
                <th style={{ padding: '0.75rem 1rem' }}>Progress</th>
                <th style={{ padding: '0.75rem 1rem' }}>Derived Signals / Alerts</th>
                <th style={{ padding: '0.75rem 1rem' }}>Reports</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {monitoringItems.map((s, idx) => {
                const studentReports = reports.filter((r) => r.student_id === s.student_id);
                const hasAlerts = s.attention_events && s.attention_events.total > 0;

                return (
                  <tr key={`${s.student_id}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{s.roll_number}</div>
                      <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{s.full_name}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '240px' }}>
                      <div style={{ fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.assignment_title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {Math.floor((s.watched_sec || 0) / 60)}m / {Math.floor((s.duration_sec || 0) / 60)}m ({s.watched_percent || 0}%)
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background:
                            s.status === 'Completed' ? '#dcfce7' :
                            s.status === 'Interrupted' ? '#fee2e2' :
                            s.status === 'In Progress' ? '#dbeafe' : '#f1f5f9',
                          color:
                            s.status === 'Completed' ? '#166534' :
                            s.status === 'Interrupted' ? '#991b1b' :
                            s.status === 'In Progress' ? '#1e40af' : '#475569',
                        }}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {!hasAlerts ? (
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Clean</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem' }}>
                          {s.attention_events.face_absent > 0 && (
                            <span style={{ color: '#dc2626' }}>⚠️ Absence: {s.attention_events.face_absent}</span>
                          )}
                          {s.attention_events.multiple_faces > 0 && (
                            <span style={{ color: '#dc2626' }}>⚠️ Multiple faces: {s.attention_events.multiple_faces}</span>
                          )}
                          {s.attention_events.second_device > 0 && (
                            <span style={{ color: '#ea580c' }}>📱 Second device: {s.attention_events.second_device}</span>
                          )}
                          {s.attention_events.looking_away > 0 && (
                            <span style={{ color: '#d97706' }}>👀 Looking away: {s.attention_events.looking_away}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {studentReports.length > 0 ? (
                        <span style={{ color: '#0284c7', fontWeight: 700, background: '#e0f2fe', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                          {studentReports.length} report(s)
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>None</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => setInspectItem(s)}
                        style={{ padding: '0.35rem 0.75rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Inspect Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Inspection Modal */}
      {inspectItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '1.75rem', width: '100%', maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Inspection: {inspectItem.full_name}</h2>
                <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Roll No: {inspectItem.roll_number} | {inspectItem.email}</div>
              </div>
              <button onClick={() => setInspectItem(null)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>
                &times;
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem', marginBottom: '1.25rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
              <div>
                <strong style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>ASSIGNMENT</strong>
                <span>{inspectItem.assignment_title}</span>
              </div>
              <div>
                <strong style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>STATUS</strong>
                <span style={{ fontWeight: 700 }}>{inspectItem.status} ({inspectItem.watched_percent}%)</span>
              </div>
              <div>
                <strong style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>WATCHED TIME</strong>
                <span>{Math.floor(inspectItem.watched_sec / 60)}m {inspectItem.watched_sec % 60}s</span>
              </div>
              <div>
                <strong style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>LAST ACTIVE</strong>
                <span>{inspectItem.last_active || 'N/A'}</span>
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem 0', color: '#0f172a' }}>Monitoring Evidence Snapshots ({inspectItem.snapshots?.length || 0})</h3>
            {(!inspectItem.snapshots || inspectItem.snapshots.length === 0) ? (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No AI event snapshots captured for this student.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem', maxHeight: '220px', overflowY: 'auto' }}>
                {inspectItem.snapshots.map((snap) => (
                  <div key={snap.id} style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#fff', fontSize: '0.75rem', padding: '0.35rem' }}>
                    <img src={snap.snapshot_data} alt={snap.event_type} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px' }} />
                    <div style={{ marginTop: '0.25rem', fontWeight: 700, color: '#dc2626' }}>{snap.event_type}</div>
                    <div style={{ color: '#64748b' }}>Conf: {Math.round(snap.confidence * 100)}%</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ textAlign: 'right', marginTop: '1.5rem' }}>
              <button
                onClick={() => setInspectItem(null)}
                style={{ padding: '0.5rem 1.25rem', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
