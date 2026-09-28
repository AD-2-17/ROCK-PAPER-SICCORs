import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'dogofwar.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player1_id INTEGER REFERENCES users(id),
      player2_id INTEGER REFERENCES users(id),
      player1_choice TEXT,
      player2_choice TEXT,
      winner_id INTEGER,
      is_draw INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stats (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      games INTEGER DEFAULT 0
    );
  `);
}

export function createUser(username, hashedPassword) {
  const insertUser = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
  const insertStats = db.prepare('INSERT INTO stats (user_id) VALUES (?)');
  
  const transaction = db.transaction(() => {
    const info = insertUser.run(username, hashedPassword);
    insertStats.run(info.lastInsertRowid);
    return info.lastInsertRowid;
  });

  const id = transaction();
  return { id, username };
}

export function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserById(id) {
  return db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
}

export function recordMatch(player1Id, player2Id, p1Choice, p2Choice, winnerId, isDraw) {
  const insertMatch = db.prepare(`
    INSERT INTO matches (player1_id, player2_id, player1_choice, player2_choice, winner_id, is_draw)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateStats = db.prepare(`
    UPDATE stats SET
      games = games + 1,
      wins = wins + ?,
      losses = losses + ?,
      draws = draws + ?
    WHERE user_id = ?
  `);

  const transaction = db.transaction(() => {
    insertMatch.run(player1Id, player2Id, p1Choice, p2Choice, winnerId, isDraw ? 1 : 0);
    
    // Player 1 stats
    const p1Wins = winnerId === player1Id ? 1 : 0;
    const p1Losses = winnerId === player2Id ? 1 : 0;
    const draw = isDraw ? 1 : 0;
    updateStats.run(p1Wins, p1Losses, draw, player1Id);

    // Player 2 stats
    const p2Wins = winnerId === player2Id ? 1 : 0;
    const p2Losses = winnerId === player1Id ? 1 : 0;
    updateStats.run(p2Wins, p2Losses, draw, player2Id);
  });

  transaction();
}

export function getLeaderboard() {
  const stats = db.prepare(`
    SELECT u.username, s.wins, s.losses, s.draws, s.games
    FROM stats s
    JOIN users u ON s.user_id = u.id
    ORDER BY s.wins DESC, s.games ASC
    LIMIT 50
  `).all();

  return stats.map((stat, index) => ({
    rank: index + 1,
    ...stat
  }));
}

export function getUserMatches(userId) {
  const matches = db.prepare(`
    SELECT m.*, 
           u1.username as p1_username, 
           u2.username as p2_username
    FROM matches m
    JOIN users u1 ON m.player1_id = u1.id
    JOIN users u2 ON m.player2_id = u2.id
    WHERE m.player1_id = ? OR m.player2_id = ?
    ORDER BY m.created_at DESC
    LIMIT 50
  `).all(userId, userId);

  return matches.map(match => {
    const isPlayer1 = match.player1_id === userId;
    const opponent = isPlayer1 ? match.p2_username : match.p1_username;
    
    let result = 'draw';
    if (!match.is_draw) {
      if ((isPlayer1 && match.winner_id === match.player1_id) || 
          (!isPlayer1 && match.winner_id === match.player2_id)) {
        result = 'win';
      } else {
        result = 'loss';
      }
    }

    return {
      id: match.id,
      opponent,
      result,
      playerChoice: isPlayer1 ? match.player1_choice : match.player2_choice,
      opponentChoice: isPlayer1 ? match.player2_choice : match.player1_choice,
      createdAt: match.created_at
    };
  });
}
