import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@cb/contexts/AuthContext';
import { api } from '@cb/lib/api';
import type { UserProfile, UserRole } from '@cb/types/user';
import ChangePasswordModal from '@cb/components/ChangePasswordModal';

interface SectionStaff {
  id: number;
  user_id: string;
  full_name: string;
  email: string;
  department?: string;
}

interface SectionItem {
  id: number;
  section_code: string;
  name: string;
  owner_id: number;
  owner_name?: string;
  owner_email?: string;
  student_count?: number;
  staff?: SectionStaff[];
}

interface EnrolledStudent {
  enrollment_id: number;
  student_id: number;
  id: number;
  user_id: string;
  roll_number: string;
  full_name: string;
  email: string;
  department?: string;
  phone?: string;
  beacon_uuid?: string;
  enrolled_at?: string;
}

export default function AdminDashboardPage(): ReactNode {
  const { user, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState<'users' | 'sections'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'staff' | 'student'>('all');

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState<UserProfile | null>(null);

  // Form state for creating account
  const [newRole, setNewRole] = useState<UserRole>('student');
  const [newUserId, setNewUserId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('12345');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDept, setNewDept] = useState('Computer Science & Engineering');
  const [newYear, setNewYear] = useState('2026');
  const [newDob, setNewDob] = useState('2005-01-01');
  const [newAddress, setNewAddress] = useState('');
  const [newBeaconUuid, setNewBeaconUuid] = useState('');

  // Edit User Account & Section state
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUserId, setEditUserId] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editBeaconUuid, setEditBeaconUuid] = useState('');
  const [editActive, setEditActive] = useState<number>(1);
  const [editPassword, setEditPassword] = useState('');
  const [editSectionIds, setEditSectionIds] = useState<number[]>([]);
  const [editAssignSectionId, setEditAssignSectionId] = useState<string>('');
  const [editNewSecName, setEditNewSecName] = useState<string>('');
  const [editNewSecCode, setEditNewSecCode] = useState<string>('');
  const [editUserMsg, setEditUserMsg] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  // Section options for account creation
  const [sectionMode, setSectionMode] = useState<'existing' | 'new' | 'none'>('existing');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [newSecName, setNewSecName] = useState('');
  const [newSecCode, setNewSecCode] = useState('');

  const [showCreatePass, setShowCreatePass] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  // Section Management State
  const [isCreateSectionModalOpen, setIsCreateSectionModalOpen] = useState(false);
  const [isEditSectionModalOpen, setIsEditSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<SectionItem | null>(null);
  const [sectionFormName, setSectionFormName] = useState('');
  const [sectionFormCode, setSectionFormCode] = useState('');
  const [sectionFormTeacherId, setSectionFormTeacherId] = useState<string>('');
  const [sectionMsg, setSectionMsg] = useState<string | null>(null);

  // Enrolled Students modal
  const [viewingSectionStudents, setViewingSectionStudents] = useState<SectionItem | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [enrollStudentInput, setEnrollStudentInput] = useState('');
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Auto divide state
  const [autoDivideLoading, setAutoDivideLoading] = useState(false);
  const [autoDivideMsg, setAutoDivideMsg] = useState<string | null>(null);

  const fetchData = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const userData = await api.get<{ users: UserProfile[] }>('/admin/users');
      setUsers(Array.isArray(userData.users) ? userData.users : []);

      const secData = await api.get<SectionItem[]>('/sections');
      const secList = Array.isArray(secData) ? secData : [];
      setSections(secList);
      if (secList.length > 0 && secList[0] && !selectedSectionId) {
        setSelectedSectionId(String(secList[0].id));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch dashboard data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleCreateUser = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setCreating(true);
    setCreateMsg(null);

    try {
      const payload: Record<string, unknown> = {
        user_id: newUserId.trim(),
        email: newEmail.trim(),
        password: newPassword,
        full_name: newFullName.trim(),
        role: newRole,
        phone: newPhone.trim(),
        department: newDept,
        year_of_join: Number(newYear) || 2026,
        date_of_birth: newDob,
        address: newAddress.trim(),
        beacon_uuid: newBeaconUuid.trim() || `BCN-${newUserId.trim()}`,
      };

      if (sectionMode === 'existing' && selectedSectionId) {
        payload['section_id'] = Number(selectedSectionId);
      } else if (sectionMode === 'new' && newSecName.trim()) {
        payload['new_section_name'] = newSecName.trim();
        payload['new_section_code'] = newSecCode.trim();
      }

      await api.post<{ message: string }>('/admin/users', payload);

      setCreateMsg('✅ User account created and section assigned successfully!');
      setTimeout(() => {
        setIsCreateModalOpen(false);
        setCreateMsg(null);
        void fetchData();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create user';
      setCreateMsg(`❌ ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEditModal = (u: UserProfile): void => {
    setEditingUser(u);
    setEditFullName(u.full_name || '');
    setEditUserId(u.user_id || '');
    setEditEmail(u.email || '');
    setEditPhone(u.phone || '');
    setEditDept(u.department || 'Computer Science & Engineering');
    setEditYear(u.year_of_join ? String(u.year_of_join) : '2024');
    setEditDob(u.date_of_birth ? String(u.date_of_birth).slice(0, 10) : '');
    setEditAddress(u.address || '');
    setEditBeaconUuid(u.beacon_uuid || '');
    setEditActive(u.active ? 1 : 0);
    setEditPassword('');
    const curSecIds = u.assigned_sections && u.assigned_sections.length > 0
      ? u.assigned_sections.map((s) => s.id)
      : (u.section_id ? [u.section_id] : []);
    setEditSectionIds(curSecIds);
    setEditAssignSectionId('');
    setEditNewSecName('');
    setEditNewSecCode('');
    setEditUserMsg(null);
    setIsEditUserModalOpen(true);
  };

  const handleSaveEditUser = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      setSavingUser(true);
      setEditUserMsg(null);

      const payload: Record<string, unknown> = {
        full_name: editFullName.trim(),
        user_id: editUserId.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        department: editDept.trim(),
        year_of_join: editYear ? Number(editYear) : null,
        date_of_birth: editDob || null,
        address: editAddress.trim(),
        beacon_uuid: editBeaconUuid.trim(),
        active: editActive,
        section_ids: editSectionIds,
      };

      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }

      if (editNewSecName.trim()) {
        payload.new_section_name = editNewSecName.trim();
        if (editNewSecCode.trim()) {
          payload.new_section_code = editNewSecCode.trim();
        }
      }

      await api.put(`/admin/users/${editingUser.id}`, payload);
      setEditUserMsg('✅ User details and sections updated successfully!');
      await fetchData();
      setTimeout(() => {
        setIsEditUserModalOpen(false);
        setEditingUser(null);
      }, 1000);
    } catch (err: unknown) {
      setEditUserMsg(`❌ ${err instanceof Error ? err.message : 'Failed to update user'}`);
    } finally {
      setSavingUser(false);
    }
  };

  const handleCreateSection = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!sectionFormName.trim()) return;

    try {
      setSectionMsg(null);
      await api.post('/sections', {
        name: sectionFormName.trim(),
        section_code: sectionFormCode.trim() || undefined,
        owner_id: sectionFormTeacherId ? Number(sectionFormTeacherId) : undefined,
      });

      setSectionMsg('✅ Section created successfully!');
      setTimeout(() => {
        setIsCreateSectionModalOpen(false);
        setSectionFormName('');
        setSectionFormCode('');
        setSectionFormTeacherId('');
        setSectionMsg(null);
        void fetchData();
      }, 1000);
    } catch (err: unknown) {
      setSectionMsg(`❌ ${err instanceof Error ? err.message : 'Failed to create section'}`);
    }
  };

  const handleUpdateSection = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!editingSection || !sectionFormName.trim()) return;

    try {
      setSectionMsg(null);
      await api.put(`/sections/${editingSection.id}`, {
        name: sectionFormName.trim(),
        section_code: sectionFormCode.trim() || undefined,
        owner_id: sectionFormTeacherId ? Number(sectionFormTeacherId) : undefined,
        staff_ids: sectionFormTeacherId ? [Number(sectionFormTeacherId)] : [],
      });

      setSectionMsg('✅ Section updated successfully!');
      setTimeout(() => {
        setIsEditSectionModalOpen(false);
        setEditingSection(null);
        setSectionMsg(null);
        void fetchData();
      }, 1000);
    } catch (err: unknown) {
      setSectionMsg(`❌ ${err instanceof Error ? err.message : 'Failed to update section'}`);
    }
  };

  const handleDeleteSection = async (secId: number, secName: string): Promise<void> => {
    if (!window.confirm(`Are you sure you want to delete section "${secName}"? All enrollments will be removed.`)) {
      return;
    }

    try {
      await api.delete(`/sections/${secId}`);
      await fetchData();
    } catch (err: unknown) {
      alert(`Failed to delete section: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleOpenStudentsModal = async (sec: SectionItem): Promise<void> => {
    setViewingSectionStudents(sec);
    setLoadingStudents(true);
    setEnrollError(null);
    try {
      const list = await api.get<EnrolledStudent[]>(`/sections/${sec.id}/students`);
      setEnrolledStudents(Array.isArray(list) ? list : []);
    } catch (err: unknown) {
      setEnrollError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleEnrollStudent = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!viewingSectionStudents || !enrollStudentInput.trim()) return;

    try {
      setEnrollError(null);
      await api.post(`/sections/${viewingSectionStudents.id}/enroll`, {
        student_user_id: enrollStudentInput.trim(),
      });
      setEnrollStudentInput('');
      // Refresh students
      const list = await api.get<EnrolledStudent[]>(`/sections/${viewingSectionStudents.id}/students`);
      setEnrolledStudents(Array.isArray(list) ? list : []);
      void fetchData();
    } catch (err: unknown) {
      setEnrollError(err instanceof Error ? err.message : 'Failed to enroll student');
    }
  };

  const handleRemoveStudent = async (studentId: number): Promise<void> => {
    if (!viewingSectionStudents) return;
    try {
      await api.delete(`/sections/${viewingSectionStudents.id}/students/${studentId}`);
      setEnrolledStudents((prev) => prev.filter((s) => s.student_id !== studentId && s.id !== studentId));
      void fetchData();
    } catch (err: unknown) {
      alert(`Failed to remove student: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAutoDivide = async (): Promise<void> => {
    if (!window.confirm('Auto-divide students section-wise? This will assign up to 60 students per teacher and organize them into dedicated sections (e.g. Section A, Section B).')) {
      return;
    }

    try {
      setAutoDivideLoading(true);
      setAutoDivideMsg(null);
      const res = await api.post<{ message: string; allocationSummary: Array<{ sectionName: string; teacher: string; studentCount: number }> }>(
        '/sections/auto-divide',
        { batch_size: 60, reset: true }
      );
      setAutoDivideMsg(`✅ ${res.message}`);
      await fetchData();
    } catch (err: unknown) {
      setAutoDivideMsg(`❌ ${err instanceof Error ? err.message : 'Failed to divide students'}`);
    } finally {
      setAutoDivideLoading(false);
    }
  };

  const userList = Array.isArray(users) ? users : [];
  const staffMembers = userList.filter((u) => u.role === 'staff');
  const staffCount = staffMembers.length;
  const studentCount = userList.filter((u) => u.role === 'student').length;

  const filteredUsers = userList.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.user_id.toLowerCase().includes(q) ||
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.department && u.department.toLowerCase().includes(q)) ||
      (u.section_name && u.section_name.toLowerCase().includes(q)) ||
      (u.beacon_uuid && u.beacon_uuid.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      {/* Navigation Header */}
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
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>ClassBeacon Admin Portal</h1>
          <span style={{ background: '#3b82f6', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 700 }}>
            ADMIN CONTROL
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
            <div style={{ fontWeight: 600 }}>{user?.full_name}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>ID: {user?.user_id}</div>
          </div>
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

      {/* Main Container */}
      <main style={{ maxWidth: '1280px', margin: '2rem auto', padding: '0 1.5rem' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              background: activeTab === 'users' ? '#2563eb' : 'transparent',
              color: activeTab === 'users' ? '#fff' : '#64748b',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            👥 Accounts & College Roster ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('sections')}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              background: activeTab === 'sections' ? '#2563eb' : 'transparent',
              color: activeTab === 'sections' ? '#fff' : '#64748b',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            🏛️ Section Management System ({sections.length})
          </button>
        </div>

        {/* Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Total Accounts</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>{users.length}</div>
          </div>
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Faculty / Teachers</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#2563eb', marginTop: '0.25rem' }}>{staffCount}</div>
          </div>
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Enrolled Students</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>{studentCount}</div>
          </div>
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>Academic Sections</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.25rem' }}>{sections.length}</div>
          </div>
        </div>

        {/* TAB 1: ACCOUNTS & ROSTER */}
        {activeTab === 'users' && (
          <div>
            {/* Controls Header */}
            <div style={{ background: '#fff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
                <input
                  type="text"
                  placeholder="Search Roll No, Name, Dept, Section..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    padding: '0.625rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    width: '100%',
                    maxWidth: '360px',
                    fontSize: '0.9rem',
                  }}
                />

                <div style={{ display: 'flex', background: '#f1f5f9', padding: '0.25rem', borderRadius: '8px' }}>
                  <button
                    onClick={() => setRoleFilter('all')}
                    style={{
                      padding: '0.5rem 1rem',
                      border: 'none',
                      borderRadius: '6px',
                      background: roleFilter === 'all' ? '#fff' : 'transparent',
                      fontWeight: roleFilter === 'all' ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    All ({users.length})
                  </button>
                  <button
                    onClick={() => setRoleFilter('staff')}
                    style={{
                      padding: '0.5rem 1rem',
                      border: 'none',
                      borderRadius: '6px',
                      background: roleFilter === 'staff' ? '#fff' : 'transparent',
                      fontWeight: roleFilter === 'staff' ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    Staff ({staffCount})
                  </button>
                  <button
                    onClick={() => setRoleFilter('student')}
                    style={{
                      padding: '0.5rem 1rem',
                      border: 'none',
                      borderRadius: '6px',
                      background: roleFilter === 'student' ? '#fff' : 'transparent',
                      fontWeight: roleFilter === 'student' ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    Students ({studentCount})
                  </button>
                </div>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(true)}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                ➕ Create Account
              </button>
            </div>

            {/* Users Table */}
            <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Loading account profiles...</div>
              ) : error ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#ef4444' }}>⚠️ {error}</div>
              ) : filteredUsers.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>No accounts matching criteria.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '1rem' }}>User ID / Roll No</th>
                        <th style={{ padding: '1rem' }}>Full Name</th>
                        <th style={{ padding: '1rem' }}>Role</th>
                        <th style={{ padding: '1rem' }}>Assigned Section</th>
                        <th style={{ padding: '1rem' }}>Department</th>
                        <th style={{ padding: '1rem' }}>Beacon UUID</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '1rem', fontWeight: 700, color: '#0f172a' }}>{u.user_id}</td>
                          <td style={{ padding: '1rem' }}>
                            <div>{u.full_name}</div>
                            <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{u.email}</div>
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <span
                              style={{
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                background: u.role === 'admin' ? '#fee2e2' : u.role === 'staff' ? '#dbeafe' : '#dcfce7',
                                color: u.role === 'admin' ? '#991b1b' : u.role === 'staff' ? '#1e40af' : '#166534',
                              }}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td style={{ padding: '1rem' }}>
                            {u.assigned_sections && u.assigned_sections.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                {u.assigned_sections.map((s) => (
                                  <span
                                    key={s.id}
                                    style={{
                                      background: '#eff6ff',
                                      color: '#1d4ed8',
                                      border: '1px solid #bfdbfe',
                                      padding: '0.2rem 0.5rem',
                                      borderRadius: '6px',
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    🏛️ {s.name} ({s.section_code})
                                  </span>
                                ))}
                              </div>
                            ) : u.section_name ? (
                              <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
                                🏛️ {u.section_name} ({u.section_code})
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Unassigned</span>
                            )}
                          </td>
                          <td style={{ padding: '1rem', color: '#475569' }}>{u.department || 'N/A'}</td>
                          <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#2563eb' }}>{u.beacon_uuid || 'N/A'}</td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              <button
                                onClick={() => handleOpenEditModal(u)}
                                style={{
                                  padding: '0.375rem 0.75rem',
                                  borderRadius: '6px',
                                  border: '1px solid #2563eb',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                }}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                onClick={() => setViewingUser(u)}
                                style={{
                                  padding: '0.375rem 0.75rem',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  background: '#fff',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                }}
                              >
                                👁️ View Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SECTION MANAGEMENT SYSTEM DASHBOARD */}
        {activeTab === 'sections' && (
          <div>
            {autoDivideMsg && (
              <div style={{ padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', background: autoDivideMsg.startsWith('✅') ? '#dcfce7' : '#fee2e2', color: autoDivideMsg.startsWith('✅') ? '#166534' : '#991b1b', fontWeight: 600 }}>
                {autoDivideMsg}
              </div>
            )}

            {/* Top Toolbar */}
            <div style={{ background: '#fff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Academic Sections & Teacher Allocations</h2>
                <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.875rem' }}>
                  Manage sections, assign faculty teachers, and organize students section-wise.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setSectionFormName('');
                    setSectionFormCode('');
                    setSectionFormTeacherId(staffMembers[0] ? String(staffMembers[0].id) : '');
                    setSectionMsg(null);
                    setIsCreateSectionModalOpen(true);
                  }}
                  style={{
                    padding: '0.625rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  ➕ Create New Section
                </button>

                <button
                  onClick={() => void handleAutoDivide()}
                  disabled={autoDivideLoading}
                  style={{
                    padding: '0.625rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#16a34a',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: autoDivideLoading ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                  title="Divide all students into sections with 60 students per teacher"
                >
                  {autoDivideLoading ? '⏳ Dividing...' : '⚡ Auto-Divide Students (60 per Teacher)'}
                </button>
              </div>
            </div>

            {/* Sections Grid / List */}
            {sections.length === 0 ? (
              <div style={{ background: '#fff', padding: '3rem', borderRadius: '12px', textAlign: 'center', color: '#64748b' }}>
                <p style={{ fontSize: '1.1rem', margin: 0 }}>No academic sections created yet.</p>
                <p style={{ margin: '0.5rem 0 1.5rem 0' }}>Click "Create New Section" or use "Auto-Divide Students (60 per Teacher)" to get started.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
                {sections.map((sec) => (
                  <div
                    key={sec.id}
                    style={{
                      background: '#fff',
                      borderRadius: '12px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      border: '1px solid #e2e8f0',
                      padding: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                            {sec.section_code}
                          </span>
                          <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '1.2rem', color: '#0f172a' }}>{sec.name}</h3>
                        </div>
                        <div style={{ background: '#dcfce7', color: '#166534', padding: '0.3rem 0.75rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 700 }}>
                          👥 {sec.student_count || 0} Students
                        </div>
                      </div>

                      <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', border: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>
                          Assigned Teacher / Instructor
                        </div>
                        <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.95rem' }}>
                          👨‍🏫 {sec.owner_name || 'No teacher assigned'}
                        </div>
                        {sec.owner_email && (
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{sec.owner_email}</div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                      <button
                        onClick={() => void handleOpenStudentsModal(sec)}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid #2563eb',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                      >
                        👥 Manage Students ({sec.student_count || 0})
                      </button>

                      <button
                        onClick={() => {
                          setEditingSection(sec);
                          setSectionFormName(sec.name);
                          setSectionFormCode(sec.section_code);
                          setSectionFormTeacherId(String(sec.owner_id));
                          setSectionMsg(null);
                          setIsEditSectionModalOpen(true);
                        }}
                        style={{
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          color: '#334155',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                        title="Edit Section Details & Teacher"
                      >
                        ✏️ Edit
                      </button>

                      <button
                        onClick={() => void handleDeleteSection(sec.id, sec.name)}
                        style={{
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #fecaca',
                          background: '#fff',
                          color: '#dc2626',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                        title="Delete Section"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Change Password Modal */}
      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />

      {/* Create Section Modal */}
      {isCreateSectionModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
          <div style={{ background: '#fff', padding: '2rem', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Create New Academic Section</h2>
              <button onClick={() => setIsCreateSectionModalOpen(false)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>
                &times;
              </button>
            </div>

            {sectionMsg && (
              <div style={{ padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', background: sectionMsg.startsWith('✅') ? '#dcfce7' : '#fee2e2', color: sectionMsg.startsWith('✅') ? '#166534' : '#991b1b', fontSize: '0.875rem' }}>
                {sectionMsg}
              </div>
            )}

            <form onSubmit={(e) => void handleCreateSection(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Section Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Computer Science Section A"
                  value={sectionFormName}
                  onChange={(e) => setSectionFormName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Section Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. CS-SEC-A (Auto-generated if empty)"
                  value={sectionFormCode}
                  onChange={(e) => setSectionFormCode(e.target.value)}
                  style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Assign Faculty / Teacher
                </label>
                <select
                  value={sectionFormTeacherId}
                  onChange={(e) => setSectionFormTeacherId(e.target.value)}
                  style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="">-- Select Teacher --</option>
                  {staffMembers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.user_id}) - {s.department || 'Staff'}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateSectionModalOpen(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Create Section
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Section Modal */}
      {isEditSectionModalOpen && editingSection && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
          <div style={{ background: '#fff', padding: '2rem', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Edit Section & Teacher Assignment</h2>
              <button onClick={() => setIsEditSectionModalOpen(false)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>
                &times;
              </button>
            </div>

            {sectionMsg && (
              <div style={{ padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', background: sectionMsg.startsWith('✅') ? '#dcfce7' : '#fee2e2', color: sectionMsg.startsWith('✅') ? '#166534' : '#991b1b', fontSize: '0.875rem' }}>
                {sectionMsg}
              </div>
            )}

            <form onSubmit={(e) => void handleUpdateSection(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Section Name *
                </label>
                <input
                  type="text"
                  value={sectionFormName}
                  onChange={(e) => setSectionFormName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Section Code
                </label>
                <input
                  type="text"
                  value={sectionFormCode}
                  onChange={(e) => setSectionFormCode(e.target.value)}
                  style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Assigned Teacher / Instructor
                </label>
                <select
                  value={sectionFormTeacherId}
                  onChange={(e) => setSectionFormTeacherId(e.target.value)}
                  style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="">-- Select Teacher --</option>
                  {staffMembers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.user_id}) - {s.department || 'Staff'}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsEditSectionModalOpen(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Enrolled Students Modal */}
      {viewingSectionStudents && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
          <div style={{ background: '#fff', padding: '2rem', borderRadius: '16px', width: '100%', maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
                  Enrolled Students in {viewingSectionStudents.name}
                </h2>
                <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                  Code: {viewingSectionStudents.section_code} | Assigned Teacher: {viewingSectionStudents.owner_name}
                </p>
              </div>
              <button onClick={() => setViewingSectionStudents(null)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>
                &times;
              </button>
            </div>

            {/* Quick Enroll Input */}
            <form onSubmit={(e) => void handleEnrollStudent(e)} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <input
                type="text"
                placeholder="Enter Student Roll No (e.g. STU2026045) or Email"
                value={enrollStudentInput}
                onChange={(e) => setEnrollStudentInput(e.target.value)}
                required
                style={{ flex: 1, padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
              />
              <button
                type="submit"
                style={{ padding: '0.625rem 1.25rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
              >
                ➕ Enroll Student
              </button>
            </form>

            {enrollError && (
              <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                ⚠️ {enrollError}
              </div>
            )}

            {/* Students Table */}
            {loadingStudents ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading students...</div>
            ) : enrolledStudents.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', color: '#64748b' }}>
                No students enrolled in this section yet.
              </div>
            ) : (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                      <th style={{ padding: '0.75rem' }}>#</th>
                      <th style={{ padding: '0.75rem' }}>Roll No</th>
                      <th style={{ padding: '0.75rem' }}>Student Name</th>
                      <th style={{ padding: '0.75rem' }}>Email</th>
                      <th style={{ padding: '0.75rem' }}>Department</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrolledStudents.map((st, idx) => (
                      <tr key={st.enrollment_id || st.student_id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem', color: '#94a3b8' }}>{idx + 1}</td>
                        <td style={{ padding: '0.75rem', fontWeight: 700, color: '#0f172a' }}>{st.roll_number || st.user_id}</td>
                        <td style={{ padding: '0.75rem' }}>{st.full_name}</td>
                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{st.email}</td>
                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{st.department || 'N/A'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          <button
                            onClick={() => void handleRemoveStudent(st.student_id || st.id)}
                            style={{ padding: '0.25rem 0.5rem', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                onClick={() => setViewingSectionStudents(null)}
                style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none', background: '#0f172a', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View User Admission Details Modal */}
      {viewingUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '2rem', borderRadius: '16px', width: '100%', maxWidth: '550px', boxShadow: '0 20px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>College Profile & Admission Details</h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>Full record for {viewingUser.full_name}</p>
              </div>
              <button onClick={() => setViewingUser(null)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>
                &times;
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
              <div>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>USER ID / ROLL NO</strong>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>{viewingUser.user_id}</span>
              </div>
              <div>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>ROLE</strong>
                <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{viewingUser.role}</span>
              </div>
              <div>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>ASSIGNED SECTION(S)</strong>
                <span style={{ fontWeight: 600, color: '#2563eb' }}>
                  {viewingUser.assigned_sections && viewingUser.assigned_sections.length > 0
                    ? viewingUser.assigned_sections.map((s) => `${s.name} (${s.section_code})`).join(', ')
                    : (viewingUser.section_name || 'None')}
                </span>
              </div>
              <div>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>EMAIL ADDRESS</strong>
                <span>{viewingUser.email}</span>
              </div>
              <div>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>PHONE NUMBER</strong>
                <span>{viewingUser.phone || 'N/A'}</span>
              </div>
              <div>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>DEPARTMENT</strong>
                <span>{viewingUser.department || 'N/A'}</span>
              </div>
              <div>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>YEAR OF JOIN</strong>
                <span>{viewingUser.year_of_join || 'N/A'}</span>
              </div>
              <div>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>DATE OF BIRTH</strong>
                <span>{viewingUser.date_of_birth ? String(viewingUser.date_of_birth).slice(0, 10) : 'N/A'}</span>
              </div>
              <div>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>BEACON UUID</strong>
                <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{viewingUser.beacon_uuid || 'N/A'}</span>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <strong style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>COLLEGE ADMISSION ADDRESS</strong>
                <span>{viewingUser.address || 'N/A'}</span>
              </div>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  const target = viewingUser;
                  setViewingUser(null);
                  handleOpenEditModal(target);
                }}
                style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: '1px solid #2563eb', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, cursor: 'pointer' }}
              >
                ✏️ Edit This Profile
              </button>
              <button
                onClick={() => setViewingUser(null)}
                style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none', background: '#0f172a', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Details & Section Assignment Modal */}
      {isEditUserModalOpen && editingUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '2rem', borderRadius: '16px', width: '100%', maxWidth: '640px', boxShadow: '0 20px 25px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Edit User: {editingUser.full_name}</h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>Role: <strong style={{ textTransform: 'uppercase' }}>{editingUser.role}</strong> | User ID: <strong>{editingUser.user_id}</strong></p>
              </div>
              <button onClick={() => setIsEditUserModalOpen(false)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>
                &times;
              </button>
            </div>

            {editUserMsg && (
              <div style={{ padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem', background: editUserMsg.startsWith('✅') ? '#dcfce7' : '#fee2e2', color: editUserMsg.startsWith('✅') ? '#166534' : '#991b1b', fontWeight: 600 }}>
                {editUserMsg}
              </div>
            )}

            <form onSubmit={(e) => void handleSaveEditUser(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Full Name *</label>
                  <input
                    type="text"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>User ID / Roll Number *</label>
                  <input
                    type="text"
                    value={editUserId}
                    onChange={(e) => setEditUserId(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Email Address *</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Mobile / Phone Number</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Department</label>
                  <select
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  >
                    <option value="Computer Science & Engineering">Computer Science & Engineering</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Electronics & Communication Engineering">Electronics & Communication Engineering</option>
                    <option value="Electrical & Electronics Engineering">Electrical & Electronics Engineering</option>
                    <option value="Data Science & AI">Data Science & AI</option>
                    <option value="Administration">Administration</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Account Status</label>
                  <select
                    value={editActive}
                    onChange={(e) => setEditActive(Number(e.target.value))}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  >
                    <option value={1}>🟢 Active Account</option>
                    <option value={0}>🔴 Inactive / Disabled</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Date of Birth</label>
                  <input
                    type="date"
                    value={editDob}
                    onChange={(e) => setEditDob(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Year of Join</label>
                  <input
                    type="number"
                    value={editYear}
                    onChange={(e) => setEditYear(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Beacon UUID</label>
                  <input
                    type="text"
                    value={editBeaconUuid}
                    onChange={(e) => setEditBeaconUuid(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Reset Password (Leave blank to keep current)</label>
                  <input
                    type="text"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="e.g. 12345"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>College Address</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Campus Housing or Residential Address"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              {/* SECTION MANAGEMENT SECTION */}
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#0f172a' }}>
                  {editingUser.role === 'staff' ? '👨‍🏫 Assigned Teaching Sections (Staff can have multiple sections)' : '🎓 Enrolled Section'}
                </h4>

                {editingUser.role === 'staff' ? (
                  <div>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>
                        Current Assigned Sections:
                      </span>
                      {editSectionIds.length === 0 ? (
                        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No sections assigned yet.</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {editSectionIds.map((sid) => {
                            const sec = sections.find((s) => s.id === sid);
                            const label = sec ? `${sec.name} (${sec.section_code})` : `Section #${sid}`;
                            return (
                              <span
                                key={sid}
                                style={{
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '6px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                }}
                              >
                                🏛️ {label}
                                <button
                                  type="button"
                                  onClick={() => setEditSectionIds(editSectionIds.filter((id) => id !== sid))}
                                  title="Unassign section from this staff"
                                  style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem' }}
                                >
                                  &times;
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Add existing section */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                      <select
                        value={editAssignSectionId}
                        onChange={(e) => setEditAssignSectionId(e.target.value)}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                      >
                        <option value="">-- Assign Another Existing Section --</option>
                        {sections
                          .filter((s) => !editSectionIds.includes(s.id))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.section_code})
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (editAssignSectionId && !editSectionIds.includes(Number(editAssignSectionId))) {
                            setEditSectionIds([...editSectionIds, Number(editAssignSectionId)]);
                            setEditAssignSectionId('');
                          }
                        }}
                        style={{ padding: '0.5rem 0.75rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        + Assign Section
                      </button>
                    </div>

                    {/* Or create brand new section and assign */}
                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                        Or Create & Assign a Brand New Section to this Staff:
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <input
                          type="text"
                          placeholder="New Section Name (e.g. Section D)"
                          value={editNewSecName}
                          onChange={(e) => setEditNewSecName(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                        <input
                          type="text"
                          placeholder="Section Code (e.g. SEC-D-60)"
                          value={editNewSecCode}
                          onChange={(e) => setEditNewSecCode(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>
                      Select Enrolled Section:
                    </label>
                    <select
                      value={editSectionIds[0] ? String(editSectionIds[0]) : ''}
                      onChange={(e) => setEditSectionIds(e.target.value ? [Number(e.target.value)] : [])}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    >
                      <option value="">-- Unassigned (No Section) --</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.section_code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsEditUserModalOpen(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  style={{ padding: '0.5rem 1.5rem', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: savingUser ? 'not-allowed' : 'pointer' }}
                >
                  {savingUser ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Account Modal with Section Creation / Selection */}
      {isCreateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '2rem', borderRadius: '16px', width: '100%', maxWidth: '620px', boxShadow: '0 20px 25px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Create Student or Staff Account</h2>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>
                &times;
              </button>
            </div>

            {createMsg && (
              <div style={{ padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem', background: createMsg.startsWith('✅') ? '#dcfce7' : '#fee2e2' }}>
                {createMsg}
              </div>
            )}

            <form onSubmit={(e) => { void handleCreateUser(e); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Account Role</label>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)} style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                    <option value="student">Student</option>
                    <option value="staff">Staff (Teacher)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>User ID / Roll Number</label>
                  <input type="text" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} placeholder="e.g. STU2026121 or STAFF004" required style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Requirement 1: Section Creation and Selection */}
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1e40af', marginBottom: '0.5rem' }}>
                  🏛️ Section Assignment Option
                </label>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="secMode"
                      value="existing"
                      checked={sectionMode === 'existing'}
                      onChange={() => setSectionMode('existing')}
                    />
                    Select Existing Section
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="secMode"
                      value="new"
                      checked={sectionMode === 'new'}
                      onChange={() => setSectionMode('new')}
                    />
                    Create New Section
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="secMode"
                      value="none"
                      checked={sectionMode === 'none'}
                      onChange={() => setSectionMode('none')}
                    />
                    Do Not Assign
                  </label>
                </div>

                {sectionMode === 'existing' && (
                  <div>
                    <select
                      value={selectedSectionId}
                      onChange={(e) => setSelectedSectionId(e.target.value)}
                      style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    >
                      <option value="">-- Choose Section from List --</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.section_code}) - Teacher: {s.owner_name || 'None'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {sectionMode === 'new' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <input
                      type="text"
                      placeholder="New Section Name (e.g. Section C)"
                      value={newSecName}
                      onChange={(e) => setNewSecName(e.target.value)}
                      required={sectionMode === 'new'}
                      style={{ padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                    <input
                      type="text"
                      placeholder="Section Code (e.g. SEC-C)"
                      value={newSecCode}
                      onChange={(e) => setNewSecCode(e.target.value)}
                      style={{ padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Full Name</label>
                  <input type="text" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} required style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Email Address</label>
                  <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Initial Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showCreatePass ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required style={{ width: '100%', padding: '0.625rem', paddingRight: '3rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowCreatePass(!showCreatePass)} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                    {showCreatePass ? '🙈 Hide' : '👁️ Show'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Department</label>
                  <input type="text" value={newDept} onChange={(e) => setNewDept(e.target.value)} style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Year of Join</label>
                  <input type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Phone Number</label>
                  <input type="text" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+91 98765 43210" style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Date of Birth</label>
                  <input type="date" value={newDob} onChange={(e) => setNewDob(e.target.value)} style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Beacon UUID</label>
                <input type="text" value={newBeaconUuid} onChange={(e) => setNewBeaconUuid(e.target.value)} placeholder="Auto-generated if empty" style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>College Admission Address</label>
                <textarea value={newAddress} onChange={(e) => setNewAddress(e.target.value)} rows={2} style={{ width: '100%', padding: '0.625rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsCreateModalOpen(false)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={creating} style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer' }}>
                  {creating ? 'Creating...' : 'Create User Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
