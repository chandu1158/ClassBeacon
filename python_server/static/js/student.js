document.addEventListener('DOMContentLoaded', async () => {
  checkAuthAndRedirect();
  await loadStudentProfile();
  await loadStudentLessons();

  // Auto-refresh lessons every 10 seconds
  setInterval(() => {
    loadStudentLessons();
  }, 10000);
});

async function loadStudentProfile() {
  try {
    const data = await apiFetch('/auth/me');
    const u = data.user;

    document.getElementById('stuRollBadge').innerText = `Roll No: ${u.user_id}`;
    document.getElementById('sFullName').innerText = u.full_name || 'N/A';
    document.getElementById('sEmail').innerText = u.email || 'N/A';
    document.getElementById('sDept').innerText = u.department || 'N/A';
    document.getElementById('sYear').innerText = u.year_of_join || 'N/A';
    document.getElementById('sBeaconUuid').innerText = u.beacon_uuid || 'N/A';
    document.getElementById('sPhone').innerText = u.phone || 'N/A';
    document.getElementById('sDob').innerText = u.date_of_birth || 'N/A';
    document.getElementById('sAddress').innerText = u.address || 'N/A';
  } catch (err) {
    console.error('Failed to load student profile:', err);
  }
}

async function loadStudentLessons() {
  const container = document.getElementById('lessonsList');
  try {
    const assignments = await apiFetch('/assignments/student');

    if (assignments.length === 0) {
      container.innerHTML = `<div style="padding: 2rem; text-align: center; color: #64748b; background: #f8fafc; border-radius: 8px;">No assigned video lessons available right now.</div>`;
      return;
    }

    container.innerHTML = assignments.map(a => `
      <div style="
        padding: 1.25rem;
        background: #f8fafc;
        border-radius: 12px;
        border-left: 5px solid #2563eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
      ">
        <div>
          <h3 style="margin: 0 0 0.375rem 0; font-size: 1.1rem; color: #0f172a;">${a.title}</h3>
          <p style="margin: 0; color: #64748b; font-size: 0.875rem;">
            Section: ${a.section_name || 'N/A'} | Duration: ${Math.floor(a.duration_sec / 60)}m ${a.duration_sec % 60}s | Required Completion: ${Math.round((a.completion_threshold || 0.8) * 100)}%
          </p>
        </div>

        <button class="btn btn-primary" onclick="watchLesson(${a.id})">▶ Watch Video Lesson</button>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="padding: 1rem; background: #fee2e2; color: #991b1b; border-radius: 8px;">⚠️ ${err.message}</div>`;
  }
}

function watchLesson(assignmentId) {
  window.location.href = `/lesson/${assignmentId}`;
}
