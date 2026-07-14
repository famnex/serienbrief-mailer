const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'emailer.db');
const db = new sqlite3.Database(dbPath);

// Helper to run a query and return a Promise
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

// Helper to get a single row
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Helper to get all rows
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Initialize tables
async function initDatabase() {
  // 1. settings table
  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      host TEXT,
      port INTEGER,
      secure INTEGER,
      user TEXT,
      pass TEXT,
      from_email TEXT,
      from_name TEXT
    )
  `);

  // Ensure there is at least one default settings row (id=1)
  const settingsRow = await get('SELECT id FROM settings WHERE id = 1');
  if (!settingsRow) {
    await run(`
      INSERT INTO settings (id, host, port, secure, user, pass, from_email, from_name)
      VALUES (1, '', 587, 0, '', '', '', '')
    `);
  }

  // 2. templates table
  await run(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY DEFAULT 1,
      subject TEXT,
      body TEXT,
      recipient_column TEXT
    )
  `);

  const templateRow = await get('SELECT id FROM templates WHERE id = 1');
  if (!templateRow) {
    await run(`
      INSERT INTO templates (id, subject, body, recipient_column)
      VALUES (1, '', '', '')
    `);
  }

  // 3. logs table
  await run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      recipient TEXT,
      subject TEXT,
      status TEXT,
      error_message TEXT
    )
  `);
}

module.exports = {
  initDatabase,
  getSettings: () => get('SELECT * FROM settings WHERE id = 1'),
  saveSettings: (s) => run(`
    UPDATE settings
    SET host = ?, port = ?, secure = ?, user = ?, pass = ?, from_email = ?, from_name = ?
    WHERE id = 1
  `, [s.host, s.port, s.secure ? 1 : 0, s.user, s.pass, s.from_email, s.from_name]),
  getTemplate: () => get('SELECT * FROM templates WHERE id = 1'),
  saveTemplate: (t) => run(`
    UPDATE templates
    SET subject = ?, body = ?, recipient_column = ?
    WHERE id = 1
  `, [t.subject, t.body, t.recipient_column]),
  getLogs: () => all('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 200'),
  addLog: (l) => run(`
    INSERT INTO logs (timestamp, recipient, subject, status, error_message)
    VALUES (?, ?, ?, ?, ?)
  `, [new Date().toISOString(), l.recipient, l.subject, l.status, l.error_message || null]),
  clearLogs: () => run('DELETE FROM logs')
};
