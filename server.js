require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const db = new Database('filmarchiv.db');

app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-bitte-ändern',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== DATENBANK ====================
db.exec(`
    CREATE TABLE IF NOT EXISTS packs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    filename TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    genre TEXT NOT NULL,
    title TEXT NOT NULL,
    duration TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    rating INTEGER NOT NULL,
    genre TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS retro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Prüfen ob die user_id Spalten schon existieren (für bestehende DBs)
try {
  db.prepare('SELECT user_id FROM watchlist LIMIT 1').get();
} catch (e) {
  // Spalten fehlen → hinzufügen und bestehende Daten zuweisen
  console.log('Migriere bestehende Daten...');
  db.exec(`
    ALTER TABLE watchlist ADD COLUMN user_id INTEGER;
    ALTER TABLE archive ADD COLUMN user_id INTEGER;
    ALTER TABLE retro ADD COLUMN user_id INTEGER;
  `);
}

// User anlegen
const chrisExists = db.prepare('SELECT id FROM users WHERE username = ?').get('Chris');
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');

let chrisId;

if (!chrisExists) {
  const hash = bcrypt.hashSync('chr15', 10);
  const info = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('Chris', hash, 'user');
  chrisId = info.lastInsertRowid;
  console.log('User "Chris" wurde angelegt');
} else {
  chrisId = chrisExists.id;
}

if (!adminExists) {
  const hash = bcrypt.hashSync('4ch1ve', 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
  console.log('User "admin" wurde angelegt');
}

// Bestehende Daten (ohne user_id) dem User Chris zuweisen
db.prepare('UPDATE watchlist SET user_id = ? WHERE user_id IS NULL').run(chrisId);
db.prepare('UPDATE archive SET user_id = ? WHERE user_id IS NULL').run(chrisId);
db.prepare('UPDATE retro SET user_id = ? WHERE user_id IS NULL').run(chrisId);

// ==================== AUTH ====================
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Nicht eingeloggt' });
  }
  return res.redirect('/login');
}

app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.redirect('/login?error=1');
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;

  // Admin kommt ins Admin-Portal, normale User in die App
  if (user.role === 'admin') {
    return res.redirect('/admin');
  }
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Alles ab hier braucht Login
app.use(requireAuth);

// Aktuellen User zurückgeben
app.get('/api/me', (req, res) => {
  res.json({
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role
  });
});

// ==================== ADMIN MIDDLEWARE ====================
function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Keine Admin-Rechte' });
  }
  return res.redirect('/');
}

// ==================== ADMIN ROUTEN ====================
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Alle User abrufen
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id').all();
  res.json(users);
});

// Neuen User anlegen
app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, role || 'user');
    res.json({ id: info.lastInsertRowid, username, role: role || 'user' });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Benutzername bereits vergeben' });
    }
    throw err;
  }
});

// Passwort ändern
app.put('/api/admin/users/:id/password', requireAuth, requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Neues Passwort erforderlich' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ success: true });
});

// User löschen
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);

  // Verhindern, dass der Admin sich selbst löscht
  if (userId === req.session.userId) {
    return res.status(400).json({ error: 'Du kannst dich nicht selbst löschen' });
  }

  // Zuerst die Daten des Users löschen
  db.prepare('DELETE FROM watchlist WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM archive WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM retro WHERE user_id = ?').run(userId);

  // Dann den User selbst
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ success: true });
});

// ==================== API (jetzt user-spezifisch) ====================

// Watchlist
app.get('/api/watch', (req, res) => {
  const rows = db.prepare('SELECT id, genre, title, duration FROM watchlist WHERE user_id = ? ORDER BY genre, title').all(req.session.userId);
  res.json(rows);
});

app.post('/api/watch', (req, res) => {
  const { genre, title, duration } = req.body;
  const info = db.prepare('INSERT INTO watchlist (user_id, genre, title, duration) VALUES (?, ?, ?, ?)').run(req.session.userId, genre, title, duration || null);
  res.json({ id: info.lastInsertRowid, genre, title, duration });
});

app.put('/api/watch/:id', (req, res) => {
  const { genre, title, duration } = req.body;
  db.prepare('UPDATE watchlist SET genre = ?, title = ?, duration = ? WHERE id = ? AND user_id = ?')
    .run(genre, title, duration || null, req.params.id, req.session.userId);
  res.json({ success: true });
});

app.delete('/api/watch/:id', (req, res) => {
  db.prepare('DELETE FROM watchlist WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ success: true });
});

// Archive
app.get('/api/archive', (req, res) => {
  const rows = db.prepare('SELECT id, title, rating, genre FROM archive WHERE user_id = ? ORDER BY rating DESC, title').all(req.session.userId);
  res.json(rows);
});

app.post('/api/archive', (req, res) => {
  const { title, rating, genre } = req.body;
  const info = db.prepare('INSERT INTO archive (user_id, title, rating, genre) VALUES (?, ?, ?, ?)').run(req.session.userId, title, rating, genre);
  res.json({ id: info.lastInsertRowid, title, rating, genre });
});

app.put('/api/archive/:id', (req, res) => {
  const { title, rating, genre } = req.body;
  db.prepare('UPDATE archive SET title = ?, rating = ?, genre = ? WHERE id = ? AND user_id = ?')
    .run(title, rating, genre, req.params.id, req.session.userId);
  res.json({ success: true });
});

app.delete('/api/archive/:id', (req, res) => {
  db.prepare('DELETE FROM archive WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ success: true });
});

// Retro
app.get('/api/retro', (req, res) => {
  const rows = db.prepare('SELECT id, title FROM retro WHERE user_id = ? ORDER BY title').all(req.session.userId);
  res.json(rows);
});

app.post('/api/retro', (req, res) => {
  const { title } = req.body;
  const info = db.prepare('INSERT INTO retro (user_id, title) VALUES (?, ?)').run(req.session.userId, title);
  res.json({ id: info.lastInsertRowid, title });
});

app.put('/api/retro/:id', (req, res) => {
  const { title } = req.body;
  db.prepare('UPDATE retro SET title = ? WHERE id = ? AND user_id = ?').run(title, req.params.id, req.session.userId);
  res.json({ success: true });
});

app.delete('/api/retro/:id', (req, res) => {
  db.prepare('DELETE FROM retro WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ success: true });
});

// ==================== FILM-PAKETE ====================
const fs = require('fs');

// Verfügbare Packs für User
app.get('/api/packs', (req, res) => {
  const packs = db.prepare('SELECT id, name, filename, description FROM packs ORDER BY name').all();
  res.json(packs);
});

// Pack importieren
app.post('/api/packs/import', (req, res) => {
  const { packId } = req.body;
  if (!packId) return res.status(400).json({ error: 'Kein Paket angegeben' });

  const pack = db.prepare('SELECT * FROM packs WHERE id = ?').get(packId);
  if (!pack) return res.status(404).json({ error: 'Paket nicht gefunden' });

  const filePath = path.join(__dirname, 'data', 'packs', pack.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Datei "${pack.filename}" nicht gefunden. Bitte im Ordner data/packs/ hinterlegen.` });
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const films = JSON.parse(raw);

    if (!Array.isArray(films)) {
      return res.status(400).json({ error: 'Ungültiges JSON-Format' });
    }

    const insert = db.prepare(
      'INSERT INTO watchlist (user_id, genre, title, duration) VALUES (?, ?, ?, ?)'
    );

    const insertMany = db.transaction((rows) => {
      let count = 0;
      for (const film of rows) {
        if (!film.title || !film.genre) continue;
        insert.run(req.session.userId, film.genre, film.title, film.duration || null);
        count++;
      }
      return count;
    });

    const imported = insertMany(films);

    res.json({
      success: true,
      imported,
      message: `${imported} Filme wurden in deine Watchlist importiert.`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Importieren der Datei' });
  }
});

// ===== ADMIN: Packs verwalten =====
app.get('/api/admin/packs', requireAuth, requireAdmin, (req, res) => {
  const packs = db.prepare('SELECT * FROM packs ORDER BY created_at DESC').all();
  res.json(packs);
});

app.post('/api/admin/packs', requireAuth, requireAdmin, (req, res) => {
  const { name, filename, description } = req.body;
  if (!name || !filename) {
    return res.status(400).json({ error: 'Name und Dateiname sind erforderlich' });
  }

  if (!filename.endsWith('.json')) {
    return res.status(400).json({ error: 'Dateiname muss auf .json enden' });
  }

  try {
    const info = db.prepare(
      'INSERT INTO packs (name, filename, description) VALUES (?, ?, ?)'
    ).run(name, filename, description || null);

    res.json({ id: info.lastInsertRowid, name, filename, description });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Dieser Dateiname ist bereits vergeben' });
    }
    throw err;
  }
});

app.delete('/api/admin/packs/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM packs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Statische Dateien
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Filmarchiv läuft unter http://localhost:${PORT}`);
});