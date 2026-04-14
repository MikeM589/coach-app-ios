// public/db-service.js
// SQLite service layer — replaces all Express /api routes that touch the database.
// Uses @capacitor-community/sqlite via window.Capacitor.Plugins.CapacitorSQLite.

const DB_NAME = 'coachdb';
let _dbPromise = null;

async function getDb() {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const sqlite = window.Capacitor.Plugins.CapacitorSQLite;
      try {
        await sqlite.createConnection({ database: DB_NAME, encrypted: false, mode: 'no-encryption', version: 1, readonly: false });
      } catch (_) {
        // Connection already registered (e.g. after livereload) — proceed to open
      }
      await sqlite.open({ database: DB_NAME });
      return sqlite;
    })();
  }
  return _dbPromise;
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
  const numId = parseInt(id);
  if (!Number.isFinite(numId)) return;
  const db = await getDb();
  await db.run({ database: DB_NAME, statement: 'DELETE FROM players WHERE team_id = ?', values: [numId] });
  await db.run({ database: DB_NAME, statement: 'DELETE FROM reminders WHERE team_id = ?', values: [numId] });
  await db.run({ database: DB_NAME, statement: 'DELETE FROM teams WHERE id = ?', values: [numId] });
}

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

// Expose as global so app.js and email-builder.js can call it
window.dbService = {
  initializeDatabase,
  getAllTeams, getTeam, createTeam, updateTeam, deleteTeam,
  getPlayersByTeam, createPlayer, updatePlayer, deletePlayer, getUpcomingBirthdays,
  getRemindersByTeam, createReminder, deleteReminder
};
