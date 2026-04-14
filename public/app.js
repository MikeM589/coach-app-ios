// ============================================================
// STATE
// ============================================================
let teams = [];
let currentSchedule = {};
let currentReminders = []; // { text, isDefault, checked }
let homeworkItems = []; // array of strings

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Set up UI immediately so navigation and forms always work
  setupNav();
  setDefaultWeek();
  setupEmailForm();
  setupTeamForm();
  setupPlayerTeamSelect();
  setupPlayerForm();
  setupScheduleListeners();
  setupReminderInputs();

  // Initialize database then load data
  try {
    await window.dbService.initializeDatabase();
    loadTeams();
  } catch (err) {
    console.error('Database initialization failed:', err?.message || err?.errorMessage || String(err));
    showToast('Could not open database: ' + (err?.message || err?.errorMessage || String(err)));
  }
});

// ============================================================
// NAVIGATION
// ============================================================
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ============================================================
// UTILITY
// ============================================================
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function showConfirm(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    const p = document.createElement('p');
    p.className = 'confirm-message';
    p.textContent = message;
    const btns = document.createElement('div');
    btns.className = 'confirm-buttons';
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    const ok = document.createElement('button');
    ok.className = 'btn btn-danger';
    ok.textContent = 'Delete';
    btns.append(cancel, ok);
    dialog.append(p, btns);
    overlay.append(dialog);
    document.body.appendChild(overlay);
    cancel.addEventListener('click', () => { overlay.remove(); resolve(false); });
    ok.addEventListener('click', () => { overlay.remove(); resolve(true); });
  });
}

function getSunday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
}

function setDefaultWeek() {
  const today = new Date();
  const sunday = getSunday(today.toISOString().split('T')[0]);
  document.getElementById('email-week').value = sunday;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Parse various date formats into YYYY-MM-DD
function parseDateInput(raw) {
  if (!raw) return '';
  raw = raw.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // MM/DD/YYYY or MM-DD-YYYY
  const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  return '';
}

// Convert YYYY-MM-DD to MM/DD/YYYY for display
function dateToDisplay(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[2]}/${match[3]}/${match[1]}`;
  return dateStr;
}

// ============================================================
// TEAMS
// ============================================================
async function loadTeams() {
  try {
    teams = await window.dbService.getAllTeams();
    renderTeamsList();
    populateTeamDropdowns();
  } catch (err) {
    console.error('Failed to load teams:', err);
  }
}

function getTeamShortName(team) {
  if (team.short_name && team.short_name.trim()) return team.short_name.trim();
  const idx = team.name.lastIndexOf(' - ');
  return idx >= 0 ? team.name.slice(idx + 3).trim() : team.name.trim();
}

function getSelectedTeamIds() {
  return Array.from(document.querySelectorAll('.email-team-checkbox:checked'))
    .map(cb => parseInt(cb.value));
}

function renderEmailTeamCheckboxes() {
  const container = document.getElementById('email-team-list');
  if (!container) return;
  const prevIds = getSelectedTeamIds();
  container.innerHTML = '';
  teams.forEach(t => {
    const label = document.createElement('label');
    label.className = 'team-checkbox-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'email-team-checkbox';
    cb.value = t.id;
    cb.checked = prevIds.includes(t.id);
    cb.addEventListener('change', () => {
      fetchScheduleIfReady();
      loadEmailReminders();
    });
    const span = document.createElement('span');
    span.textContent = t.name;
    label.appendChild(cb);
    label.appendChild(span);
    container.appendChild(label);
  });
}

function populateTeamDropdowns() {
  // Player tab select
  const playerSel = document.getElementById('player-team-select');
  const currentVal = playerSel.value;
  while (playerSel.options.length > 1) playerSel.remove(1);
  teams.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    playerSel.appendChild(opt);
  });
  if (currentVal) playerSel.value = currentVal;

  // Generate tab checkbox list
  renderEmailTeamCheckboxes();
}

function renderTeamsList() {
  const container = document.getElementById('teams-list');
  if (teams.length === 0) {
    container.innerHTML = '<p class="empty-state">No teams yet. Add one above!</p>';
    return;
  }

  container.innerHTML = teams.map(t => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">${escHtml(t.name)}</div>
        <div class="item-detail">Coach ${escHtml(t.coach_name)} &mdash; ${escHtml(t.motto)}</div>
      </div>
      <div class="item-actions">
        <button class="btn btn-edit" onclick="editTeam(${t.id})">Edit</button>
        <button class="btn btn-danger" onclick="deleteTeam(${t.id}, '${escHtml(t.name)}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function setupTeamForm() {
  document.getElementById('team-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('team-edit-id').value;
    const payload = {
      name: document.getElementById('team-name').value.trim(),
      coach_name: document.getElementById('coach-name').value.trim(),
      ical_url: document.getElementById('ical-url').value.trim(),
      motto: document.getElementById('team-motto').value.trim() || 'Bravery. Resilience. Excellence.',
      salutation: document.getElementById('team-salutation').value.trim(),
      phone: document.getElementById('coach-phone').value.trim(),
      email: document.getElementById('coach-email').value.trim(),
      training_jersey: document.getElementById('training-jersey').value.trim(),
      home_jersey: document.getElementById('home-jersey').value.trim(),
      away_jersey: document.getElementById('away-jersey').value.trim(),
      show_end_time: document.getElementById('show-end-time').checked ? 1 : 0,
      short_name: document.getElementById('team-short-name').value.trim()
    };

    try {
      if (editId) {
        await window.dbService.updateTeam(editId, payload);
        showToast('Team updated!');
      } else {
        await window.dbService.createTeam(payload);
        showToast('Team added!');
      }
      cancelTeamEdit();
      loadTeams();
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  });
}

function editTeam(id) {
  const team = teams.find(t => t.id === id);
  if (!team) return;
  document.getElementById('team-edit-id').value = team.id;
  document.getElementById('team-name').value = team.name;
  document.getElementById('coach-name').value = team.coach_name;
  document.getElementById('ical-url').value = team.ical_url || '';
  document.getElementById('team-motto').value = team.motto;
  document.getElementById('team-salutation').value = team.salutation != null ? team.salutation : 'See you all soon!';
  document.getElementById('coach-phone').value = team.phone || '';
  document.getElementById('coach-email').value = team.email || '';
  document.getElementById('training-jersey').value = team.training_jersey || '';
  document.getElementById('home-jersey').value = team.home_jersey || '';
  document.getElementById('away-jersey').value = team.away_jersey || '';
  document.getElementById('show-end-time').checked = team.show_end_time !== 0;
  document.getElementById('team-short-name').value = team.short_name || '';
  document.getElementById('team-submit-btn').textContent = 'Update Team';
  document.getElementById('team-cancel-btn').textContent = 'Cancel';
  document.getElementById('team-cancel-btn').style.display = 'inline-flex';
  document.getElementById('team-name').focus();
  loadTeamReminders(team.id);
}

function cancelTeamEdit() {
  document.getElementById('team-edit-id').value = '';
  document.getElementById('team-form').reset();
  document.getElementById('team-motto').value = 'Bravery. Resilience. Excellence.';
  document.getElementById('team-salutation').value = 'See you all soon!';
  document.getElementById('coach-phone').value = '';
  document.getElementById('coach-email').value = '';
  document.getElementById('training-jersey').value = '';
  document.getElementById('home-jersey').value = '';
  document.getElementById('away-jersey').value = '';
  document.getElementById('show-end-time').checked = true;
  document.getElementById('team-short-name').value = '';
  document.getElementById('team-submit-btn').textContent = 'Save Team';
  document.getElementById('team-cancel-btn').style.display = 'none';
  document.getElementById('team-reminders-card').style.display = 'none';
}

async function deleteTeam(id, name) {
  if (!await showConfirm(`Delete team "${name}" and all its players?`)) return;
  try {
    await window.dbService.deleteTeam(id);
    showToast('Team deleted');
    loadTeams();
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

// ============================================================
// PLAYERS
// ============================================================
function setupPlayerTeamSelect() {
  document.getElementById('player-team-select').addEventListener('change', (e) => {
    const teamId = e.target.value;
    if (teamId) {
      document.getElementById('player-form').style.display = 'block';
      document.getElementById('players-import-card').style.display = 'block';
      loadPlayers(teamId);
    } else {
      document.getElementById('player-form').style.display = 'none';
      document.getElementById('players-import-card').style.display = 'none';
      document.getElementById('players-list-card').style.display = 'none';
    }
  });
}

async function loadPlayers(teamId) {
  try {
    const players = await window.dbService.getPlayersByTeam(teamId);
    renderPlayersList(players);
  } catch (err) {
    console.error('Failed to load players:', err);
  }
}

function renderPlayersList(players) {
  const card = document.getElementById('players-list-card');
  const container = document.getElementById('players-list');
  card.style.display = 'block';

  if (players.length === 0) {
    container.innerHTML = '<p class="empty-state">No players on this team yet.</p>';
    return;
  }

  container.innerHTML = players.map(p => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">${escHtml(p.name)}</div>
        <div class="item-detail">${p.birthday ? 'Birthday: ' + formatDate(p.birthday) : 'No birthday set'}</div>
      </div>
      <div class="item-actions">
        <button class="btn btn-edit" onclick="editPlayer(${p.id}, '${escJs(p.name)}', '${p.birthday || ''}')">Edit</button>
        <button class="btn btn-danger" onclick="deletePlayer(${p.id}, '${escJs(p.name)}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function setupPlayerForm() {
  document.getElementById('player-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const teamId = document.getElementById('player-team-select').value;
    const editId = document.getElementById('player-edit-id').value;
    const payload = {
      team_id: parseInt(teamId),
      name: document.getElementById('player-name').value.trim(),
      birthday: parseDateInput(document.getElementById('player-birthday').value)
    };

    try {
      if (editId) {
        await window.dbService.updatePlayer(editId, payload);
        showToast('Player updated!');
      } else {
        await window.dbService.createPlayer(payload);
        showToast('Player added!');
      }
      cancelPlayerEdit();
      loadPlayers(teamId);
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  });
}

function editPlayer(id, name, birthday) {
  document.getElementById('player-edit-id').value = id;
  document.getElementById('player-name').value = name;
  document.getElementById('player-birthday').value = dateToDisplay(birthday);
  document.getElementById('player-submit-btn').textContent = 'Update Player';
  document.getElementById('player-cancel-btn').style.display = 'inline-flex';
  document.getElementById('player-name').focus();
}

function cancelPlayerEdit() {
  document.getElementById('player-edit-id').value = '';
  document.getElementById('player-name').value = '';
  document.getElementById('player-birthday').value = '';
  document.getElementById('player-submit-btn').textContent = 'Add Player';
  document.getElementById('player-cancel-btn').style.display = 'none';
}

async function deletePlayer(id, name) {
  if (!await showConfirm(`Remove ${name} from the team?`)) return;
  try {
    await window.dbService.deletePlayer(id);
    showToast('Player removed');
    const teamId = document.getElementById('player-team-select').value;
    loadPlayers(teamId);
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

// ============================================================
// SCHEDULE
// ============================================================
function setupScheduleListeners() {
  // Team checkboxes are wired in renderEmailTeamCheckboxes()
  document.getElementById('email-week').addEventListener('change', fetchScheduleIfReady);
}

async function fetchScheduleIfReady() {
  const teamIds = getSelectedTeamIds();
  const weekStart = document.getElementById('email-week').value;
  const section = document.getElementById('schedule-section');

  if (teamIds.length === 0 || !weekStart) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  const hint = document.getElementById('schedule-hint');
  hint.textContent = 'Loading schedule from calendar...';
  hint.style.display = 'block';

  const defaultDay = () => [{ type: 'Off', time: '', endTime: '', location: '', jersey: '', teamId: null }];
  currentSchedule = {};
  DAYS.forEach(d => { currentSchedule[d] = defaultDay(); });

  try {
    const sunday = getSunday(weekStart);
    const results = await Promise.all(
      teamIds.map(id =>
        window.dbService.getTeam(id).then(t => {
          if (!t || !t.ical_url || !t.ical_url.trim()) {
            return { teamId: id, schedule: null };
          }
          return window.getWeekSchedule(t.ical_url, sunday)
            .then(schedule => ({ teamId: id, schedule }))
            .catch(() => ({ teamId: id, schedule: null }));
        })
      )
    );

    const valid = results.filter(r => r.schedule);
    if (valid.length > 0) {
      currentSchedule = mergeSchedules(valid, teamIds[0]);
      hint.textContent = 'Schedule loaded from calendar. You can adjust below.';
    } else {
      hint.textContent = 'No calendar configured. Fill in manually below.';
    }
  } catch (err) {
    hint.textContent = 'Could not load calendar. Fill in manually below.';
  }

  renderScheduleGrid();
}

function mergeSchedules(results, primaryTeamId) {
  const multiTeam = results.length > 1;
  const merged = {};

  DAYS.forEach(day => {
    const allEvents = [];
    results.forEach(({ teamId, schedule }) => {
      const raw = schedule[day] || [];
      const dayEvents = Array.isArray(raw) ? raw : [raw];
      dayEvents.forEach(evt => {
        allEvents.push({ ...evt, jersey: autoJersey(evt.type, teamId), teamId });
      });
    });

    if (allEvents.length === 0) {
      merged[day] = [{ type: 'Off', time: '', endTime: '', location: '', jersey: '', teamId: null }];
      return;
    }

    // Deduplicate: same normalized type + same start time → shared event
    const seen = new Map();
    allEvents.forEach(evt => {
      const key = (evt.type || '').toLowerCase().trim() + '|' + (evt.time || '');
      if (seen.has(key)) {
        seen.get(key).teamId = 'both';
        seen.get(key).jersey = autoJersey(seen.get(key).type, primaryTeamId);
      } else {
        seen.set(key, { ...evt });
      }
    });

    // For team-specific game events in multi-team mode, prefix type with short team name
    const dayResult = Array.from(seen.values()).map(evt => {
      if (multiTeam && evt.teamId !== 'both' && evt.teamId !== null) {
        const team = teams.find(t => t.id === evt.teamId);
        if (team && /^game (vs |@ )/i.test(evt.type)) {
          const shortName = getTeamShortName(team);
          return { ...evt, type: evt.type.replace(/^game /i, `${shortName} `) };
        }
      }
      return evt;
    });

    merged[day] = dayResult;
  });

  return merged;
}

function getTeamJerseys(teamId) {
  const team = teams.find(t => String(t.id) === String(teamId));
  return {
    training: team?.training_jersey || '',
    home: team?.home_jersey || '',
    away: team?.away_jersey || ''
  };
}

function getSelectedTeamShowEndTime() {
  const ids = getSelectedTeamIds();
  const team = ids.length > 0 ? teams.find(t => t.id === ids[0]) : null;
  return team ? team.show_end_time !== 0 : true;
}

function autoJersey(eventType, teamId) {
  const jerseys = getTeamJerseys(teamId || (getSelectedTeamIds()[0] || null));
  const t = (eventType || '').toLowerCase();
  if (t.startsWith('game @ ') || t.includes('away')) {
    return jerseys.away;
  } else if (t.startsWith('game vs ') || t.startsWith('game') || t === 'scrimmage' || t === 'friendly' || t === 'tournament') {
    return jerseys.home;
  } else if (t === 'training' || t === 'practice' || t === 'session' || t === 'drill') {
    return jerseys.training;
  }
  return '';
}

function renderScheduleGrid() {
  const grid = document.getElementById('schedule-grid');
  grid.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'schedule-grid';
  const showEndTime = getSelectedTeamShowEndTime();
  const multiTeam = getSelectedTeamIds().length > 1;

  DAYS.forEach(day => {
    const events = currentSchedule[day] || [{ type: 'Off', time: '', endTime: '', location: '', jersey: '', teamId: null }];

    const dayBlock = document.createElement('div');
    dayBlock.className = 'schedule-day-block';
    dayBlock.dataset.day = day;

    const dayHeader = document.createElement('div');
    dayHeader.className = 'schedule-day-header';
    dayHeader.innerHTML = `
      <span class="day-label">${day}</span>
      <button type="button" class="btn-add-event" onclick="addEvent('${day}')" title="Add event">+</button>
    `;
    dayBlock.appendChild(dayHeader);

    events.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'schedule-event-row';
      const endTimeHtml = showEndTime
        ? `<input type="text" data-day="${day}" data-idx="${idx}" data-field="endTime" placeholder="End" value="${escAttr(entry.endTime || '')}" class="time-input">`
        : '';
      let teamBadgeHtml = '';
      if (multiTeam && entry.teamId) {
        let label = '';
        if (entry.teamId === 'both') {
          label = 'Both';
        } else {
          const t = teams.find(t => t.id === entry.teamId);
          label = t ? getTeamShortName(t) : '';
        }
        if (label) teamBadgeHtml = `<span class="team-badge">${escHtml(label)}</span>`;
      }
      row.innerHTML = `
        <input type="text" list="event-types" data-day="${day}" data-idx="${idx}" data-field="type" placeholder="Off" value="${escAttr(entry.type)}">
        <input type="text" data-day="${day}" data-idx="${idx}" data-field="time" placeholder="Start" value="${escAttr(entry.time)}" class="time-input">${endTimeHtml}
        <input type="text" data-day="${day}" data-idx="${idx}" data-field="jersey" placeholder="Jersey" value="${escAttr(entry.jersey)}" class="jersey-input">
        <input type="text" data-day="${day}" data-idx="${idx}" data-field="location" placeholder="Location" value="${escAttr(entry.location)}">
        <input type="hidden" data-day="${day}" data-idx="${idx}" data-field="teamId" value="${escAttr(String(entry.teamId || ''))}">
        ${teamBadgeHtml}
        ${events.length > 1 ? `<button type="button" class="btn-remove-event" onclick="removeEvent('${day}', ${idx})" title="Remove event">&times;</button>` : ''}
      `;
      dayBlock.appendChild(row);
    });

    container.appendChild(dayBlock);
  });

  // Add datalist for common event types (only once)
  if (!document.getElementById('event-types')) {
    const datalist = document.createElement('datalist');
    datalist.id = 'event-types';
    ['Off', 'Training', 'Game', 'Scrimmage', 'Tournament', 'Practice', 'Meeting', 'Team Building', 'Party', 'Friendly'].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      datalist.appendChild(opt);
    });
    document.body.appendChild(datalist);
  }

  grid.appendChild(container);

  // Listen for changes
  grid.querySelectorAll('input').forEach(el => {
    const handler = () => {
      const day = el.dataset.day;
      const idx = parseInt(el.dataset.idx);
      const field = el.dataset.field;
      if (!currentSchedule[day]) currentSchedule[day] = [{ type: 'Off', time: '', endTime: '', location: '', jersey: '', teamId: null }];
      if (!currentSchedule[day][idx]) return;
      currentSchedule[day][idx][field] = el.value;

      // Auto-assign jersey when event type changes
      if (field === 'type') {
        const evtTeamId = currentSchedule[day][idx].teamId;
        const jersey = autoJersey(el.value, evtTeamId);
        currentSchedule[day][idx].jersey = jersey;
        const jerseyInput = grid.querySelector(`[data-day="${day}"][data-idx="${idx}"][data-field="jersey"]`);
        if (jerseyInput) jerseyInput.value = jersey;
      }
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  });
}

function addEvent(day) {
  if (!currentSchedule[day]) currentSchedule[day] = [];
  currentSchedule[day].push({ type: 'Off', time: '', endTime: '', location: '', jersey: '', teamId: null });
  renderScheduleGrid();
}

function removeEvent(day, idx) {
  if (!currentSchedule[day] || currentSchedule[day].length <= 1) return;
  currentSchedule[day].splice(idx, 1);
  renderScheduleGrid();
}

// ============================================================
// REMINDERS (email form)
// ============================================================

async function loadEmailReminders() {
  const teamIds = getSelectedTeamIds();
  const section = document.getElementById('reminders-section');

  if (teamIds.length === 0) {
    section.style.display = 'none';
    currentReminders = [];
    return;
  }

  section.style.display = 'block';

  try {
    const allReminders = await Promise.all(
      teamIds.map(id => window.dbService.getRemindersByTeam(id).catch(() => []))
    );
    const seen = new Set();
    currentReminders = allReminders.flat()
      .filter(r => {
        const key = r.text.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(r => ({ text: r.text, isDefault: true, checked: true }));
  } catch (err) {
    currentReminders = [];
  }

  renderEmailReminders();
}

function renderEmailReminders() {
  const container = document.getElementById('reminders-checklist');

  if (currentReminders.length === 0) {
    container.innerHTML = '<p class="empty-state" style="padding:0.5rem;">No default reminders for this team.</p>';
    return;
  }

  container.innerHTML = currentReminders.map((r, i) => `
    <div class="reminder-check-item">
      <input type="checkbox" data-reminder-idx="${i}" ${r.checked ? 'checked' : ''}>
      <span class="reminder-text">${escHtml(r.text)}</span>
      ${r.isDefault ? '<span class="reminder-tag">default</span>' : `<button class="btn-remove-reminder" onclick="removeOneOffReminder(${i})" title="Remove">&times;</button>`}
    </div>
  `).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.reminderIdx);
      currentReminders[idx].checked = cb.checked;
    });
  });
}

function addOneOffReminder() {
  const input = document.getElementById('reminder-add-input');
  const text = input.value.trim();
  if (!text) return;

  currentReminders.push({ text, isDefault: false, checked: true });
  input.value = '';
  renderEmailReminders();
}

function removeOneOffReminder(idx) {
  currentReminders.splice(idx, 1);
  renderEmailReminders();
}

function setupReminderInputs() {
  document.getElementById('reminder-add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addOneOffReminder(); }
  });
  document.getElementById('team-reminder-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTeamReminder(); }
  });
  document.getElementById('homework-add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addHomeworkItem(); }
  });
}

// ============================================================
// REMINDERS (team management)
// ============================================================

async function loadTeamReminders(teamId) {
  const card = document.getElementById('team-reminders-card');
  if (!teamId) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  try {
    const reminders = await window.dbService.getRemindersByTeam(teamId);
    renderTeamReminders(reminders);
  } catch (err) {
    console.error('Failed to load team reminders:', err);
  }
}

function renderTeamReminders(reminders) {
  const container = document.getElementById('team-reminders-list');

  if (reminders.length === 0) {
    container.innerHTML = '<p class="empty-state" style="padding:0.75rem;">No default reminders yet.</p>';
    return;
  }

  container.innerHTML = reminders.map(r => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">${escHtml(r.text)}</div>
      </div>
      <div class="item-actions">
        <button class="btn btn-danger" onclick="deleteTeamReminder(${r.id})">Remove</button>
      </div>
    </div>
  `).join('');
}

async function addTeamReminder() {
  const editId = document.getElementById('team-edit-id').value;
  if (!editId) {
    showToast('Save the team first, then add reminders');
    return;
  }

  const input = document.getElementById('team-reminder-input');
  const text = input.value.trim();
  if (!text) return;

  try {
    await window.dbService.createReminder({ team_id: parseInt(editId), text });
    input.value = '';
    showToast('Reminder added!');
    loadTeamReminders(editId);
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

async function deleteTeamReminder(id) {
  const editId = document.getElementById('team-edit-id').value;
  try {
    await window.dbService.deleteReminder(id);
    showToast('Reminder removed');
    loadTeamReminders(editId);
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

// ============================================================
// HOMEWORK
// ============================================================

function renderHomeworkList() {
  const container = document.getElementById('homework-list');

  if (homeworkItems.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = homeworkItems.map((item, i) => `
    <div class="reminder-check-item">
      <span class="reminder-text">${escHtml(item)}</span>
      <button class="btn-remove-reminder" onclick="removeHomeworkItem(${i})" title="Remove">&times;</button>
    </div>
  `).join('');
}

function addHomeworkItem() {
  const input = document.getElementById('homework-add-input');
  const text = input.value.trim();
  if (!text) return;

  homeworkItems.push(text);
  input.value = '';
  renderHomeworkList();
}

function removeHomeworkItem(idx) {
  homeworkItems.splice(idx, 1);
  renderHomeworkList();
}

// ============================================================
// CSV IMPORT
// ============================================================

async function importPlayersCSV() {
  const teamId = document.getElementById('player-team-select').value;
  if (!teamId) {
    showToast('Please select a team first');
    return;
  }

  const fileInput = document.getElementById('csv-file-input');
  if (!fileInput.files || !fileInput.files[0]) {
    showToast('Please choose a CSV file');
    return;
  }

  const file = fileInput.files[0];
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim());

  let imported = 0;
  let skipped = 0;

  for (const line of lines) {
    // Split on comma, but handle quoted fields
    const parts = line.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    const name = parts[0];

    if (!name) continue;

    // Skip header rows
    if (name.toLowerCase() === 'name' || name.toLowerCase() === 'player') {
      continue;
    }

    // Parse birthday — expect MM/DD/YYYY or similar
    let birthday = '';
    if (parts[1]) {
      const raw = parts[1].trim();
      // Try MM/DD/YYYY
      const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (match) {
        const mm = match[1].padStart(2, '0');
        const dd = match[2].padStart(2, '0');
        const yyyy = match[3];
        birthday = `${yyyy}-${mm}-${dd}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        // Already YYYY-MM-DD
        birthday = raw;
      }
    }

    try {
      await window.dbService.createPlayer({ team_id: parseInt(teamId), name, birthday });
      imported++;
    } catch (err) {
      skipped++;
    }
  }

  fileInput.value = '';
  showToast(`Imported ${imported} player${imported !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} skipped` : ''}`);
  loadPlayers(teamId);
}

// ============================================================
// EMAIL GENERATION
// ============================================================
function setupEmailForm() {
  document.getElementById('email-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const teamIds = getSelectedTeamIds();
    const weekStart = document.getElementById('email-week').value;

    if (teamIds.length === 0) {
      showToast('Please select a team');
      return;
    }

    // Read current schedule from the form inputs (multi-event per day)
    const scheduleFromForm = {};
    DAYS.forEach(day => {
      const events = currentSchedule[day] || [{ type: 'Off', time: '', location: '', jersey: '', teamId: null }];
      scheduleFromForm[day] = events.map((entry, idx) => {
        const typeEl = document.querySelector(`[data-day="${day}"][data-idx="${idx}"][data-field="type"]`);
        const timeEl = document.querySelector(`[data-day="${day}"][data-idx="${idx}"][data-field="time"]`);
        const endTimeEl = document.querySelector(`[data-day="${day}"][data-idx="${idx}"][data-field="endTime"]`);
        const locEl = document.querySelector(`[data-day="${day}"][data-idx="${idx}"][data-field="location"]`);
        const jerseyEl = document.querySelector(`[data-day="${day}"][data-idx="${idx}"][data-field="jersey"]`);
        const teamIdEl = document.querySelector(`[data-day="${day}"][data-idx="${idx}"][data-field="teamId"]`);

        return {
          type: typeEl ? typeEl.value : entry.type,
          time: timeEl ? timeEl.value : entry.time,
          endTime: endTimeEl ? endTimeEl.value : (entry.endTime || ''),
          location: locEl ? locEl.value : entry.location,
          jersey: jerseyEl ? jerseyEl.value : entry.jersey,
          teamId: teamIdEl ? teamIdEl.value || null : (entry.teamId || null)
        };
      });
    });

    const payload = {
      team_id: teamIds[0],
      team_ids: teamIds,
      week_start: getSunday(weekStart),
      schedule: scheduleFromForm,
      team_focus: document.getElementById('team-focus').value,
      homework_items: [...homeworkItems],
      personal_note: document.getElementById('personal-note').value,
      include_quote: document.getElementById('include-quote').checked,
      include_birthdays: document.getElementById('include-birthdays').checked,
      reminders: currentReminders.filter(r => r.checked).map(r => r.text)
    };

    try {
      const result = await window.buildEmailMessages(payload);
      renderEmailOutput(result.messages);
      document.getElementById('output-card').style.display = 'block';
      document.getElementById('output-card').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      showToast('Error generating email: ' + err.message);
    }
  });
}

function renderEmailOutput(messages) {
  const container = document.getElementById('output-messages');
  container.innerHTML = '';

  messages.forEach((msg, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'email-message-block';

    const label = document.createElement('div');
    label.className = 'email-message-label';
    if (messages.length > 1) {
      label.textContent = `Message ${i + 1} of ${messages.length} (${msg.length} chars)`;
    } else {
      label.textContent = `${msg.length} chars`;
    }
    wrapper.appendChild(label);

    const textarea = document.createElement('textarea');
    textarea.className = 'email-output-area';
    textarea.readOnly = true;
    textarea.rows = Math.min(20, msg.split('\n').length + 2);
    textarea.value = msg;
    wrapper.appendChild(textarea);

    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.innerHTML = '&#128203; Copy to Clipboard';
    btn.addEventListener('click', () => copyMessage(btn, textarea));
    wrapper.appendChild(btn);

    container.appendChild(wrapper);
  });
}

function copyMessage(btn, textarea) {
  textarea.select();
  textarea.setSelectionRange(0, 99999);

  navigator.clipboard.writeText(textarea.value).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '&#10003; Copied!';
    btn.classList.add('btn-copied');
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.classList.remove('btn-copied');
    }, 2000);
  }).catch(() => {
    document.execCommand('copy');
    showToast('Copied to clipboard!');
  });
}

// ============================================================
// ESCAPE HELPERS
// ============================================================
function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escAttr(str) {
  if (!str) return '';
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escJs(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}
