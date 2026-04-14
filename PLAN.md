# Coach App iOS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port coach-email-app to a fully offline Capacitor iOS app with native SQLite, browser iCal parsing, and no Express server dependency.

**Architecture:** Capacitor wraps the existing HTML/CSS/JS UI. All Express routes are replaced by direct calls into `db-service.js` (native SQLite via `@capacitor-community/sqlite`). iCal fetching moves to `ical-parser-web.js` using `@capacitor/http` (bypasses CORS) and `ical.js`. Email generation logic moves from `server.js` to `email-builder.js`. No bundler — Capacitor serves `public/` directly.

**Tech Stack:** Capacitor 6, @capacitor-community/sqlite 6, @capacitor/http, ical.js, vanilla JS/HTML/CSS, Xcode, TestFlight

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `public/index.html` | Modify | Add script tags for new JS files |
| `public/app.js` | Modify | Replace all `api()` calls with service calls |
| `public/style.css` | Copy unchanged | Styles |
| `public/db-service.js` | Create | All SQLite CRUD — teams, players, reminders, birthdays |
| `public/ical-parser-web.js` | Create | Fetch + parse iCal using @capacitor/http + ical.js |
| `public/email-builder.js` | Create | Port of server.js `/api/generate-email` route |
| `public/quotes.js` | Copy from root | Quote lookup — no changes needed |
| `public/ical.min.js` | Copy from npm | ical.js browser bundle |
| `capacitor.config.json` | Create | Capacitor config — appId, appName, webDir |
| `package.json` | Create | Dependencies: capacitor, sqlite plugin, http plugin |
| `ios/` | Generated | Xcode project (via `npx cap add ios`) |

---

## Task 1: Create repo and copy web files

**Files:**
- Create: `package.json`
- Create: `capacitor.config.json`
- Copy: `public/index.html`, `public/app.js`, `public/style.css`
- Copy: `public/quotes.js` (from root `quotes.js` of existing repo)

- [ ] **Step 1: Create the GitHub repo**

```bash
gh repo create MikeM589/coach-app-ios --public --description "Coach Email Generator — iOS app"
cd /Users/mikemortensen/Repositories/coach-app-ios
git init
git remote add origin https://github.com/MikeM589/coach-app-ios.git
```

- [ ] **Step 2: Create package.json**

```bash
npm init -y
```

Then set name, description, version in package.json:
```json
{
  "name": "coach-app-ios",
  "version": "1.0.0",
  "description": "Coach Email Generator — iOS",
  "scripts": {
    "sync": "npx cap sync ios",
    "open": "npx cap open ios"
  }
}
```

- [ ] **Step 3: Install Capacitor and plugins**

```bash
npm install @capacitor/core @capacitor/ios
npm install @capacitor-community/sqlite
npm install @capacitor/http
npm install --save-dev @capacitor/cli
```

- [ ] **Step 4: Initialize Capacitor**

```bash
npx cap init "Coach Email Generator" "com.coach.email-generator" --web-dir public
```

This creates `capacitor.config.json`. Verify it contains:
```json
{
  "appId": "com.coach.email-generator",
  "appName": "Coach Email Generator",
  "webDir": "public"
}
```

- [ ] **Step 5: Create public/ and copy files**

```bash
mkdir -p public
cp /Users/mikemortensen/Repositories/coach-email-app/public/index.html public/
cp /Users/mikemortensen/Repositories/coach-email-app/public/app.js public/
cp /Users/mikemortensen/Repositories/coach-email-app/public/style.css public/
cp /Users/mikemortensen/Repositories/coach-email-app/quotes.js public/quotes.js
```

- [ ] **Step 6: Copy ical.js browser bundle**

```bash
cp node_modules/ical.js/build/ical.min.js public/ical.min.js
```

Wait — ical.js may not have a pre-built browser bundle in its npm package. Check:
```bash
ls node_modules/ical.js/build/ 2>/dev/null || echo "no build dir"
```

If no build dir, install ical.js separately and use the alternative:
```bash
npm install ical.js
# Then copy from node_modules
cp node_modules/ical.js/build/ical.min.js public/ 2>/dev/null || \
  cp node_modules/ical.js/lib/ical/module.js public/ical.js
```

If neither exists, download directly:
```bash
curl -o public/ical.min.js https://cdn.jsdelivr.net/npm/ical.js/build/ical.min.js
```

- [ ] **Step 7: Create .gitignore**

```bash
cat > .gitignore << 'EOF'
node_modules/
ios/
dist/
.env
*.log
.DS_Store
EOF
```

- [ ] **Step 8: Initial commit**

```bash
git add .
git commit -m "Initial project setup with Capacitor and web files"
git push -u origin main
```

---

## Task 2: Create db-service.js — Schema and Init

**Files:**
- Create: `public/db-service.js`

- [ ] **Step 1: Create db-service.js with the init function**

```javascript
// public/db-service.js
// SQLite service layer — replaces all Express /api routes that touch the database.
// Uses @capacitor-community/sqlite via window.Capacitor.Plugins.CapacitorSQLite.

const DB_NAME = 'coachdb';
let _db = null;

async function getDb() {
  if (_db) return _db;
  const sqlite = window.Capacitor.Plugins.CapacitorSQLite;

  // Open (or create) the database
  await sqlite.open({ database: DB_NAME, readonly: false });
  _db = sqlite;
  return _db;
}

async function initializeDatabase() {
  const db = await getDb();

  // Create tables
  await db.execute({
    database: DB_NAME,
    statements: `
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        coach_name TEXT NOT NULL,
        ical_url TEXT DEFAULT '',
        motto TEXT DEFAULT 'Bravery. Resilience. Excellence.',
        salutation TEXT DEFAULT 'See you all soon!',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        training_jersey TEXT DEFAULT '',
        home_jersey TEXT DEFAULT '',
        away_jersey TEXT DEFAULT '',
        show_end_time INTEGER DEFAULT 1,
        short_name TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        birthday TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
      PRAGMA foreign_keys = ON;
    `
  });

  // Migrations — add columns that may be missing on existing databases
  const cols = await db.query({ database: DB_NAME, statement: 'PRAGMA table_info(teams)', values: [] });
  const colNames = (cols.values || []).map(c => c.name);

  const migrations = [
    ['salutation', "ALTER TABLE teams ADD COLUMN salutation TEXT DEFAULT 'See you all soon!'"],
    ['phone',      "ALTER TABLE teams ADD COLUMN phone TEXT DEFAULT ''"],
    ['email',      "ALTER TABLE teams ADD COLUMN email TEXT DEFAULT ''"],
    ['training_jersey', "ALTER TABLE teams ADD COLUMN training_jersey TEXT DEFAULT ''"],
    ['home_jersey',     "ALTER TABLE teams ADD COLUMN home_jersey TEXT DEFAULT ''"],
    ['away_jersey',     "ALTER TABLE teams ADD COLUMN away_jersey TEXT DEFAULT ''"],
    ['show_end_time',   "ALTER TABLE teams ADD COLUMN show_end_time INTEGER DEFAULT 1"],
    ['short_name',      "ALTER TABLE teams ADD COLUMN short_name TEXT DEFAULT ''"],
  ];

  for (const [col, sql] of migrations) {
    if (!colNames.includes(col)) {
      try { await db.execute({ database: DB_NAME, statements: sql }); } catch (_) {}
    }
  }
}
```

- [ ] **Step 2: Verify the file saved correctly**

```bash
head -5 public/db-service.js
# Should show: // public/db-service.js
```

---

## Task 3: db-service.js — Teams CRUD

**Files:**
- Modify: `public/db-service.js` (append)

- [ ] **Step 1: Append Teams CRUD functions**

Add to the bottom of `public/db-service.js`:

```javascript
// ── Teams ──────────────────────────────────────────────

async function getAllTeams() {
  const db = await getDb();
  const res = await db.query({ database: DB_NAME, statement: 'SELECT * FROM teams ORDER BY name', values: [] });
  return res.values || [];
}

async function getTeam(id) {
  const db = await getDb();
  const res = await db.query({ database: DB_NAME, statement: 'SELECT * FROM teams WHERE id = ?', values: [id] });
  return (res.values || [])[0] || null;
}

async function createTeam({ name, coach_name, ical_url, motto, salutation, phone, email, training_jersey, home_jersey, away_jersey, show_end_time, short_name }) {
  const db = await getDb();
  const showEnd = show_end_time != null ? show_end_time : 1;
  await db.run({
    database: DB_NAME,
    statement: 'INSERT INTO teams (name, coach_name, ical_url, motto, salutation, phone, email, training_jersey, home_jersey, away_jersey, show_end_time, short_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    values: [name, coach_name, ical_url || '', motto || 'Bravery. Resilience. Excellence.', salutation != null ? salutation : 'See you all soon!', phone || '', email || '', training_jersey || '', home_jersey || '', away_jersey || '', showEnd, short_name || '']
  });
  const res = await db.query({ database: DB_NAME, statement: 'SELECT last_insert_rowid() as id', values: [] });
  const id = (res.values[0] || {}).id;
  return getTeam(id);
}

async function updateTeam(id, { name, coach_name, ical_url, motto, salutation, phone, email, training_jersey, home_jersey, away_jersey, show_end_time, short_name }) {
  const db = await getDb();
  await db.run({
    database: DB_NAME,
    statement: 'UPDATE teams SET name=?, coach_name=?, ical_url=?, motto=?, salutation=?, phone=?, email=?, training_jersey=?, home_jersey=?, away_jersey=?, show_end_time=?, short_name=? WHERE id=?',
    values: [name, coach_name, ical_url || '', motto || 'Bravery. Resilience. Excellence.', salutation != null ? salutation : 'See you all soon!', phone || '', email || '', training_jersey || '', home_jersey || '', away_jersey || '', show_end_time != null ? show_end_time : 1, short_name || '', id]
  });
  return getTeam(id);
}

async function deleteTeam(id) {
  const db = await getDb();
  await db.execute({ database: DB_NAME, statements: `DELETE FROM players WHERE team_id = ${parseInt(id)}; DELETE FROM reminders WHERE team_id = ${parseInt(id)}; DELETE FROM teams WHERE id = ${parseInt(id)};` });
}
```

---

## Task 4: db-service.js — Players and Reminders CRUD

**Files:**
- Modify: `public/db-service.js` (append)

- [ ] **Step 1: Append Players CRUD**

```javascript
// ── Players ─────────────────────────────────────────────

async function getPlayersByTeam(teamId) {
  const db = await getDb();
  const res = await db.query({ database: DB_NAME, statement: 'SELECT * FROM players WHERE team_id = ? ORDER BY name', values: [teamId] });
  return res.values || [];
}

async function createPlayer({ team_id, name, birthday }) {
  const db = await getDb();
  await db.run({
    database: DB_NAME,
    statement: 'INSERT INTO players (team_id, name, birthday) VALUES (?, ?, ?)',
    values: [team_id, name, birthday || '']
  });
  const res = await db.query({ database: DB_NAME, statement: 'SELECT last_insert_rowid() as id', values: [] });
  const id = (res.values[0] || {}).id;
  return { id, team_id, name, birthday: birthday || '' };
}

async function updatePlayer(id, { name, birthday }) {
  const db = await getDb();
  await db.run({ database: DB_NAME, statement: 'UPDATE players SET name=?, birthday=? WHERE id=?', values: [name, birthday || '', id] });
  const res = await db.query({ database: DB_NAME, statement: 'SELECT * FROM players WHERE id = ?', values: [id] });
  return (res.values || [])[0] || null;
}

async function deletePlayer(id) {
  const db = await getDb();
  await db.run({ database: DB_NAME, statement: 'DELETE FROM players WHERE id = ?', values: [id] });
}

async function getUpcomingBirthdays(teamId, weekStart, weekEnd) {
  const players = await getPlayersByTeam(teamId);
  const start = new Date(weekStart);
  const end = new Date(weekEnd);
  return players.filter(player => {
    if (!player.birthday) return false;
    const bday = new Date(player.birthday + 'T00:00:00');
    if (isNaN(bday.getTime())) return false;
    const bdayMonth = bday.getMonth();
    const bdayDate = bday.getDate();
    const current = new Date(start);
    while (current <= end) {
      if (current.getMonth() === bdayMonth && current.getDate() === bdayDate) return true;
      current.setDate(current.getDate() + 1);
    }
    return false;
  });
}
```

- [ ] **Step 2: Append Reminders CRUD**

```javascript
// ── Reminders ────────────────────────────────────────────

async function getRemindersByTeam(teamId) {
  const db = await getDb();
  const res = await db.query({ database: DB_NAME, statement: 'SELECT * FROM reminders WHERE team_id = ? ORDER BY id', values: [teamId] });
  return res.values || [];
}

async function createReminder({ team_id, text }) {
  const db = await getDb();
  await db.run({ database: DB_NAME, statement: 'INSERT INTO reminders (team_id, text) VALUES (?, ?)', values: [team_id, text] });
  const res = await db.query({ database: DB_NAME, statement: 'SELECT last_insert_rowid() as id', values: [] });
  const id = (res.values[0] || {}).id;
  return { id, team_id, text };
}

async function deleteReminder(id) {
  const db = await getDb();
  await db.run({ database: DB_NAME, statement: 'DELETE FROM reminders WHERE id = ?', values: [id] });
}
```

- [ ] **Step 3: Export the service as a global**

Append at the bottom of `public/db-service.js`:

```javascript
// Expose as global so app.js and email-builder.js can call it
window.dbService = {
  initializeDatabase,
  getAllTeams, getTeam, createTeam, updateTeam, deleteTeam,
  getPlayersByTeam, createPlayer, updatePlayer, deletePlayer, getUpcomingBirthdays,
  getRemindersByTeam, createReminder, deleteReminder
};
```

---

## Task 5: Create ical-parser-web.js

**Files:**
- Create: `public/ical-parser-web.js`

Note: `@capacitor/http` makes native HTTP requests from iOS, bypassing CORS entirely. `ical.js` (loaded as `window.ICAL`) parses the iCal text. The logic mirrors `ical-parser.js` from the server exactly.

- [ ] **Step 1: Create ical-parser-web.js**

```javascript
// public/ical-parser-web.js
// Browser/Capacitor replacement for ical-parser.js.
// Uses @capacitor/http for native HTTP (no CORS) and ical.js for parsing.

async function getWeekSchedule(url, weekStartStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const schedule = {};
  days.forEach(day => { schedule[day] = []; });

  if (!url || url.trim() === '') return schedule;

  const weekStart = new Date(weekStartStr + 'T00:00:00');
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  let icalText;
  try {
    const Http = window.Capacitor.Plugins.CapacitorHttp;
    const response = await Http.get({ url, headers: {} });
    icalText = response.data;
  } catch (err) {
    throw new Error('Failed to fetch calendar: ' + err.message);
  }

  let jcalData;
  try {
    jcalData = ICAL.parse(icalText);
  } catch (err) {
    throw new Error('Failed to parse calendar: ' + err.message);
  }

  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    const eventDates = [];

    if (event.isRecurring()) {
      const expand = event.iterator();
      let next;
      const rangeStart = ICAL.Time.fromJSDate(new Date(weekStart.getTime() - 86400000));
      const rangeEnd = ICAL.Time.fromJSDate(new Date(weekEnd.getTime() + 86400000));
      while ((next = expand.next())) {
        if (next.compare(rangeEnd) > 0) break;
        if (next.compare(rangeStart) >= 0) {
          eventDates.push(next.toJSDate());
        }
      }
    } else {
      eventDates.push(event.startDate.toJSDate());
    }

    for (const eventDate of eventDates) {
      if (eventDate < weekStart || eventDate > weekEnd) continue;

      const dayName = days[eventDate.getDay()];
      const rawSummary = event.summary || '';
      const summary = rawSummary.toLowerCase();

      // Determine event type — mirrors ical-parser.js logic exactly
      let type = rawSummary || 'Training';
      const hasAtOpponent = / @/i.test(rawSummary);
      const hasVs = /\bvs\.?\s/i.test(rawSummary) || /\bv\.\s/i.test(rawSummary);

      if (summary.includes('game') || summary.includes('match') || summary.includes('fixture') || summary.includes('friendly') || hasVs || hasAtOpponent) {
        let opponent = '';
        let isAway = false;
        if (hasAtOpponent) {
          const atParts = rawSummary.split('@');
          opponent = (atParts[atParts.length - 1] || '').trim();
          isAway = true;
        } else if (hasVs) {
          const vsParts = rawSummary.split(/\bvs\.?\s|\bv\.\s/i);
          opponent = (vsParts[vsParts.length - 1] || '').trim();
        }
        type = opponent ? (isAway ? `Game @ ${opponent}` : `Game vs ${opponent}`) : 'Game';
      } else if (summary.includes('training') || summary.includes('practice') || summary.includes('session') || summary.includes('drill')) {
        type = 'Training';
      } else if (summary.includes('scrimmage')) {
        type = 'Scrimmage';
      } else if (summary.includes('tournament') || summary.includes('tourney') || summary.includes('cup')) {
        type = 'Tournament';
      } else if (summary.includes('meeting')) {
        type = 'Meeting';
      } else if (summary.includes('party')) {
        type = 'Party';
      }

      // Format start time
      const hours = eventDate.getHours();
      const minutes = eventDate.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h = hours % 12 || 12;
      const m = minutes.toString().padStart(2, '0');
      const time = `${h}:${m} ${ampm}`;

      // Format end time
      let endTime = '';
      const endDateRaw = event.endDate;
      if (endDateRaw) {
        const startMs = event.startDate.toJSDate().getTime();
        const endMs = endDateRaw.toJSDate().getTime();
        const durationMs = endMs - startMs;
        const endDate = new Date(eventDate.getTime() + durationMs);
        const eh = endDate.getHours();
        const em = endDate.getMinutes();
        const eampm = eh >= 12 ? 'PM' : 'AM';
        const eh12 = eh % 12 || 12;
        const emm = em.toString().padStart(2, '0');
        endTime = `${eh12}:${emm} ${eampm}`;
      }

      // Clean location — mirrors ical-parser.js logic
      let location = (event.location || 'TBD');
      const locParts = location.split(/,|\n|\t|\s{2,}/).map(s => s.trim()).filter(Boolean);
      if (locParts.length > 1) {
        const addressIdx = locParts.findIndex(p => /^\d+\s/.test(p));
        if (addressIdx > 0) {
          location = locParts.slice(0, addressIdx).join(' ');
        } else if (addressIdx === 0) {
          location = locParts.length > 1 ? locParts[1] : locParts[0];
        } else {
          location = locParts[0];
        }
      }
      location = location.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());

      schedule[dayName].push({ type, time, endTime, location });
    }
  }

  return schedule;
}

window.getWeekSchedule = getWeekSchedule;
```

---

## Task 6: Create email-builder.js

**Files:**
- Create: `public/email-builder.js`

This is a direct port of the `/api/generate-email` route body from `server.js`. It receives the same payload shape and returns `{ messages }`.

- [ ] **Step 1: Create email-builder.js**

```javascript
// public/email-builder.js
// Port of server.js /api/generate-email route — runs entirely in the browser.
// Depends on: window.dbService, window.getQuoteForWeek (from quotes.js)

async function buildEmailMessages({
  team_id, team_ids, week_start, schedule,
  team_focus, homework_items, personal_note,
  include_quote, include_birthdays, reminders
}) {
  const team = await window.dbService.getTeam(team_id);
  if (!team) throw new Error('Team not found');

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const sections = [];

  // Schedule section
  const weekSunday = new Date(week_start + 'T00:00:00');
  const scheduleLines = [];
  days.forEach((day, i) => {
    const events = schedule[day] || [];
    const activeEvents = events.filter(e => {
      const t = (e.type || '').trim().toLowerCase();
      return t !== 'off' && t !== '';
    });
    if (activeEvents.length === 0) return;

    const dayDate = new Date(weekSunday);
    dayDate.setDate(dayDate.getDate() + i);
    const mm = String(dayDate.getMonth() + 1).padStart(2, '0');
    const dd = String(dayDate.getDate()).padStart(2, '0');

    scheduleLines.push(`${day} (${mm}/${dd}):`);
    activeEvents.forEach(entry => {
      let timePart = '';
      if (entry.time) {
        timePart = team.show_end_time && entry.endTime ? ` ${entry.time} – ${entry.endTime}` : ` ${entry.time}`;
      }
      scheduleLines.push(`  \u2022 ${entry.type}${timePart}`);
      if (entry.jersey) scheduleLines.push(`     \u2022 ${entry.jersey}`);
      if (entry.location) scheduleLines.push(`     \u2022 ${entry.location}`);
    });
  });
  let scheduleSection = `\u{1F4C5} Weekly Schedule\n`;
  scheduleSection += scheduleLines.length > 0 ? scheduleLines.join('\n') : 'No events scheduled this week.';
  sections.push(scheduleSection);

  // Birthday section
  if (include_birthdays !== false) {
    const start = new Date(week_start + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const allTeamIds = (team_ids && team_ids.length > 0) ? team_ids : [team_id];
    const bdayMap = new Map();
    for (const tid of allTeamIds) {
      const bdays = await window.dbService.getUpcomingBirthdays(tid, start, end);
      bdays.forEach(p => { if (!bdayMap.has(p.name)) bdayMap.set(p.name, p); });
    }
    const birthdayPlayers = Array.from(bdayMap.values()).sort((a, b) => {
      const dateA = a.birthday ? new Date(a.birthday + 'T00:00:00') : null;
      const dateB = b.birthday ? new Date(b.birthday + 'T00:00:00') : null;
      const dayA = dateA ? dateA.getMonth() * 100 + dateA.getDate() : 9999;
      const dayB = dateB ? dateB.getMonth() * 100 + dateB.getDate() : 9999;
      return dayA - dayB;
    });
    if (birthdayPlayers.length > 0) {
      let bdaySection = `\u{1F382} Happy Birthday\n`;
      birthdayPlayers.forEach(p => {
        if (p.birthday) {
          const bday = new Date(p.birthday + 'T00:00:00');
          const mm = String(bday.getMonth() + 1).padStart(2, '0');
          const dd = String(bday.getDate()).padStart(2, '0');
          bdaySection += `${p.name} (${mm}/${dd})\n`;
        } else {
          bdaySection += `${p.name}\n`;
        }
      });
      sections.push(bdaySection.trimEnd());
    }
  }

  // Team Focus
  if (team_focus && team_focus.trim()) {
    sections.push(`\u{1F3AF} Team Focus This Week\n${team_focus.trim()}`);
  }

  // Homework
  const activeHomework = (homework_items || []).filter(h => h.trim());
  if (activeHomework.length > 0) {
    let hwSection = `\u{1F4DD} Homework\nTo support your development outside of training:\n`;
    hwSection += activeHomework.map(h => `\u2022 ${h.trim()}`).join('\n');
    sections.push(hwSection);
  }

  // Reminders
  const activeReminders = (reminders || []).filter(r => r.trim());
  if (activeReminders.length > 0) {
    let remSection = `\u{1F6CE}\u{FE0F} Reminders\n`;
    remSection += activeReminders.map(r => `\u2022 ${r}`).join('\n');
    sections.push(remSection);
  }

  // Sign-off
  const signoffLines = [];
  if (team.salutation) signoffLines.push(team.salutation.replace(/\\n/g, '\n'));
  signoffLines.push(team.coach_name);
  if (team.phone) signoffLines.push(team.phone);
  if (team.email) signoffLines.push(team.email);
  if (team.motto) signoffLines.push(team.motto);
  if (include_quote) {
    const quote = window.getQuoteForWeek(week_start);
    signoffLines.push(`\u{1F4AC} "${quote}"`);
  }
  const signoff = signoffLines.join('\n');

  function chunkText(text, maxLen) {
    const chunks = [];
    while (text.length > maxLen) {
      let cut = text.lastIndexOf(' ', maxLen);
      if (cut <= 0) cut = maxLen;
      chunks.push(text.slice(0, cut));
      text = text.slice(cut).trimStart();
    }
    if (text) chunks.push(text);
    return chunks;
  }

  const MAX_CHARS = 999;
  const messages = [];
  let current = '';

  for (const section of sections) {
    const addition = current ? '\n\n' + section : section;
    if (current && current.length + addition.length > MAX_CHARS) {
      messages.push(current);
      current = section;
    } else {
      current += addition;
    }
  }

  const noteText = personal_note && personal_note.trim() ? personal_note.trim() : '';
  const closing = noteText ? noteText + '\n\n' + signoff : signoff;
  const closingAddition = current ? '\n\n' + closing : closing;

  if (current.length + closingAddition.length <= MAX_CHARS) {
    current += closingAddition;
    messages.push(current);
  } else {
    if (current) messages.push(current);
    if (closing.length <= MAX_CHARS) {
      messages.push(closing);
    } else {
      const noteChunks = chunkText(noteText, MAX_CHARS);
      noteChunks.forEach((chunk, i) => {
        const isLast = i === noteChunks.length - 1;
        const piece = isLast ? chunk + '\n\n' + signoff : chunk;
        if (piece.length <= MAX_CHARS) {
          messages.push(piece);
        } else {
          messages.push(chunk);
          messages.push(signoff);
        }
      });
    }
  }

  return { messages };
}

window.buildEmailMessages = buildEmailMessages;
```

---

## Task 7: Update index.html

**Files:**
- Modify: `public/index.html`

Add script tags for the new service files before `app.js`. Also add the Capacitor core script.

- [ ] **Step 1: Add script tags to index.html**

Replace the closing `<script src="app.js"></script>` line at the bottom of `public/index.html` with:

```html
  <!-- Capacitor runtime (injected by native shell; this no-op script satisfies dev tools) -->
  <script>window.Capacitor = window.Capacitor || { Plugins: {} };</script>

  <!-- ical.js browser bundle -->
  <script src="ical.min.js"></script>

  <!-- Service layer -->
  <script src="quotes.js"></script>
  <script src="db-service.js"></script>
  <script src="ical-parser-web.js"></script>
  <script src="email-builder.js"></script>

  <!-- App -->
  <script src="app.js"></script>
```

---

## Task 8: Update app.js — Replace api() calls

**Files:**
- Modify: `public/app.js`

Replace the `api()` helper and all 13 call sites with direct service calls. Also add database initialization on app startup.

- [ ] **Step 1: Replace the api() helper function**

Find the existing `api()` helper (search for `async function api`) and replace the entire function with an initialization call:

```javascript
// Initialize database on startup
async function initApp() {
  await window.dbService.initializeDatabase();
  // existing startup code (loadTeams, etc.) goes here — keep existing calls
}
document.addEventListener('DOMContentLoaded', initApp);
```

Remove the old `DOMContentLoaded` listener that was calling startup without DB init, and move its body into `initApp()`.

- [ ] **Step 2: Replace GET /api/teams (line ~112)**

```javascript
// OLD: teams = await api('/api/teams');
teams = await window.dbService.getAllTeams();
```

- [ ] **Step 3: Replace PUT/POST /api/teams (lines ~215, ~218)**

```javascript
// OLD: await api(`/api/teams/${editId}`, { method: 'PUT', body: payload });
await window.dbService.updateTeam(editId, payload);

// OLD: await api('/api/teams', { method: 'POST', body: payload });
await window.dbService.createTeam(payload);
```

- [ ] **Step 4: Replace DELETE /api/teams/:id (line ~272)**

```javascript
// OLD: await api(`/api/teams/${id}`, { method: 'DELETE' });
await window.dbService.deleteTeam(id);
```

- [ ] **Step 5: Replace GET /api/teams/:teamId/players (line ~300)**

```javascript
// OLD: const players = await api(`/api/teams/${teamId}/players`);
const players = await window.dbService.getPlayersByTeam(teamId);
```

- [ ] **Step 6: Replace PUT/POST /api/players (lines ~344, ~347, ~870)**

```javascript
// OLD: await api(`/api/players/${editId}`, { method: 'PUT', body: payload });
await window.dbService.updatePlayer(editId, payload);

// OLD: await api('/api/players', { method: 'POST', body: payload });
await window.dbService.createPlayer(payload);
```

- [ ] **Step 7: Replace DELETE /api/players/:id (line ~378)**

```javascript
// OLD: await api(`/api/players/${id}`, { method: 'DELETE' });
await window.dbService.deletePlayer(id);
```

- [ ] **Step 8: Replace GET /api/schedule (line ~418)**

The schedule fetch needs the team's `ical_url`. The existing code calls the server which looks it up. Now we look it up directly:

```javascript
// OLD: api(`/api/schedule?team_id=${id}&week_start=${sunday}`)
// NEW — inside the Promise.all map:
window.dbService.getTeam(id).then(t => {
  if (!t || !t.ical_url || t.ical_url.trim() === '') {
    return { schedule: null, message: 'No calendar URL configured' };
  }
  return window.getWeekSchedule(t.ical_url, sunday)
    .then(schedule => ({ schedule }))
    .catch(err => ({ schedule: null, message: err.message }));
})
```

- [ ] **Step 9: Replace GET /api/teams/:teamId/reminders (lines ~639, ~722)**

```javascript
// OLD: api(`/api/teams/${teamId}/reminders`).catch(() => [])
window.dbService.getRemindersByTeam(teamId).catch(() => [])

// OLD: const reminders = await api(`/api/teams/${teamId}/reminders`);
const reminders = await window.dbService.getRemindersByTeam(teamId);
```

- [ ] **Step 10: Replace POST /api/reminders (line ~761)**

```javascript
// OLD: await api('/api/reminders', { method: 'POST', body: { team_id: parseInt(editId), text } });
await window.dbService.createReminder({ team_id: parseInt(editId), text });
```

- [ ] **Step 11: Replace DELETE /api/reminders/:id (line ~773)**

```javascript
// OLD: await api(`/api/reminders/${id}`, { method: 'DELETE' });
await window.dbService.deleteReminder(id);
```

- [ ] **Step 12: Replace POST /api/generate-email (line ~937)**

```javascript
// OLD: const result = await api('/api/generate-email', { method: 'POST', body: payload });
const result = await window.buildEmailMessages(payload);
```

- [ ] **Step 13: Verify no localhost fetch calls remain**

```bash
grep -n "localhost\|/api/" public/app.js
# Expected: zero results
```

---

## Task 9: Add iOS platform and configure Xcode

**Files:**
- Generated: `ios/` directory

- [ ] **Step 1: Add iOS platform**

```bash
cd /Users/mikemortensen/Repositories/coach-app-ios
npx cap add ios
```

Expected: `ios/` directory created with App.xcworkspace inside.

- [ ] **Step 2: Sync web files to iOS**

```bash
npx cap sync ios
```

Expected: `Copying web assets` and `Updating iOS native dependencies` in output.

- [ ] **Step 3: Configure NSAppTransportSecurity in Info.plist**

The iCal fetch needs to reach arbitrary URLs (calendar providers). Edit `ios/App/App/Info.plist` and add inside the root `<dict>`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
</dict>
```

- [ ] **Step 4: Open in Xcode**

```bash
npx cap open ios
```

In Xcode:
1. Select the `App` target
2. Under **Signing & Capabilities** → set Team to your Apple Developer account
3. Bundle Identifier should already be `com.coach.email-generator`
4. Set Deployment Target to iOS 16.0

- [ ] **Step 5: Build on simulator**

In Xcode, select an iPhone 15 simulator and press **Run** (⌘R).
Expected: App launches, shows the Generate tab with no errors in the console.

- [ ] **Step 6: Test core flow on simulator**

1. Go to Teams tab → create a test team
2. Go to Players tab → add a player with a birthday
3. Go to Generate tab → select team, pick a week, click Generate
4. Verify a message is produced (no schedule without iCal URL is fine — "No events scheduled" is correct)

---

## Task 10: TestFlight distribution

- [ ] **Step 1: Create App ID in Apple Developer portal**

At [developer.apple.com](https://developer.apple.com) → Identifiers → `+` → App ID
- Bundle ID: `com.coach.email-generator`
- Capabilities: none special needed

- [ ] **Step 2: Archive the app in Xcode**

1. Set scheme to **Any iOS Device (arm64)**
2. Product → Archive
3. Wait for archive to complete → Organizer window opens

- [ ] **Step 3: Upload to App Store Connect**

In Organizer → Distribute App → App Store Connect → Upload
Follow prompts, accept defaults for symbols and bitcode.

- [ ] **Step 4: Add TestFlight testers**

At [appstoreconnect.apple.com](https://appstoreconnect.apple.com):
1. Select the app → TestFlight tab
2. Add tester email addresses (coach colleagues)
3. They receive an invite email with a link to install TestFlight and then the app

---

## Task 11: GitHub Actions for automated iOS builds (optional, advanced)

This task is optional — manual Xcode archives work fine for small distribution. Only do this if you want automated builds on every tag.

- [ ] **Step 1: Add build certificates and provisioning profile as GitHub secrets**

This requires exporting:
- Distribution certificate as `.p12` with password → `IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`
- Provisioning profile as `.mobileprovision` → `IOS_PROVISIONING_PROFILE_BASE64`
- App Store Connect API key → `APPSTORE_API_KEY_ID`, `APPSTORE_API_ISSUER_ID`, `APPSTORE_API_PRIVATE_KEY`

- [ ] **Step 2: Create .github/workflows/build-ios.yml**

```yaml
name: Build iOS

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx cap sync ios

      - name: Install certificate
        env:
          CERTIFICATE_BASE64: ${{ secrets.IOS_CERTIFICATE_BASE64 }}
          CERTIFICATE_PASSWORD: ${{ secrets.IOS_CERTIFICATE_PASSWORD }}
          PROFILE_BASE64: ${{ secrets.IOS_PROVISIONING_PROFILE_BASE64 }}
        run: |
          echo "$CERTIFICATE_BASE64" | base64 --decode > certificate.p12
          security create-keychain -p "" build.keychain
          security import certificate.p12 -k build.keychain -P "$CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security set-keychain-settings -t 3600 build.keychain
          security list-keychains -s build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "" build.keychain
          mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
          echo "$PROFILE_BASE64" | base64 --decode > ~/Library/MobileDevice/Provisioning\ Profiles/profile.mobileprovision

      - name: Build and upload to TestFlight
        env:
          ASC_KEY_ID: ${{ secrets.APPSTORE_API_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.APPSTORE_API_ISSUER_ID }}
          ASC_PRIVATE_KEY: ${{ secrets.APPSTORE_API_PRIVATE_KEY }}
        run: |
          xcodebuild archive \
            -workspace ios/App/App.xcworkspace \
            -scheme App \
            -configuration Release \
            -archivePath build/App.xcarchive \
            CODE_SIGN_STYLE=Manual \
            DEVELOPMENT_TEAM=YOUR_TEAM_ID
          xcodebuild -exportArchive \
            -archivePath build/App.xcarchive \
            -exportPath build/export \
            -exportOptionsPlist ios/ExportOptions.plist
          xcrun altool --upload-app \
            -f build/export/App.ipa \
            --apiKey "$ASC_KEY_ID" \
            --apiIssuer "$ASC_ISSUER_ID"
```

Replace `YOUR_TEAM_ID` with your 10-character Apple Team ID (found in developer.apple.com under Membership).

---

## Self-Review

**Spec coverage check:**
- ✅ GitHub repo MikeM589/coach-app-ios — Task 1
- ✅ Capacitor init + iOS platform — Tasks 1, 9
- ✅ @capacitor-community/sqlite service layer — Tasks 2, 3, 4
- ✅ All Teams/Players/Reminders CRUD — Tasks 3, 4
- ✅ iCal parser using @capacitor/http + ical.js — Task 5
- ✅ Email generation moved to frontend — Task 6
- ✅ index.html script tags — Task 7
- ✅ All 13 api() call sites replaced — Task 8
- ✅ TestFlight distribution — Task 10
- ✅ No localhost fetch calls remain — Task 8, Step 13
- ✅ Birthday logic, multi-team merge, quote — Task 6 (email-builder.js)

**Placeholder scan:** No TBDs, all code blocks present, all file paths explicit.

**Type consistency:** `window.dbService`, `window.getWeekSchedule`, `window.buildEmailMessages` used consistently across tasks 7, 8.
