let sections = [];
let videos = [];
let selectedSectionId = null;
let currentMonitoringData = [];

document.addEventListener('DOMContentLoaded', async () => {
  checkAuthAndRedirect();
  await loadStaffProfile();
  await loadSectionsAndVideos();

  document.getElementById('createSectionForm').addEventListener('submit', handleCreateSection);
  document.getElementById('createVideoForm').addEventListener('submit', handleCreateVideo);
  document.getElementById('enrollForm').addEventListener('submit', handleEnrollStudent);
  document.getElementById('createAssignmentForm').addEventListener('submit', handleCreateAssignment);

  // Auto-detect video duration from video URL
  const vidUrlInput = document.getElementById('vidUrlInput');
  if (vidUrlInput) {
    vidUrlInput.addEventListener('change', () => {
      const url = vidUrlInput.value.trim();
      if (url) {
        const tempVid = document.createElement('video');
        tempVid.preload = 'metadata';
        tempVid.src = url;
        tempVid.onloadedmetadata = () => {
          if (tempVid.duration && !isNaN(tempVid.duration)) {
            document.getElementById('vidDurInput').value = Math.round(tempVid.duration);
          }
        };
      }
    });
  }

  // Poll monitoring data every 10 seconds
  setInterval(() => {
    if (selectedSectionId) {
      loadMonitoringReport();
    }
  }, 10000);
});

async function loadStaffProfile() {
  try {
    const data = await apiFetch('/auth/me');
    document.getElementById('staffName').innerText = data.user.full_name;
    document.getElementById('staffId').innerText = `ID: ${data.user.user_id}`;
  } catch (err) {
    console.error('Failed to load staff profile:', err);
  }
}

async function loadSectionsAndVideos() {
  try {
    sections = await apiFetch('/sections');
    videos = await apiFetch('/videos');

    renderSections();
    renderVideoOptions();

    if (sections.length > 0 && selectedSectionId === null) {
      selectSection(sections[0].id);
    }
  } catch (err) {
    console.error('Error loading sections and videos:', err);
  }
}

function renderSections() {
  const container = document.getElementById('sectionsList');
  if (sections.length === 0) {
    container.innerHTML = `<div style="color: #64748b;">No sections created yet.</div>`;
    return;
  }

  container.innerHTML = sections.map(s => `
    <div onclick="selectSection(${s.id})" style="
      padding: 0.75rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      background: ${selectedSectionId === s.id ? '#dbeafe' : '#f8fafc'};
      border: ${selectedSectionId === s.id ? '2px solid #2563eb' : '1px solid #e2e8f0'};
      color: ${selectedSectionId === s.id ? '#1e40af' : '#0f172a'};
      font-weight: ${selectedSectionId === s.id ? '700' : '500'};
    ">
      ${s.name}
    </div>
  `).join('');
}

function renderVideoOptions() {
  const select = document.getElementById('assignVideoSelect');
  const list = document.getElementById('videosList');

  select.innerHTML = `<option value="">-- Select Video from Library --</option>` +
    videos.map(v => `<option value="${v.id}">${v.title} (${Math.floor(v.duration_sec / 60)}m ${v.duration_sec % 60}s)</option>`).join('');

  list.innerHTML = videos.map(v => `
    <div style="padding: 0.625rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
      <div>
        <strong style="color: #0f172a;">${v.title}</strong>
        <div style="color: #64748b; font-size: 0.75rem;">${Math.floor(v.duration_sec / 60)}m ${v.duration_sec % 60}s</div>
      </div>
      <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="quickPublishVideo(${v.id})">
        🚀 Send to Students
      </button>
    </div>
  `).join('');
}

async function quickPublishVideo(videoId) {
  if (!selectedSectionId) {
    alert('Please select a section on the left first!');
    return;
  }
  const vid = videos.find(v => v.id === videoId);
  if (!vid) return;

  try {
    await apiFetch('/assignments', {
      method: 'POST',
      body: JSON.stringify({
        sectionId: selectedSectionId,
        videoId: vid.id,
        title: vid.title,
        sourceUrl: vid.source_url,
        durationSec: vid.duration_sec,
        completionThreshold: 0.8
      })
    });
    alert(`✅ Video "${vid.title}" published to enrolled students successfully!`);
    await loadSectionDetails(selectedSectionId);
  } catch (err) {
    alert(err.message);
  }
}

async function selectSection(sectionId) {
  selectedSectionId = sectionId;
  renderSections();
  await loadSectionDetails(sectionId);
}

async function loadSectionDetails(sectionId) {
  try {
    await loadMonitoringReport();

    const assignments = await apiFetch(`/assignments/section/${sectionId}`);
    const assignList = document.getElementById('assignmentsList');
    if (assignments.length === 0) {
      assignList.innerHTML = `<div style="color: #64748b;">No active assignments.</div>`;
    } else {
      assignList.innerHTML = assignments.map(a => `
        <div style="padding: 0.75rem; background: #f8fafc; border-radius: 8px; border-left: 4px solid #2563eb;">
          <strong>${a.title}</strong>
          <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.25rem;">
            Duration: ${Math.floor(a.duration_sec / 60)}m ${a.duration_sec % 60}s | Threshold: ${Math.round(a.completion_threshold * 100)}%
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load section details:', err);
  }
}

async function loadMonitoringReport() {
  if (!selectedSectionId) return;
  try {
    currentMonitoringData = await apiFetch(`/staff/monitoring/${selectedSectionId}`);
    document.getElementById('studentCountText').innerText = `${currentMonitoringData.length} Students`;
    renderMonitoringTable();
  } catch (err) {
    console.error('Failed to load monitoring report:', err);
  }
}

function renderMonitoringTable() {
  const tbody = document.getElementById('monitoringTableBody');
  if (currentMonitoringData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #64748b;">No students enrolled yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = currentMonitoringData.map(s => {
    const mainReport = s.assignments_report && s.assignments_report.length > 0 ? s.assignments_report[0] : null;
    const watchedPercent = mainReport ? mainReport.watched_percent : 0;
    const badgeText = mainReport ? mainReport.status_badge : '🔴 Unwatched';

    let badgeClass = 'badge-attentive-red';
    if (badgeText.includes('Highly')) badgeClass = 'badge-attentive-green';
    else if (badgeText.includes('Partial')) badgeClass = 'badge-attentive-yellow';

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: #0f172a;">${s.user_id}</div>
          <div style="font-size: 0.85rem; color: #475569;">${s.full_name}</div>
        </td>
        <td>
          <div style="display: flex; align-items: center;">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${watchedPercent}%;"></div>
            </div>
            <strong style="font-size: 0.85rem; color: #0f172a;">${watchedPercent}%</strong>
          </div>
        </td>
        <td>
          <span class="badge ${badgeClass}" style="font-size: 0.75rem;">${badgeText}</span>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-outline" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;" onclick="viewStudentReport(${s.id})">
            👁️ View Details & Report
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function viewStudentReport(studentId) {
  const student = currentMonitoringData.find(s => s.id === studentId);
  if (!student) return;

  document.getElementById('srStudentName').innerText = `Record & Monitoring log for ${student.full_name}`;
  document.getElementById('srRollNo').innerText = student.user_id;
  document.getElementById('srDept').innerText = student.department || 'N/A';
  document.getElementById('srEmail').innerText = student.email || 'N/A';
  document.getElementById('srYear').innerText = student.year_of_join || 'N/A';
  document.getElementById('srPhone').innerText = student.phone || 'N/A';
  document.getElementById('srDob').innerText = student.date_of_birth || 'N/A';
  document.getElementById('srBeacon').innerText = student.beacon_uuid || 'N/A';
  document.getElementById('srAddress').innerText = student.address || 'N/A';

  const container = document.getElementById('srAssignmentsContainer');
  if (!student.assignments_report || student.assignments_report.length === 0) {
    container.innerHTML = `<div style="color: #64748b;">No video assignments available.</div>`;
  } else {
    container.innerHTML = student.assignments_report.map(r => `
      <div style="padding: 0.875rem; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
        <div style="font-weight: 700; color: #0f172a; margin-bottom: 0.25rem;">${r.assignment_title}</div>
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #475569; margin-bottom: 0.5rem;">
          <span>Watched: <strong>${Math.floor(r.watched_sec / 60)}m ${r.watched_sec % 60}s</strong> / ${Math.floor(r.total_sec / 60)}m ${r.total_sec % 60}s (${r.watched_percent}%)</span>
          <span>${r.completed ? '✅ Completion Goal Met' : '⏳ Pending'}</span>
        </div>
        <div style="font-size: 0.8rem; color: #64748b;">Attentive Monitor Status: <strong>${r.status_badge}</strong> | Last Activity: ${r.last_beat}</div>
      </div>
    `).join('');
  }

  document.getElementById('studentReportModal').style.display = 'flex';
}

function closeStudentReportModal() {
  document.getElementById('studentReportModal').style.display = 'none';
}

async function handleCreateSection(e) {
  e.preventDefault();
  const name = document.getElementById('secNameInput').value.trim();
  if (!name) return;

  try {
    await apiFetch('/sections', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    document.getElementById('secNameInput').value = '';
    await loadSectionsAndVideos();
  } catch (err) {
    alert(err.message);
  }
}

async function handleCreateVideo(e) {
  e.preventDefault();
  const title = document.getElementById('vidTitleInput').value.trim();
  const sourceUrl = document.getElementById('vidUrlInput').value.trim();
  const durationSec = Number(document.getElementById('vidDurInput').value) || 300;

  try {
    await apiFetch('/videos', {
      method: 'POST',
      body: JSON.stringify({ title, sourceUrl, durationSec })
    });
    document.getElementById('vidTitleInput').value = '';
    document.getElementById('vidUrlInput').value = '';
    await loadSectionsAndVideos();
  } catch (err) {
    alert(err.message);
  }
}

async function handleEnrollStudent(e) {
  e.preventDefault();
  if (!selectedSectionId) return alert('Please select a section first');
  const studentId = document.getElementById('enrollStudentId').value.trim();

  try {
    await apiFetch(`/sections/${selectedSectionId}/enroll`, {
      method: 'POST',
      body: JSON.stringify({ studentId })
    });
    document.getElementById('enrollStudentId').value = '';
    await loadSectionDetails(selectedSectionId);
  } catch (err) {
    alert(err.message);
  }
}

async function handleCreateAssignment(e) {
  e.preventDefault();
  if (!selectedSectionId) return alert('Please select a section first');

  const videoId = Number(document.getElementById('assignVideoSelect').value);
  const title = document.getElementById('assignTitleInput').value.trim();
  const threshold = Number(document.getElementById('assignThresholdInput').value);

  const vid = videos.find(v => v.id === videoId);
  if (!vid) return alert('Please select a video');

  try {
    await apiFetch('/assignments', {
      method: 'POST',
      body: JSON.stringify({
        sectionId: selectedSectionId,
        videoId,
        title: title || vid.title,
        sourceUrl: vid.source_url,
        durationSec: vid.duration_sec,
        completionThreshold: threshold
      })
    });
    document.getElementById('assignTitleInput').value = '';
    await loadSectionDetails(selectedSectionId);
  } catch (err) {
    alert(err.message);
  }
}
