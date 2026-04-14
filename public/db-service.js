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
