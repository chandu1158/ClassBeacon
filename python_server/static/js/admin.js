let allUsers = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  checkAuthAndRedirect();
  await loadAdminProfile();
  await fetchUsers();

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', renderUsers);
  }

  const createUserForm = document.getElementById('createUserForm');
  if (createUserForm) {
    createUserForm.addEventListener('submit', handleCreateUserSubmit);
  }

  const toggleCreatePass = document.getElementById('toggleCreatePass');
  const createPassword = document.getElementById('createPassword');
  if (toggleCreatePass && createPassword) {
    toggleCreatePass.addEventListener('click', () => {
      if (createPassword.type === 'password') {
        createPassword.type = 'text';
        toggleCreatePass.innerText = '🙈 Hide';
      } else {
        createPassword.type = 'password';
        toggleCreatePass.innerText = '👁️ Show';
      }
    });
  }
});

async function loadAdminProfile() {
  try {
    const data = await apiFetch('/auth/me');
    document.getElementById('adminName').innerText = data.user.full_name;
    document.getElementById('adminId').innerText = `ID: ${data.user.user_id}`;
  } catch (err) {
    console.error('Failed to load admin profile:', err);
  }
}

async function fetchUsers() {
  try {
    const data = await apiFetch('/admin/users');
    allUsers = Array.isArray(data.users) ? data.users : [];
    updateMetrics();
    renderUsers();
  } catch (err) {
    console.error('Fetch users error:', err);
  }
}

function updateMetrics() {
  const staffCount = allUsers.filter(u => u.role === 'staff').length;
  const studentCount = allUsers.filter(u => u.role === 'student').length;

  document.getElementById('totalCount').innerText = allUsers.length;
  document.getElementById('staffCount').innerText = staffCount;
  document.getElementById('studentCount').innerText = studentCount;
}

function setFilter(filter) {
  currentFilter = filter;
  renderUsers();
}

function renderUsers() {
  const query = (document.getElementById('searchInput').value || '').toLowerCase();
  const tbody = document.getElementById('usersTableBody');

  const filtered = allUsers.filter(u => {
    if (currentFilter !== 'all' && u.role !== currentFilter) return false;
    if (!query) return true;
    return (
      (u.user_id && u.user_id.toLowerCase().includes(query)) ||
      (u.full_name && u.full_name.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.department && u.department.toLowerCase().includes(query)) ||
      (u.beacon_uuid && u.beacon_uuid.toLowerCase().includes(query))
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 3rem; color: #64748b;">No matching accounts found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => `
    <tr>
      <td style="font-weight: 700; color: #0f172a;">${u.user_id}</td>
      <td>
        <div style="font-weight: 600;">${u.full_name}</div>
        <div style="color: #64748b; font-size: 0.8rem;">${u.email}</div>
      </td>
      <td>
        <span class="badge badge-${u.role}">${u.role}</span>
      </td>
      <td style="color: #475569;">${u.department || 'N/A'}</td>
      <td style="color: #475569;">${u.year_of_join || 'N/A'}</td>
      <td style="font-family: monospace; font-size: 0.8rem; color: #2563eb;">${u.beacon_uuid || 'N/A'}</td>
      <td style="text-align: right;">
        <button class="btn btn-outline" style="padding: 0.375rem 0.75rem; font-size: 0.8rem;" onclick="viewUserDetail(${u.id})">👁️ View Record</button>
      </td>
    </tr>
  `).join('');
}

function viewUserDetail(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('viewUserNameSub').innerText = `Full admission record for ${user.full_name}`;
  document.getElementById('vUserId').innerText = user.user_id;
  document.getElementById('vRole').innerText = user.role;
  document.getElementById('vEmail').innerText = user.email;
  document.getElementById('vPhone').innerText = user.phone || 'N/A';
  document.getElementById('vDept').innerText = user.department || 'N/A';
  document.getElementById('vYear').innerText = user.year_of_join || 'N/A';
  document.getElementById('vDob').innerText = user.date_of_birth || 'N/A';
  document.getElementById('vBeaconUuid').innerText = user.beacon_uuid || 'N/A';
  document.getElementById('vAddress').innerText = user.address || 'N/A';

  document.getElementById('viewUserModal').style.display = 'flex';
}

function closeViewUserModal() {
  document.getElementById('viewUserModal').style.display = 'none';
}

function openCreateUserModal() {
  document.getElementById('createUserModal').style.display = 'flex';
  document.getElementById('createMsg').style.display = 'none';
}

function closeCreateUserModal() {
  document.getElementById('createUserModal').style.display = 'none';
}

async function handleCreateUserSubmit(e) {
  e.preventDefault();
  const createMsg = document.getElementById('createMsg');
  createMsg.style.display = 'none';

  const role = document.getElementById('createRole').value;
  const user_id = document.getElementById('createUserId').value.trim();
  const full_name = document.getElementById('createFullName').value.trim();
  const email = document.getElementById('createEmail').value.trim();
  const password = document.getElementById('createPassword').value;
  const department = document.getElementById('createDept').value.trim();
  const year_of_join = document.getElementById('createYear').value;
  const phone = document.getElementById('createPhone').value.trim();
  const date_of_birth = document.getElementById('createDob').value;
  const beacon_uuid = document.getElementById('createBeaconUuid').value.trim() || `BCN-${user_id}`;
  const address = document.getElementById('createAddress').value.trim();

  try {
    await apiFetch('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        role, user_id, full_name, email, password, department, year_of_join, phone, date_of_birth, beacon_uuid, address
      })
    });

    createMsg.innerText = '✅ User account created successfully!';
    createMsg.style.background = '#dcfce7';
    createMsg.style.color = '#166534';
    createMsg.style.display = 'block';

    setTimeout(() => {
      closeCreateUserModal();
      document.getElementById('createUserForm').reset();
      fetchUsers();
    }, 1200);
  } catch (err) {
    createMsg.innerText = `❌ ${err.message}`;
    createMsg.style.background = '#fee2e2';
    createMsg.style.color = '#991b1b';
    createMsg.style.display = 'block';
  }
}
