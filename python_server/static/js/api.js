const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('cb_token');
}

function setToken(token) {
  if (token) {
    localStorage.setItem('cb_token', token);
  } else {
    localStorage.removeItem('cb_token');
  }
}

async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status} error`);
  }

  return data;
}

function checkAuthAndRedirect() {
  const token = getToken();
  if (!token && !window.location.pathname.includes('/login') && window.location.pathname !== '/') {
    window.location.href = '/login';
  }
}

function logout() {
  setToken(null);
  window.location.href = '/login';
}

// Password change helper
async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('modalCurrentPass').value;
  const newPassword = document.getElementById('modalNewPass').value;
  const confirmPassword = document.getElementById('modalConfirmPass').value;
  const errorEl = document.getElementById('modalPassError');
  const successEl = document.getElementById('modalPassSuccess');

  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  if (newPassword !== confirmPassword) {
    errorEl.innerText = 'New password and confirm password do not match.';
    errorEl.style.display = 'block';
    return;
  }

  if (newPassword.length < 6) {
    errorEl.innerText = 'New password must be at least 6 characters long.';
    errorEl.style.display = 'block';
    return;
  }

  try {
    await apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    successEl.innerText = '✅ Password updated successfully!';
    successEl.style.display = 'block';
    document.getElementById('changePassForm').reset();
    setTimeout(() => {
      closePasswordModal();
    }, 1500);
  } catch (err) {
    errorEl.innerText = err.message;
    errorEl.style.display = 'block';
  }
}

function openPasswordModal() {
  document.getElementById('changePassModal').style.display = 'flex';
}

function closePasswordModal() {
  document.getElementById('changePassModal').style.display = 'none';
  document.getElementById('modalPassError').style.display = 'none';
  document.getElementById('modalPassSuccess').style.display = 'none';
}
