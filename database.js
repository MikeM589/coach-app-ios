const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'coach.db');
let db = null;

function saveDb() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}

async function initialize() {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
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
    )
  `);

  // Migrate existing teams table to add jersey columns if missing
  try {
    const cols = allRows("PRAGMA table_info(teams)");
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('salutation')) {
      db.run("ALTER TABLE teams ADD COLUMN salutation TEXT DEFAULT 'See you all soon!'");
    }
    if (!colNames.includes('phone')) {
      db.run("ALTER TABLE teams ADD COLUMN phone TEXT DEFAULT ''");
    }
    if (!colNames.includes('email')) {
      db.run("ALTER TABLE teams ADD COLUMN email TEXT DEFAULT ''");
    }
    if (!colNames.includes('training_jersey')) {
      db.run("ALTER TABLE teams ADD COLUMN training_jersey TEXT DEFAULT ''");
    }
    if (!colNames.includes('home_jersey')) {
      db.run("ALTER TABLE teams ADD COLUMN home_jersey TEXT DEFAULT ''");
    }
    if (!colNames.includes('away_jersey')) {
      db.run("ALTER TABLE teams ADD COLUMN away_jersey TEXT DEFAULT ''");
    }
    if (!colNames.includes('show_end_time')) {
      db.run("ALTER TABLE teams ADD COLUMN show_end_time INTEGER DEFAULT 1");
    }
    if (!colNames.includes('short_name')) {
      db.run("ALTER TABLE teams ADD COLUMN short_name TEXT DEFAULT ''");
    }
  } catch (e) { /* columns already exist */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      birthday TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    )
  `);

  db.run('PRAGMA foreign_keys = ON');
  saveDb();
}

function allRows(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function getRow(sql, params = []) {
  const rows = allRows(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function runSql(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

// --- Teams ---

function getAllTeams() {
  return allRows('SELECT * FROM teams ORDER BY name');
}

function getTeam(id) {
  return getRow('SELECT * FROM teams WHERE id = ?', [id]);
}

function createTeam({ name, coach_name, ical_url, motto, salutation, phone, email, training_jersey, home_jersey, away_jersey, show_end_time, short_name }) {
  const showEnd = show_end_time != null ? show_end_time : 1;
  runSql(
    'INSERT INTO teams (name, coach_name, ical_url, motto, salutation, phone, email, training_jersey, home_jersey, away_jersey, show_end_time, short_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [name, coach_name, ical_url || '', motto || 'Bravery. Resilience. Excellence.', salutation != null ? salutation : 'See you all soon!', phone || '', email || '', training_jersey || '', home_jersey || '', away_jersey || '', showEnd, short_name || '']
  );
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  saveDb();
  return { id, name, coach_name, ical_url, motto, salutation, phone, email, training_jersey, home_jersey, away_jersey, show_end_time: showEnd, short_name: short_name || '' };
}

function updateTeam(id, { name, coach_name, ical_url, motto, salutation, phone, email, training_jersey, home_jersey, away_jersey, show_end_time, short_name }) {
  runSql(
    'UPDATE teams SET name = ?, coach_name = ?, ical_url = ?, motto = ?, salutation = ?, phone = ?, email = ?, training_jersey = ?, home_jersey = ?, away_jersey = ?, show_end_time = ?, short_name = ? WHERE id = ?',
    [name, coach_name, ical_url || '', motto || 'Bravery. Resilience. Excellence.', salutation != null ? salutation : 'See you all soon!', phone || '', email || '', training_jersey || '', home_jersey || '', away_jersey || '', show_end_time != null ? show_end_time : 1, short_name || '', id]
  );
  return getTeam(id);
}

function deleteTeam(id) {
  runSql('DELETE FROM players WHERE team_id = ?', [id]);
  runSql('DELETE FROM teams WHERE id = ?', [id]);
}

// --- Players ---

function getPlayersByTeam(teamId) {
  return allRows('SELECT * FROM players WHERE team_id = ? ORDER BY name', [teamId]);
}

function getPlayer(id) {
  return getRow('SELECT * FROM players WHERE id = ?', [id]);
}

function createPlayer({ team_id, name, birthday }) {
  runSql(
    'INSERT INTO players (team_id, name, birthday) VALUES (?, ?, ?)',
    [team_id, name, birthday || '']
  );
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  saveDb();
  return { id, team_id, name, birthday };
}

function updatePlayer(id, { name, birthday }) {
  runSql('UPDATE players SET name = ?, birthday = ? WHERE id = ?', [name, birthday || '', id]);
  return getPlayer(id);
}

function deletePlayer(id) {
  runSql('DELETE FROM players WHERE id = ?', [id]);
}

// --- Reminders ---

function getRemindersByTeam(teamId) {
  return allRows('SELECT * FROM reminders WHERE team_id = ? ORDER BY id', [teamId]);
}

function createReminder({ team_id, text }) {
  runSql('INSERT INTO reminders (team_id, text) VALUES (?, ?)', [team_id, text]);
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  saveDb();
  return { id, team_id, text };
}

function deleteReminder(id) {
  runSql('DELETE FROM reminders WHERE id = ?', [id]);
}

function getUpcomingBirthdays(teamId, weekStart, weekEnd) {
  const players = getPlayersByTeam(teamId);
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
      if (current.getMonth() === bdayMonth && current.getDate() === bdayDate) {
        return true;
      }
      current.setDate(current.getDate() + 1);
    }
    return false;
  });
}

module.exports = {
  initialize,
  getAllTeams,
  getTeam,
  createTeam,
  updateTeam,
  deleteTeam,
  getPlayersByTeam,
  getPlayer,
  createPlayer,
  updatePlayer,
  deletePlayer,
  getRemindersByTeam,
  createReminder,
  deleteReminder,
  getUpcomingBirthdays
};
