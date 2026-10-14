import { useState, useEffect, type ReactNode, type FormEvent } from 'react';
import { useAuth } from '@cb/contexts/AuthContext';
import { api } from '@cb/lib/api';
import ChangePasswordModal from '@cb/components/ChangePasswordModal';

interface Section {
  id: number;
  section_code: string;
  name: string;
  owner_name?: string;
  student_count?: number;
}

interface Video {
  id: number;
  title: string;
  source_url: string;
  duration_sec: number;
}

interface Assignment {
  id: number;
  title: string;
  duration_sec: number;
  completion_threshold: number;
  required_watch_minutes?: number;
  status?: 'draft' | 'published';
}

interface Enrollment {
  id: number;
  student_id?: number;
  user_id: string;
  roll_number?: string;
  full_name: string;
  email: string;
  department?: string;
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

interface SectionLink {
  id: number;
  section_id: number;
  teacher_id: number;
  title: string;
  url: string;
  description?: string;
  teacher_name?: string;
  created_at: string;
}

export interface MonitoringItem {
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

export default function StaffDashboardPage(): ReactNode {
  const { user, signOut } = useAuth();
  const [sections, setSections] = useState<Section[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [reports, setReports] = useState<StudentReport[]>([]);
  const [links, setLinks] = useState<SectionLink[]>([]);
  const [monitoringOverview, setMonitoringOverview] = useState<MonitoringItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Completed' | 'In Progress' | 'Interrupted' | 'Not Started'>('All');
  const [selectedAssignmentFilter, setSelectedAssignmentFilter] = useState<string>('All');
  const [previewSnapshot, setPreviewSnapshot] = useState<{
    currentIndex: number;
    list: Array<{
      url: string;
      eventType: string;
      timestamp: string;
      confidence: number;
    }>;
    studentName: string;
    rollNumber: string;
  } | null>(null);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Form states
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDuration, setVideoDuration] = useState<number>(300);
  const [durationAutoDetected, setDurationAutoDetected] = useState(false);

  // Assignment form states
  const [assignVideoId, setAssignVideoId] = useState('');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignWatchMinutes, setAssignWatchMinutes] = useState<number>(4);
  const [assignStatus, setAssignStatus] = useState<'published' | 'draft'>('published');

  // Link form states
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkDesc, setLinkDesc] = useState('');
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSectionsAndVideos();
  }, []);

  useEffect(() => {
    if (selectedSectionId) {
      void loadSectionDetails(selectedSectionId);
    }
  }, [selectedSectionId]);

  const loadSectionsAndVideos = async (): Promise<void> => {
    try {
      const secList = await api.get<Section[]>('/sections');
      const validSecs = Array.isArray(secList) ? secList : [];
      setSections(validSecs);

      const vidList = await api.get<Video[] | { videos: Video[] }>('/videos');
      if (Array.isArray(vidList)) {
        setVideos(vidList);
      } else if (vidList && Array.isArray((vidList as { videos: Video[] }).videos)) {
        setVideos((vidList as { videos: Video[] }).videos);
      } else {
        setVideos([]);
      }

      if (validSecs.length > 0 && selectedSectionId === null) {
        setSelectedSectionId(validSecs[0]?.id ?? null);
      }
    } catch (err: unknown) {
      console.error('Failed to load staff data:', err);
    }
  };

  const loadSectionDetails = async (sectionId: number): Promise<void> => {
    try {
      // 1. Enrolled students for this assigned section ONLY
      const enr = await api.get<Enrollment[]>(`/sections/${sectionId}/students`);
      setEnrollments(Array.isArray(enr) ? enr : []);

      // 2. Section assignments
      const ass = await api.get<Assignment[]>(`/assignments/section/${sectionId}`);
      setAssignments(Array.isArray(ass) ? ass : []);

      // 3. Student reports for this section
      const rep = await api.get<StudentReport[]>(`/reports/section/${sectionId}`);
      setReports(Array.isArray(rep) ? rep : []);

      // 4. Teacher links for this section
      const lnk = await api.get<SectionLink[]>(`/links/section/${sectionId}`);
      setLinks(Array.isArray(lnk) ? lnk : []);

      // 5. Video Monitoring Overview for this section (strict section isolation)
      try {
        const mon = await api.get<MonitoringItem[]>(`/sessions/overview/section/${sectionId}`);
        setMonitoringOverview(Array.isArray(mon) ? mon : []);
      } catch (monErr) {
        console.warn('Failed to load monitoring overview:', monErr);
      }
    } catch (err: unknown) {
      console.error('Failed to load section details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load section details');
    }
  };

  const handleVideoUrlChange = async (url: string): Promise<void> => {
    setVideoUrl(url);
    if (!url.trim()) return;

    // 1. Try backend inspect endpoint (auto-detects YouTube duration and title)
    try {
      const inspected = await api.post<{
        success: boolean;
        isYouTube: boolean;
        durationSec: number | null;
        title: string;
      }>('/videos/inspect', { url: url.trim() });

      if (inspected && inspected.durationSec && inspected.durationSec > 0) {
        setVideoDuration(inspected.durationSec);
        setDurationAutoDetected(true);
        if (inspected.title && !videoTitle.trim()) {
          setVideoTitle(inspected.title);
        }
        return;
      }
      if (inspected && inspected.title && !videoTitle.trim()) {
        setVideoTitle(inspected.title);
      }
    } catch {
      // Fall through to HTML5 video element probe
    }

    // 2. Direct HTML5 video probe for .mp4, .webm, etc.
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const v = document.createElement('video');
      v.src = url;
      v.onloadedmetadata = () => {
        if (v.duration && isFinite(v.duration) && v.duration > 0) {
          const detected = Math.round(v.duration);
          setVideoDuration(detected);
          setDurationAutoDetected(true);
        }
      };
    }
  };

  const handleCreateVideo = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!videoTitle.trim() || !videoUrl.trim()) return;
    try {
      setMessage(null);
      setError(null);

      // Duration is optional - fallback to 300 if not set or 0
      const finalDuration = videoDuration && videoDuration > 0 ? Number(videoDuration) : 300;

      await api.post('/videos', {
        title: videoTitle.trim(),
        sourceUrl: videoUrl.trim(),
        source_url: videoUrl.trim(),
        durationSec: finalDuration,
        duration_sec: finalDuration,
      });

      setVideoTitle('');
      setVideoUrl('');
      setVideoDuration(300);
      setDurationAutoDetected(false);
      setMessage('Video added to library successfully.');
      await loadSectionsAndVideos();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add video.');
    }
  };

  const handleDeleteVideo = async (videoId: number): Promise<void> => {
    if (!window.confirm('Are you sure you want to remove this video link from your library?')) {
      return;
    }
    try {
      setMessage(null);
      setError(null);
      await api.delete(`/videos/${videoId}`);
      setMessage('Video removed from library successfully.');
      await loadSectionsAndVideos();
      if (selectedSectionId) {
        await loadSectionDetails(selectedSectionId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove video from library.');
    }
  };

  const handleExportMonitoringCsv = (): void => {
    if (!monitoringOverview || monitoringOverview.length === 0) return;
    const headers = [
      'Roll Number',
      'Student Name',
      'Email',
      'Video Lesson',
      'Watched Seconds',
      'Duration Seconds',
      'Completion %',
      'Playback Status',
      'Candidate Absence Events',
      'Multiple Persons Events',
      'Second Device Events',
      'Total AI Flags',
      'Last Active'
    ];

    const rows = monitoringOverview.map((item) => [
      `"${item.roll_number || ''}"`,
      `"${item.full_name || ''}"`,
      `"${item.email || ''}"`,
      `"${item.assignment_title || ''}"`,
      item.watched_sec || 0,
      item.duration_sec || 0,
      `${item.watched_percent || 0}%`,
      `"${item.status}"`,
      item.attention_events?.face_absent || 0,
      item.attention_events?.multiple_faces || 0,
      item.attention_events?.second_device || 0,
      item.attention_events?.total || 0,
      `"${item.last_active || 'N/A'}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `section_${selectedSection?.section_code || selectedSectionId}_monitoring_report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateAssignment = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selectedSectionId || !assignVideoId) return;
    const selectedVid = videos.find((v) => v.id === Number(assignVideoId));
    if (!selectedVid) return;

    const totalVideoMins = Math.max(1, Math.ceil(selectedVid.duration_sec / 60));
    if (assignWatchMinutes <= 0) {
      setError('Required watch time must be greater than zero.');
      return;
    }
    if (assignWatchMinutes > totalVideoMins) {
      setError(`Required watch time (${assignWatchMinutes} mins) cannot exceed video total duration (${totalVideoMins} mins).`);
      return;
    }

    try {
      setMessage(null);
      setError(null);
      await api.post('/assignments', {
        section_id: selectedSectionId,
        video_id: Number(assignVideoId),
        title: assignTitle.trim() || selectedVid.title,
        source_url: selectedVid.source_url,
        duration_sec: selectedVid.duration_sec,
        required_watch_minutes: Number(assignWatchMinutes),
        status: assignStatus,
        policy_sequential: 1, // Enforce video skipping disabled
      });

      setAssignTitle('');
      setMessage(assignStatus === 'published' ? 'Assignment published successfully with video forward-skipping disabled.' : 'Assignment saved as draft.');
      await loadSectionDetails(selectedSectionId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create assignment.');
    }
  };

  const handleToggleAssignmentStatus = async (assignmentId: number, currentStatus: string): Promise<void> => {
    try {
      setMessage(null);
      const newStatus = currentStatus === 'published' ? 'draft' : 'published';
      await api.put(`/assignments/${assignmentId}`, { status: newStatus });
      setMessage(`Assignment status updated to ${newStatus}.`);
      if (selectedSectionId) {
        await loadSectionDetails(selectedSectionId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update assignment status.');
    }
  };

  const handleDeleteAssignment = async (assignmentId: number): Promise<void> => {
    if (!window.confirm('Are you sure you want to delete this assignment?')) return;
    try {
      setMessage(null);
      await api.delete(`/assignments/${assignmentId}`);
      setMessage('Assignment removed successfully.');
      if (selectedSectionId) {
        await loadSectionDetails(selectedSectionId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete assignment.');
    }
  };

  // Report status update handler
  const handleUpdateReportStatus = async (reportId: number, status: 'reviewed' | 'resolved'): Promise<void> => {
    try {
      setMessage(null);
      await api.put(`/reports/${reportId}/status`, { status });
      setMessage(`Report marked as ${status}.`);
      if (selectedSectionId) {
        await loadSectionDetails(selectedSectionId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update report status.');
    }
  };

  // Link Management Handlers
  const handleSaveLink = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selectedSectionId || !linkTitle.trim() || !linkUrl.trim()) return;

    try {
      setMessage(null);
      setError(null);

      if (editingLinkId) {
        // Update link
        await api.put(`/links/${editingLinkId}`, {
          title: linkTitle.trim(),
          url: linkUrl.trim(),
          description: linkDesc.trim() || undefined,
        });
        setMessage('Link updated successfully.');
        setEditingLinkId(null);
      } else {
        // Add new link - automatically mapped to selected section and teacher
        await api.post('/links', {
          section_id: selectedSectionId,
          title: linkTitle.trim(),
          url: linkUrl.trim(),
          description: linkDesc.trim() || undefined,
        });
        setMessage('Academic link added and mapped to your section.');
      }

      setLinkTitle('');
      setLinkUrl('');
      setLinkDesc('');
      await loadSectionDetails(selectedSectionId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save link.');
    }
  };

  const handleDeleteLink = async (linkId: number): Promise<void> => {
    if (!window.confirm('Are you sure you want to delete this resource link?')) return;
    try {
      setMessage(null);
      await api.delete(`/links/${linkId}`);
      setMessage('Link deleted successfully.');
      if (selectedSectionId) {
        await loadSectionDetails(selectedSectionId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete link.');
    }
  };

  const selectedSection = sections.find((s) => s.id === selectedSectionId);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
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
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>ClassBeacon Faculty Workspace</h1>
          <span style={{ background: '#2563eb', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 700 }}>
            TEACHER / FACULTY
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
            <div style={{ fontWeight: 600 }}>{user?.full_name}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>ID: {user?.user_id}</div>
          </div>
          <button
            onClick={() => { window.location.href = '/staff/reports'; }}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #3b82f6',
              background: '#1d4ed8',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            📊 Monitoring Reports & CSV
          </button>
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

      <main style={{ maxWidth: '1280px', margin: '2rem auto', padding: '0 1.5rem' }}>
        {message && <div style={{ background: '#dcfce7', color: '#166534', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontWeight: 600 }}>✅ {message}</div>}
        {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontWeight: 600 }}>⚠️ {error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem' }}>
          {/* Left Column: Assigned Sections & Video Library */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Assigned Sections */}
            <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>Your Assigned Sections</h2>
                <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                  {sections.length} Assigned
                </span>
              </div>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: '#64748b' }}>
                Access is restricted to students in your assigned sections only.
              </p>

              {sections.length === 0 ? (
                <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
                  No sections assigned to your account yet. Contact an administrator.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {sections.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSectionId(s.id)}
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: selectedSectionId === s.id ? '#dbeafe' : '#f8fafc',
                        border: selectedSectionId === s.id ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        color: selectedSectionId === s.id ? '#1e40af' : '#0f172a',
                        fontWeight: selectedSectionId === s.id ? 700 : 500,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div>{s.name}</div>
                        <div style={{ fontSize: '0.75rem', color: selectedSectionId === s.id ? '#2563eb' : '#64748b' }}>
                          Code: {s.section_code}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.8rem', background: selectedSectionId === s.id ? '#2563eb' : '#e2e8f0', color: selectedSectionId === s.id ? '#fff' : '#475569', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
                        {s.student_count ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video Library */}
            <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#0f172a' }}>Video Library</h2>
              <form onSubmit={(e) => void handleCreateVideo(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                <input
                  type="text"
                  placeholder="Video Title"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  required
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
                <input
                  type="url"
                  placeholder="https://example.com/video.mp4"
                  value={videoUrl}
                  onChange={(e) => handleVideoUrlChange(e.target.value)}
                  required
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
                <div>
                  <input
                    type="number"
                    placeholder="Duration in seconds (Optional - auto-detected or 300s default)"
                    value={videoDuration || ''}
                    onChange={(e) => {
                      setVideoDuration(e.target.value ? Number(e.target.value) : 0);
                      setDurationAutoDetected(false);
                    }}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                  {durationAutoDetected && (
                    <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.2rem', fontWeight: 600 }}>
                      ✓ Duration auto-detected from metadata ({videoDuration}s)
                    </div>
                  )}
                  {!durationAutoDetected && (
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                      Optional: retrieved automatically or defaults to 300s (5m).
                    </div>
                  )}
                </div>
                <button type="submit" style={{ padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#0f172a', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                  Add Video to Library
                </button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                {videos.map((v) => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}>
                      <strong>{v.title}</strong> ({Math.floor(v.duration_sec / 60)}m {v.duration_sec % 60}s)
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteVideo(v.id)}
                      title="Remove link from Library"
                      style={{
                        padding: '0.2rem 0.5rem',
                        background: '#fee2e2',
                        color: '#dc2626',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      🗑️ Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Right Column: Section Students, Video Assignments, Reports & Links */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {selectedSectionId ? (
              <>
                {/* Section Header Banner */}
                <div style={{ background: '#1e40af', color: '#fff', padding: '1.25rem 1.5rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.35rem' }}>{selectedSection?.name}</h2>
                    <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9, fontSize: '0.85rem' }}>
                      Code: {selectedSection?.section_code} | Managing students, video lessons, and links
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', background: 'rgba(255,255,255,0.15)', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{enrollments.length}</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>Students in Section</div>
                  </div>
                </div>

                {/* 0. STUDENT VIDEO MONITORING, AI ATTENTION DETECTION & EVIDENCE DASHBOARD */}
                <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '5px solid #2563eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🤖 Student Video Monitoring & AI Proctoring Dashboard
                      </h2>
                      <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                        Section-scoped playback tracking, sequential viewing verification, and observable AI indicators for <strong>{selectedSection?.name}</strong>.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={handleExportMonitoringCsv}
                        disabled={monitoringOverview.length === 0}
                        style={{
                          padding: '0.45rem 0.9rem',
                          background: '#16a34a',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: monitoringOverview.length === 0 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        📥 Export Section CSV
                      </button>
                      <button
                        onClick={() => selectedSectionId && void loadSectionDetails(selectedSectionId)}
                        style={{
                          padding: '0.45rem 0.9rem',
                          background: '#f1f5f9',
                          color: '#334155',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        🔄 Refresh
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Pills */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{enrollments.length}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Students Enrolled</div>
                    </div>
                    <div style={{ background: '#f0fdf4', padding: '0.75rem', borderRadius: '8px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>
                        {monitoringOverview.filter((m) => m.status === 'Completed').length}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#15803d' }}>Completed</div>
                    </div>
                    <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb' }}>
                        {monitoringOverview.filter((m) => m.status === 'In Progress').length}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#1d4ed8' }}>In Progress</div>
                    </div>
                    <div style={{ background: '#fffbeb', padding: '0.75rem', borderRadius: '8px', border: '1px solid #fde68a', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>
                        {monitoringOverview.filter((m) => m.status === 'Interrupted').length}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#b45309' }}>Interrupted Sessions</div>
                    </div>
                    <div style={{ background: '#faf5ff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e9d5ff', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed' }}>
                        {monitoringOverview.reduce((acc, m) => acc + (m.attention_events?.total || 0), 0)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b21a8' }}>AI Event Flags</div>
                    </div>
                  </div>

                  {/* Filter Status & Assignment Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {(['All', 'Completed', 'In Progress', 'Interrupted', 'Not Started'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setStatusFilter(st)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: statusFilter === st ? '#2563eb' : '#f1f5f9',
                            color: statusFilter === st ? '#fff' : '#475569',
                            border: 'none',
                          }}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    {/* Filter by Video Lesson / Library Assignment */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                        Filter by Video Lesson:
                      </label>
                      <select
                        value={selectedAssignmentFilter}
                        onChange={(e) => setSelectedAssignmentFilter(e.target.value)}
                        style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#fff' }}
                      >
                        <option value="All">All Video Lessons</option>
                        {Array.from(new Set(monitoringOverview.map((m) => m.assignment_title).filter(Boolean))).map((title) => (
                          <option key={title} value={title}>
                            {title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Monitoring Table */}
                  {monitoringOverview.length === 0 ? (
                    <div style={{ padding: '2rem', background: '#f8fafc', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                      No student video sessions or progress recorded in this section yet.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#334155' }}>
                            <th style={{ padding: '0.75rem' }}>Student</th>
                            <th style={{ padding: '0.75rem' }}>Video Assignment</th>
                            <th style={{ padding: '0.75rem' }}>Watched Progress</th>
                            <th style={{ padding: '0.75rem' }}>Playback Status</th>
                            <th style={{ padding: '0.75rem' }}>AI Indicators</th>
                            <th style={{ padding: '0.75rem' }}>Evidence Snapshot</th>
                            <th style={{ padding: '0.75rem' }}>Last Activity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monitoringOverview
                            .filter((m) => (statusFilter === 'All' || m.status === statusFilter) && (selectedAssignmentFilter === 'All' || m.assignment_title === selectedAssignmentFilter))
                            .map((m, idx) => {
                              const isCompleted = m.status === 'Completed';
                              const isInterrupted = m.status === 'Interrupted';
                              const isInProgress = m.status === 'In Progress';

                              return (
                                <tr key={`${m.student_id}-${m.assignment_id || idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '0.75rem' }}>
                                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{m.full_name}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Roll: {m.roll_number}</div>
                                  </td>

                                  <td style={{ padding: '0.75rem' }}>
                                    <div style={{ fontWeight: 600, color: '#1e40af' }}>{m.assignment_title}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                      Duration: {Math.floor(m.duration_sec / 60)}m {m.duration_sec % 60}s
                                    </div>
                                  </td>

                                  <td style={{ padding: '0.75rem', minWidth: '150px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                      <span>{m.watched_sec}s / {m.duration_sec}s</span>
                                      <strong>{m.watched_percent}%</strong>
                                    </div>
                                    <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                      <div
                                        style={{
                                          width: `${Math.min(100, m.watched_percent)}%`,
                                          height: '100%',
                                          background: isCompleted ? '#16a34a' : isInterrupted ? '#d97706' : '#2563eb',
                                        }}
                                      />
                                    </div>
                                  </td>

                                  <td style={{ padding: '0.75rem' }}>
                                    <span
                                      style={{
                                        padding: '0.2rem 0.6rem',
                                        borderRadius: '12px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        background: isCompleted
                                          ? '#dcfce7'
                                          : isInterrupted
                                          ? '#fef3c7'
                                          : isInProgress
                                          ? '#dbeafe'
                                          : '#f1f5f9',
                                        color: isCompleted
                                          ? '#166534'
                                          : isInterrupted
                                          ? '#b45309'
                                          : isInProgress
                                          ? '#1e40af'
                                          : '#475569',
                                      }}
                                    >
                                      {m.status}
                                    </span>
                                  </td>

                                  <td style={{ padding: '0.75rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.75rem' }}>
                                      {m.attention_events?.second_device > 0 && (
                                        <span style={{ color: '#dc2626', fontWeight: 600 }}>
                                          📱 Prohibited Device: {m.attention_events.second_device}
                                        </span>
                                      )}
                                      {m.attention_events?.face_absent > 0 && (
                                        <span style={{ color: '#d97706', fontWeight: 600 }}>
                                          👤 Candidate Absent (&gt;3s): {m.attention_events.face_absent}
                                        </span>
                                      )}
                                      {m.attention_events?.multiple_faces > 0 && (
                                        <span style={{ color: '#7c3aed', fontWeight: 600 }}>
                                          👥 Extra Persons: {m.attention_events.multiple_faces}
                                        </span>
                                      )}
                                      {m.attention_events?.total === 0 && (
                                        <span style={{ color: '#16a34a' }}>✓ Normal View</span>
                                      )}
                                    </div>
                                  </td>

                                  <td style={{ padding: '0.75rem' }}>
                                    {m.snapshots && m.snapshots.length > 0 ? (
                                      <button
                                        onClick={() =>
                                          setPreviewSnapshot({
                                            currentIndex: 0,
                                            list: m.snapshots!.map((s) => ({
                                              url: s.snapshot_data,
                                              eventType: s.event_type,
                                              timestamp: s.created_at,
                                              confidence: s.confidence,
                                            })),
                                            studentName: m.full_name,
                                            rollNumber: m.roll_number,
                                          })
                                        }
                                        style={{
                                          padding: '0.3rem 0.6rem',
                                          background: '#f8fafc',
                                          border: '1px solid #cbd5e1',
                                          borderRadius: '6px',
                                          cursor: 'pointer',
                                          fontSize: '0.75rem',
                                          fontWeight: 600,
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                        }}
                                      >
                                        📷 View Evidence ({m.snapshots.length})
                                      </button>
                                    ) : m.latest_snapshot ? (
                                      <button
                                        onClick={() =>
                                          setPreviewSnapshot({
                                            currentIndex: 0,
                                            list: [{
                                              url: m.latest_snapshot!.snapshot_data,
                                              eventType: m.latest_snapshot!.event_type,
                                              timestamp: m.latest_snapshot!.created_at,
                                              confidence: m.latest_snapshot!.confidence,
                                            }],
                                            studentName: m.full_name,
                                            rollNumber: m.roll_number,
                                          })
                                        }
                                        style={{
                                          padding: '0.3rem 0.6rem',
                                          background: '#f8fafc',
                                          border: '1px solid #cbd5e1',
                                          borderRadius: '6px',
                                          cursor: 'pointer',
                                          fontSize: '0.75rem',
                                          fontWeight: 600,
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                        }}
                                      >
                                        📷 View Evidence
                                      </button>
                                    ) : (
                                      <span style={{ color: '#94a3b8' }}>None</span>
                                    )}
                                  </td>

                                  <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
                                    {m.last_active ? new Date(m.last_active).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Ethical & Fair Notice Banner */}
                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.8rem', color: '#1e40af' }}>
                    ℹ️ <strong>Monitoring Note:</strong> Browser-based AI detection flags are potential indicators to aid instructor review. Looking away or brief room occlusions do not prove misconduct. Always review watermarked evidence snapshots in context before reaching academic conclusions.
                  </div>
                </div>

                {/* 1. TEACHER-SPECIFIC LINK MANAGEMENT */}
                <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '5px solid #7c3aed' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
                        🔗 Teacher Academic Links & Resources
                      </h2>
                      <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                        Links added here are automatically mapped to <strong>{selectedSection?.name}</strong> and visible only to students in this section.
                      </p>
                    </div>
                    {editingLinkId && (
                      <button
                        onClick={() => {
                          setEditingLinkId(null);
                          setLinkTitle('');
                          setLinkUrl('');
                          setLinkDesc('');
                        }}
                        style={{ padding: '0.3rem 0.75rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  {/* Add / Edit Link Form */}
                  <form onSubmit={(e) => void handleSaveLink(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                          Link Title *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Lecture Notes / Live Classroom / Lab Guide"
                          value={linkTitle}
                          onChange={(e) => setLinkTitle(e.target.value)}
                          required
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                          Resource URL *
                        </label>
                        <input
                          type="url"
                          placeholder="https://drive.google.com/... or https://meet.google.com/..."
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          required
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        Description (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Brief instructions or notes for your students"
                        value={linkDesc}
                        onChange={(e) => setLinkDesc(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <button
                        type="submit"
                        style={{ padding: '0.625rem 1.25rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {editingLinkId ? '💾 Update Link' : '➕ Add Link to Section'}
                      </button>
                    </div>
                  </form>

                  {/* Links List */}
                  {links.length === 0 ? (
                    <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                      No links added for this section yet. Share lecture notes, reference material, or meeting links above.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {links.map((l) => (
                        <div
                          key={l.id}
                          style={{
                            padding: '1rem',
                            background: '#faf5ff',
                            borderRadius: '8px',
                            border: '1px solid #e9d5ff',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#581c87' }}>
                              🔗 {l.title}
                            </div>
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#2563eb', fontSize: '0.85rem', wordBreak: 'break-all' }}
                            >
                              {l.url}
                            </a>
                            {l.description && (
                              <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.8rem' }}>
                                {l.description}
                              </p>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              onClick={() => {
                                setEditingLinkId(l.id);
                                setLinkTitle(l.title);
                                setLinkUrl(l.url);
                                setLinkDesc(l.description || '');
                              }}
                              style={{ padding: '0.375rem 0.75rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => void handleDeleteLink(l.id)}
                              style={{ padding: '0.375rem 0.75rem', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. STUDENT VIDEO ISSUE & INTERRUPTION REPORTS */}
                <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '5px solid #f59e0b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
                        📋 Student Video Reports & Technical Interruptions
                      </h2>
                      <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                        Reports submitted by students in your section during their video lesson sessions.
                      </p>
                    </div>
                    <span style={{ background: '#fef3c7', color: '#b45309', padding: '0.25rem 0.75rem', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem' }}>
                      {reports.length} Reports
                    </span>
                  </div>

                  {reports.length === 0 ? (
                    <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                      ✅ No interruption or issue reports submitted by students in this section.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {reports.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            padding: '1rem',
                            background: '#fffbeb',
                            borderRadius: '8px',
                            border: '1px solid #fde68a',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                            gap: '1rem',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: '240px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                              <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{r.student_name}</strong>
                              <span style={{ background: '#e2e8f0', color: '#334155', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                                {r.roll_number}
                              </span>
                              <span
                                style={{
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '10px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  background: r.status === 'resolved' ? '#dcfce7' : r.status === 'reviewed' ? '#dbeafe' : '#fef3c7',
                                  color: r.status === 'resolved' ? '#166534' : r.status === 'reviewed' ? '#1e40af' : '#b45309',
                                }}
                              >
                                {r.status}
                              </span>
                            </div>

                            {r.assignment_title && (
                              <div style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 600 }}>
                                Lesson: {r.assignment_title}
                              </div>
                            )}

                            <p style={{ margin: '0.5rem 0 0 0', color: '#451a03', fontSize: '0.9rem', background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #fef08a' }}>
                              "{r.text}"
                            </p>
                            <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.25rem' }}>
                              Submitted on: {new Date(r.created_at).toLocaleString()}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {r.status === 'pending' && (
                              <button
                                onClick={() => void handleUpdateReportStatus(r.id, 'reviewed')}
                                style={{ padding: '0.375rem 0.75rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                              >
                                Mark Reviewed
                              </button>
                            )}
                            {r.status !== 'resolved' && (
                              <button
                                onClick={() => void handleUpdateReportStatus(r.id, 'resolved')}
                                style={{ padding: '0.375rem 0.75rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                              >
                                Mark Resolved
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. ENROLLED STUDENTS IN SECTION */}
                <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
                      Enrolled Students in {selectedSection?.name}
                    </h2>
                    <div style={{ fontSize: '0.9rem', color: '#475569' }}>
                      Total Enrolled: <strong>{enrollments.length} Students</strong>
                    </div>
                  </div>

                  <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                          <th style={{ padding: '0.5rem 0.75rem' }}>Roll No</th>
                          <th style={{ padding: '0.5rem 0.75rem' }}>Full Name</th>
                          <th style={{ padding: '0.5rem 0.75rem' }}>Email</th>
                          <th style={{ padding: '0.5rem 0.75rem' }}>Department</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enrollments.map((en, i) => (
                          <tr key={en.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: '#0f172a' }}>{en.roll_number || en.user_id}</td>
                            <td style={{ padding: '0.5rem 0.75rem' }}>{en.full_name}</td>
                            <td style={{ padding: '0.5rem 0.75rem', color: '#64748b' }}>{en.email}</td>
                            <td style={{ padding: '0.5rem 0.75rem', color: '#64748b' }}>{en.department || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4. PUBLISH VIDEO ASSIGNMENT */}
                <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: '#0f172a' }}>
                    Publish Video Assignment (Skipping Disabled)
                  </h2>
                  <form onSubmit={(e) => void handleCreateAssignment(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <select
                      value={assignVideoId}
                      onChange={(e) => {
                        const vidId = e.target.value;
                        setAssignVideoId(vidId);
                        const found = videos.find((v) => v.id === Number(vidId));
                        if (found) {
                          if (!assignTitle || videos.some((v) => v.title === assignTitle)) {
                            setAssignTitle(found.title);
                          }
                          const mins = Math.max(1, Math.ceil((found.duration_sec * 0.8) / 60));
                          setAssignWatchMinutes(mins);
                        }
                      }}
                      required
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    >
                      <option value="">-- Select Video from Library --</option>
                      {videos.map((v) => (
                        <option key={v.id} value={v.id}>{v.title} ({Math.floor(v.duration_sec / 60)}m {v.duration_sec % 60}s)</option>
                      ))}
                    </select>

                    <input
                      type="text"
                      placeholder="Assignment Title"
                      value={assignTitle}
                      onChange={(e) => setAssignTitle(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                          Mandatory Watch Time (Minutes) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={assignVideoId ? Math.max(1, Math.ceil((videos.find((v) => v.id === Number(assignVideoId))?.duration_sec || 300) / 60)) : 120}
                          value={assignWatchMinutes}
                          onChange={(e) => setAssignWatchMinutes(Math.max(1, Number(e.target.value)))}
                          required
                          style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', boxSizing: 'border-box' }}
                        />
                        {assignVideoId && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                            Total Video Duration: {Math.max(1, Math.ceil((videos.find((v) => v.id === Number(assignVideoId))?.duration_sec || 300) / 60))} minutes
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                          Publication Status
                        </label>
                        <select
                          value={assignStatus}
                          onChange={(e) => setAssignStatus(e.target.value as 'published' | 'draft')}
                          style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', boxSizing: 'border-box' }}
                        >
                          <option value="published">🚀 Published (Visible to enrolled students)</option>
                          <option value="draft">📝 Draft (Hidden from students)</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ background: '#eff6ff', color: '#1e40af', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
                      🔒 Forward video skipping option will be strictly turned off for students. Sequential playback enforced.
                    </div>

                    <button type="submit" style={{ padding: '0.75rem', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                      {assignStatus === 'published' ? 'Publish Assignment to Students' : 'Save as Draft'}
                    </button>
                  </form>

                  <h3 style={{ marginTop: '1.5rem', fontSize: '1rem', color: '#0f172a' }}>Active Assignments</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {assignments.map((a) => (
                      <div
                        key={a.id}
                        style={{
                          padding: '0.75rem 1rem',
                          background: '#f8fafc',
                          borderRadius: '8px',
                          borderLeft: a.status === 'draft' ? '4px solid #94a3b8' : '4px solid #2563eb',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong>{a.title}</strong>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '10px',
                                fontWeight: 700,
                                background: a.status === 'draft' ? '#f1f5f9' : '#dcfce7',
                                color: a.status === 'draft' ? '#475569' : '#166534',
                              }}
                            >
                              {a.status === 'draft' ? 'DRAFT' : 'PUBLISHED'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                            Duration: {Math.floor(a.duration_sec / 60)}m {a.duration_sec % 60}s | Required Watch: {a.required_watch_minutes || Math.ceil((a.duration_sec * (a.completion_threshold || 0.8)) / 60)} mins | Skipping Disabled: Yes
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => void handleToggleAssignmentStatus(a.id, a.status || 'published')}
                            style={{
                              padding: '0.3rem 0.6rem',
                              background: '#fff',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            {a.status === 'draft' ? '🚀 Publish' : '📝 Unpublish'}
                          </button>
                          <button
                            onClick={() => void handleDeleteAssignment(a.id)}
                            style={{
                              padding: '0.3rem 0.6rem',
                              background: '#fee2e2',
                              color: '#991b1b',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                            }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ background: '#fff', padding: '2rem', borderRadius: '12px', textAlign: 'center', color: '#64748b' }}>
                Select a section on the left to manage enrolled students, video assignments, reports, and links.
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Evidence Snapshot Review Modal */}
      {previewSnapshot && (() => {
        const currentItem = previewSnapshot.list[previewSnapshot.currentIndex] || previewSnapshot.list[0];
        const hasPrev = previewSnapshot.currentIndex > 0;
        const hasNext = previewSnapshot.currentIndex < previewSnapshot.list.length - 1;
        const totalCount = previewSnapshot.list.length;

        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.75)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1300,
              padding: '1rem',
            }}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: '12px',
                maxWidth: '740px',
                width: '100%',
                overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
              }}
            >
              <div
                style={{
                  background: '#0f172a',
                  color: '#fff',
                  padding: '1rem 1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                    AI Evidence Snapshot Review ({previewSnapshot.currentIndex + 1} of {totalCount})
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Student: {previewSnapshot.studentName} ({previewSnapshot.rollNumber})
                  </div>
                </div>
                <button
                  onClick={() => setPreviewSnapshot(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ padding: '1.25rem', textAlign: 'center', background: '#000', minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {currentItem?.url ? (
                  <img
                    src={currentItem.url}
                    alt={`Monitoring Evidence ${previewSnapshot.currentIndex + 1}`}
                    style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '4px', display: 'block', margin: '0 auto' }}
                  />
                ) : (
                  <div style={{ color: '#94a3b8', padding: '2rem' }}>No snapshot image available.</div>
                )}
              </div>

              {/* Navigation Controls & Metadata */}
              <div style={{ padding: '1.25rem', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  {currentItem && (
                    <>
                      <span
                        style={{
                          padding: '0.2rem 0.6rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: currentItem.eventType === 'second_device' ? '#fee2e2' : '#fef3c7',
                          color: currentItem.eventType === 'second_device' ? '#991b1b' : '#b45309',
                          marginRight: '8px',
                        }}
                      >
                        {currentItem.eventType.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                        Confidence: <strong>{(currentItem.confidence * 100).toFixed(1)}%</strong> | Captured: {new Date(currentItem.timestamp).toLocaleString()}
                      </span>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    disabled={!hasPrev}
                    onClick={() =>
                      setPreviewSnapshot((prev) =>
                        prev ? { ...prev, currentIndex: Math.max(0, prev.currentIndex - 1) } : null
                      )
                    }
                    style={{
                      padding: '0.5rem 0.9rem',
                      background: hasPrev ? '#e2e8f0' : '#f1f5f9',
                      color: hasPrev ? '#0f172a' : '#94a3b8',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: hasPrev ? 'pointer' : 'not-allowed',
                    }}
                  >
                    ⬅ Previous
                  </button>
                  <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                    {previewSnapshot.currentIndex + 1} / {totalCount}
                  </span>
                  <button
                    disabled={!hasNext}
                    onClick={() =>
                      setPreviewSnapshot((prev) =>
                        prev ? { ...prev, currentIndex: Math.min(prev.list.length - 1, prev.currentIndex + 1) } : null
                      )
                    }
                    style={{
                      padding: '0.5rem 0.9rem',
                      background: hasNext ? '#2563eb' : '#f1f5f9',
                      color: hasNext ? '#fff' : '#94a3b8',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 700,
                      cursor: hasNext ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Next Snapshot ➡
                  </button>
                  <button
                    onClick={() => setPreviewSnapshot(null)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#0f172a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />
    </div>
  );
}
