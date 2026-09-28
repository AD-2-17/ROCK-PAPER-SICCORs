import express from 'express';
import http from 'http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import cors from 'cors';

import {
  initDb,
  createUser,
  getUserByUsername,
  getUserById,
  recordMatch,
  getLeaderboard,
  getUserMatches
} from './db.js';

import { determineWinner, isValidChoice } from './game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dogofwar-secret-key-2024';
const IS_VERCEL = !!process.env.VERCEL;

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// IN-MEMORY STATE (shared by both Socket.IO and REST modes)
// ============================================================
const onlinePlayers = new Map(); // socketId → { userId, username }
const rooms = new Map();         // roomCode → room object
let matchmakingQueue = [];       // [{ userId, username }]
const userSockets = new Map();   // userId → socketId
const disconnectTimeouts = new Map();
const userRooms = new Map();     // userId → roomCode

// ============================================================
// HELPERS
// ============================================================
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  let attempts = 0;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    attempts++;
    if (attempts > 100) {
      code = crypto.randomBytes(3).toString('hex').toUpperCase();
    }
  } while (rooms.has(code));
  return code;
}

function normalizeRoomCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getPlayerRoomByUserId(userId) {
  const roomCode = userRooms.get(userId);
  if (roomCode) {
    const room = rooms.get(roomCode);
    if (room && room.players.find(p => p.userId === userId)) {
      return room;
    }
    userRooms.delete(userId);
  }
  return null;
}

function cleanupPlayerFromRoom(userId, io) {
  const room = getPlayerRoomByUserId(userId);
  if (!room) return null;

  const roomCode = room.code;
  
  if (io) {
    const socketId = userSockets.get(userId);
    if (socketId) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) socket.leave(roomCode);
    }
  }

  room.players = room.players.filter(p => p.userId !== userId);
  userRooms.delete(userId);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
  } else {
    const remainingPlayer = room.players[0];
    room.state = 'abandoned'; // Opponent left
    remainingPlayer.choice = null;
    remainingPlayer.wantsRematch = false;
    if (io) {
      io.to(remainingPlayer.userId).emit('opponent-left', {});
    }
  }

  return roomCode;
}

function cleanupPlayerByUserId(userId, io) {
  matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);
  cleanupPlayerFromRoom(userId, io);
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ============================================================
// STATIC FILES (production)
// ============================================================
if (!IS_VERCEL) {
  app.use(express.static(path.join(__dirname, '../dist')));
}

// ============================================================
// REST AUTH ENDPOINTS
// ============================================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const existingUser = getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = createUser(username, hashedPassword);
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = getUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  try {
    const user = getUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/leaderboard', (req, res) => {
  try {
    res.json(getLeaderboard());
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/matches', authMiddleware, (req, res) => {
  try {
    res.json(getUserMatches(req.user.userId));
  } catch (error) {
    console.error('Matches error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// REST GAME ENDPOINTS (for polling mode — used on Vercel)
// ============================================================

// Create a private room
app.post('/api/game/create-room', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId.toString();
    const username = req.user.username;

    // Clean up any existing room
    const existing = getPlayerRoomByUserId(userId);
    if (existing) cleanupPlayerFromRoom(userId, null);
    matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);

    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      players: [{ userId, username, choice: null, wantsRematch: false }],
      scores: { [userId]: 0 },
      state: 'waiting',
      createdAt: Date.now(),
      lastResult: null,
      roundNumber: 0,
    };

    rooms.set(roomCode, room);
    userRooms.set(userId, roomCode);
    res.json({ roomCode });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join a room
app.post('/api/game/join-room', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId.toString();
    const username = req.user.username;
    const roomCode = normalizeRoomCode(req.body.roomCode);

    if (!roomCode) return res.status(400).json({ error: 'Invalid room code' });

    const room = rooms.get(roomCode);
    if (!room) return res.status(404).json({ error: `Room "${roomCode}" not found` });
    if (room.players.length >= 2) return res.status(400).json({ error: 'Room is full' });
    if (room.players.find(p => p.userId === userId)) return res.status(400).json({ error: 'Already in this room' });

    // Clean up other rooms
    const existing = getPlayerRoomByUserId(userId);
    if (existing && existing.code !== roomCode) cleanupPlayerFromRoom(userId, null);
    matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);

    room.players.push({ userId, username, choice: null, wantsRematch: false });
    room.scores[userId] = 0;
    room.state = 'playing';
    userRooms.set(userId, roomCode);

    const host = room.players[0];
    const joiner = room.players[1];

    res.json({ roomCode, opponent: host.username });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit a choice
app.post('/api/game/choice', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId.toString();
    const { choice } = req.body;

    if (!isValidChoice(choice)) return res.status(400).json({ error: 'Invalid choice' });

    const room = getPlayerRoomByUserId(userId);
    if (!room || room.state !== 'playing' || room.players.length !== 2) {
      return res.status(400).json({ error: 'Not in an active game' });
    }

    const playerIndex = room.players.findIndex(p => p.userId === userId);
    if (playerIndex === -1) return res.status(400).json({ error: 'Not in room' });

    const player = room.players[playerIndex];
    if (player.choice !== null) return res.status(400).json({ error: 'Already chose' });

    player.choice = choice;

    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const opponent = room.players[opponentIndex];

    // If both chose, compute result
    if (player.choice && opponent.choice) {
      const result = determineWinner(room.players[0].choice, room.players[1].choice);

      let winnerId = null;
      let isDraw = false;

      if (result === 'player1') {
        room.scores[room.players[0].userId]++;
        winnerId = room.players[0].userId;
      } else if (result === 'player2') {
        room.scores[room.players[1].userId]++;
        winnerId = room.players[1].userId;
      } else {
        isDraw = true;
      }

      try {
        recordMatch(
          room.players[0].userId, room.players[1].userId,
          room.players[0].choice, room.players[1].choice,
          winnerId, isDraw
        );
      } catch (err) { console.error('Error recording match:', err); }

      // Store result for polling
      room.lastResult = {
        [room.players[0].userId]: {
          playerChoice: room.players[0].choice,
          opponentChoice: room.players[1].choice,
          result: result === 'player1' ? 'win' : result === 'player2' ? 'loss' : 'draw',
          scores: { player: room.scores[room.players[0].userId], opponent: room.scores[room.players[1].userId] },
        },
        [room.players[1].userId]: {
          playerChoice: room.players[1].choice,
          opponentChoice: room.players[0].choice,
          result: result === 'player2' ? 'win' : result === 'player1' ? 'loss' : 'draw',
          scores: { player: room.scores[room.players[1].userId], opponent: room.scores[room.players[0].userId] },
        },
      };
      room.state = 'result';
      // Reset choices (result is stored in lastResult)
      room.players[0].choice = null;
      room.players[1].choice = null;
      room.players[0].wantsRematch = false;
      room.players[1].wantsRematch = false;
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Choice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Play again
app.post('/api/game/play-again', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId.toString();
    const room = getPlayerRoomByUserId(userId);
    if (!room || room.players.length !== 2) return res.status(400).json({ error: 'Not in a game' });

    const playerIndex = room.players.findIndex(p => p.userId === userId);
    if (playerIndex === -1) return res.status(400).json({ error: 'Not in room' });

    room.players[playerIndex].wantsRematch = true;

    if (room.players[0].wantsRematch && room.players[1].wantsRematch) {
      room.players[0].choice = null;
      room.players[1].choice = null;
      room.players[0].wantsRematch = false;
      room.players[1].wantsRematch = false;
      room.lastResult = null;
      room.state = 'playing';
      room.roundNumber = (room.roundNumber || 0) + 1;
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Play again error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave room
app.post('/api/game/leave-room', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId.toString();
    cleanupPlayerByUserId(userId, null);
    res.json({ ok: true });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Find match (enter matchmaking queue)
app.post('/api/game/find-match', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId.toString();
    const username = req.user.username;

    // Already in queue or room?
    if (matchmakingQueue.find(p => p.userId === userId) || getPlayerRoomByUserId(userId)) {
      const room = getPlayerRoomByUserId(userId);
      if (room && room.players.length === 2) {
        const opponent = room.players.find(p => p.userId !== userId);
        return res.json({ matched: true, roomCode: room.code, opponent: opponent?.username });
      }
      return res.json({ queued: true });
    }

    matchmakingQueue.push({ userId, username });

    if (matchmakingQueue.length >= 2) {
      const p1 = matchmakingQueue.shift();
      const p2 = matchmakingQueue.shift();

      const roomCode = generateRoomCode();
      const room = {
        code: roomCode,
        players: [
          { ...p1, choice: null, wantsRematch: false },
          { ...p2, choice: null, wantsRematch: false },
        ],
        scores: { [p1.userId]: 0, [p2.userId]: 0 },
        state: 'playing',
        createdAt: Date.now(),
        lastResult: null,
        roundNumber: 0,
      };

      rooms.set(roomCode, room);
      userRooms.set(p1.userId, roomCode);
      userRooms.set(p2.userId, roomCode);

      const isP1 = userId === p1.userId;
      return res.json({
        matched: true,
        roomCode,
        opponent: isP1 ? p2.username : p1.username,
      });
    }

    res.json({ queued: true });
  } catch (error) {
    console.error('Find match error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel matchmaking
app.delete('/api/game/find-match', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId.toString();
    matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);
    res.json({ ok: true });
  } catch (error) {
    console.error('Cancel find error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check matchmaking status (poll)
app.get('/api/game/matchmaking-status', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId.toString();

    const room = getPlayerRoomByUserId(userId);
    if (room && room.players.length === 2) {
      const opponent = room.players.find(p => p.userId !== userId);
      return res.json({ status: 'matched', roomCode: room.code, opponent: opponent?.username });
    }
    if (matchmakingQueue.find(p => p.userId === userId)) {
      return res.json({ status: 'queued' });
    }
    res.json({ status: 'none' });
  } catch (error) {
    console.error('Matchmaking status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Poll game state (the core polling endpoint)
app.get('/api/game/state/:roomCode', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId.toString();
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const room = rooms.get(roomCode);

    if (!room) {
      return res.json({ opponentLeft: true, roomState: 'gone' });
    }

    const player = room.players.find(p => p.userId === userId);
    const opponent = room.players.find(p => p.userId !== userId);

    if (!player) {
      return res.json({ opponentLeft: true, roomState: 'gone' });
    }

    const state = {
      roomCode: room.code,
      roomState: room.state, // 'waiting', 'playing', 'result', 'abandoned'
      playerCount: room.players.length,
      opponent: opponent?.username || null,
      matchReady: room.players.length === 2 && (room.state === 'playing' || room.state === 'result'),
      myChoice: player.choice,
      opponentChose: !!(opponent?.choice),
      lastResult: room.lastResult ? room.lastResult[userId] || null : null,
      opponentWantsRematch: !!(opponent?.wantsRematch),
      roundNumber: room.roundNumber || 0,
      opponentLeft: room.state === 'abandoned',
      scores: {
        player: room.scores?.[userId] || 0,
        opponent: opponent ? (room.scores?.[opponent.userId] || 0) : 0,
      },
    };

    res.json(state);
  } catch (error) {
    console.error('Game state error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// SOCKET.IO (only for local development, NOT on Vercel)
// ============================================================
if (!IS_VERCEL) {
  const { Server } = await import('socket.io');
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });

  function broadcastOnlineCount() {
    io.emit('online-count', { count: userSockets.size });
  }

  // Periodic room cleanup
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      if (room.players.length === 0) { rooms.delete(code); continue; }
      if (room.state === 'waiting' && room.createdAt && (now - room.createdAt > 30 * 60 * 1000)) {
        for (const p of room.players) {
          userRooms.delete(p.userId);
          const sid = userSockets.get(p.userId);
          if (sid) io.to(sid).emit('error', { message: 'Room expired' });
        }
        rooms.delete(code);
      }
    }
  }, 60000);

  io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);

    socket.on('authenticate', ({ token }) => {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId.toString();
        const username = decoded.username;

        if (disconnectTimeouts.has(userId)) {
          clearTimeout(disconnectTimeouts.get(userId));
          disconnectTimeouts.delete(userId);
        }

        const oldSocketId = userSockets.get(userId);
        if (oldSocketId && oldSocketId !== socket.id) {
          onlinePlayers.delete(oldSocketId);
        }

        onlinePlayers.set(socket.id, { userId, username });
        userSockets.set(userId, socket.id);
        socket.join(userId);

        socket.emit('authenticated', { success: true, user: { id: userId, username } });
        broadcastOnlineCount();

        const room = getPlayerRoomByUserId(userId);
        if (room) {
          socket.join(room.code);
          if (room.state === 'playing' && room.players.length === 2) {
            const opp = room.players.find(p => p.userId !== userId);
            setTimeout(() => {
              socket.emit('match-ready', { roomCode: room.code, opponent: opp?.username || 'Opponent' });
            }, 800);
          } else if (room.state === 'waiting') {
            socket.emit('room-created', { roomCode: room.code });
          }
        }
      } catch (err) {
        socket.emit('error', { message: 'Authentication failed' });
      }
    });

    socket.on('find-match', () => {
      const player = onlinePlayers.get(socket.id);
      if (!player) return socket.emit('error', { message: 'Not authenticated' });
      if (matchmakingQueue.find(p => p.userId === player.userId) || getPlayerRoomByUserId(player.userId)) return;

      matchmakingQueue.push({ ...player });

      if (matchmakingQueue.length >= 2) {
        const p1 = matchmakingQueue.shift();
        const p2 = matchmakingQueue.shift();
        const p1SocketId = userSockets.get(p1.userId);
        const p2SocketId = userSockets.get(p2.userId);
        if (!p1SocketId || !io.sockets.sockets.get(p1SocketId)) { matchmakingQueue.unshift(p2); return; }
        if (!p2SocketId || !io.sockets.sockets.get(p2SocketId)) { matchmakingQueue.unshift(p1); return; }

        const roomCode = generateRoomCode();
        const room = {
          code: roomCode,
          players: [{ ...p1, choice: null, wantsRematch: false }, { ...p2, choice: null, wantsRematch: false }],
          scores: { [p1.userId]: 0, [p2.userId]: 0 },
          state: 'playing', createdAt: Date.now(), lastResult: null, roundNumber: 0,
        };
        rooms.set(roomCode, room);
        userRooms.set(p1.userId, roomCode);
        userRooms.set(p2.userId, roomCode);
        const s1 = io.sockets.sockets.get(p1SocketId);
        const s2 = io.sockets.sockets.get(p2SocketId);
        if (s1) s1.join(roomCode);
        if (s2) s2.join(roomCode);
        io.to(p1.userId).emit('match-ready', { roomCode, opponent: p2.username });
        io.to(p2.userId).emit('match-ready', { roomCode, opponent: p1.username });
      }
    });

    socket.on('cancel-find', () => {
      const player = onlinePlayers.get(socket.id);
      if (player) matchmakingQueue = matchmakingQueue.filter(p => p.userId !== player.userId);
    });

    socket.on('create-room', () => {
      const player = onlinePlayers.get(socket.id);
      if (!player) return socket.emit('error', { message: 'Not authenticated' });
      const existing = getPlayerRoomByUserId(player.userId);
      if (existing) cleanupPlayerFromRoom(player.userId, io);
      matchmakingQueue = matchmakingQueue.filter(p => p.userId !== player.userId);

      const roomCode = generateRoomCode();
      const room = {
        code: roomCode,
        players: [{ ...player, choice: null, wantsRematch: false }],
        scores: { [player.userId]: 0 },
        state: 'waiting', createdAt: Date.now(), lastResult: null, roundNumber: 0,
      };
      rooms.set(roomCode, room);
      userRooms.set(player.userId, roomCode);
      socket.join(roomCode);
      socket.emit('room-created', { roomCode });
    });

    socket.on('join-room', ({ roomCode: rawRoomCode }) => {
      const player = onlinePlayers.get(socket.id);
      if (!player) return socket.emit('error', { message: 'Not authenticated' });
      const roomCode = normalizeRoomCode(rawRoomCode);
      if (!roomCode) return socket.emit('error', { message: 'Invalid room code' });

      const room = rooms.get(roomCode);
      if (!room) return socket.emit('error', { message: `Room "${roomCode}" not found` });
      if (room.players.length >= 2) return socket.emit('error', { message: 'Room is full' });
      if (room.players.find(p => p.userId === player.userId)) return socket.emit('error', { message: 'Already in this room' });

      const existing = getPlayerRoomByUserId(player.userId);
      if (existing && existing.code !== roomCode) cleanupPlayerFromRoom(player.userId, io);
      matchmakingQueue = matchmakingQueue.filter(p => p.userId !== player.userId);

      room.players.push({ ...player, choice: null, wantsRematch: false });
      room.scores[player.userId] = 0;
      room.state = 'playing';
      userRooms.set(player.userId, roomCode);
      socket.join(roomCode);

      const host = room.players[0];
      const joiner = room.players[1];
      const hostSocketId = userSockets.get(host.userId);
      if (hostSocketId) {
        const hostSocket = io.sockets.sockets.get(hostSocketId);
        if (hostSocket && !hostSocket.rooms.has(roomCode)) hostSocket.join(roomCode);
      }
      io.to(host.userId).emit('match-ready', { roomCode, opponent: joiner.username });
      io.to(joiner.userId).emit('match-ready', { roomCode, opponent: host.username });
    });

    socket.on('leave-room', () => {
      const player = onlinePlayers.get(socket.id);
      if (!player) return;
      cleanupPlayerByUserId(player.userId, io);
    });

    socket.on('player-choice', ({ choice }) => {
      const playerInfo = onlinePlayers.get(socket.id);
      if (!playerInfo) return;
      if (!isValidChoice(choice)) return socket.emit('error', { message: 'Invalid choice' });

      const room = getPlayerRoomByUserId(playerInfo.userId);
      if (!room || room.state !== 'playing' || room.players.length !== 2) return;

      const playerIndex = room.players.findIndex(p => p.userId === playerInfo.userId);
      if (playerIndex === -1) return;
      const player = room.players[playerIndex];
      if (player.choice !== null) return;

      player.choice = choice;
      const opponentIndex = playerIndex === 0 ? 1 : 0;
      const opponent = room.players[opponentIndex];

      io.to(opponent.userId).emit('opponent-chose', {});

      if (player.choice && opponent.choice) {
        const result = determineWinner(room.players[0].choice, room.players[1].choice);
        let winnerId = null, isDraw = false;
        if (result === 'player1') { room.scores[room.players[0].userId]++; winnerId = room.players[0].userId; }
        else if (result === 'player2') { room.scores[room.players[1].userId]++; winnerId = room.players[1].userId; }
        else { isDraw = true; }

        try { recordMatch(room.players[0].userId, room.players[1].userId, room.players[0].choice, room.players[1].choice, winnerId, isDraw); } catch (err) { console.error('Error recording match:', err); }

        // Store result for polling too
        room.lastResult = {
          [room.players[0].userId]: { playerChoice: room.players[0].choice, opponentChoice: room.players[1].choice, result: result === 'player1' ? 'win' : result === 'player2' ? 'loss' : 'draw', scores: { player: room.scores[room.players[0].userId], opponent: room.scores[room.players[1].userId] } },
          [room.players[1].userId]: { playerChoice: room.players[1].choice, opponentChoice: room.players[0].choice, result: result === 'player2' ? 'win' : result === 'player1' ? 'loss' : 'draw', scores: { player: room.scores[room.players[1].userId], opponent: room.scores[room.players[0].userId] } },
        };

        io.to(room.players[0].userId).emit('round-result', room.lastResult[room.players[0].userId]);
        io.to(room.players[1].userId).emit('round-result', room.lastResult[room.players[1].userId]);

        room.state = 'result';
        room.players[0].choice = null;
        room.players[1].choice = null;
        room.players[0].wantsRematch = false;
        room.players[1].wantsRematch = false;
      }
    });

    socket.on('play-again', () => {
      const playerInfo = onlinePlayers.get(socket.id);
      if (!playerInfo) return;
      const room = getPlayerRoomByUserId(playerInfo.userId);
      if (!room || room.players.length !== 2) return;
      const playerIndex = room.players.findIndex(p => p.userId === playerInfo.userId);
      if (playerIndex === -1) return;

      room.players[playerIndex].wantsRematch = true;
      const opponentIndex = playerIndex === 0 ? 1 : 0;
      const opponent = room.players[opponentIndex];

      if (room.players[0].wantsRematch && room.players[1].wantsRematch) {
        room.players[0].choice = null; room.players[1].choice = null;
        room.players[0].wantsRematch = false; room.players[1].wantsRematch = false;
        room.lastResult = null;
        room.state = 'playing';
        room.roundNumber = (room.roundNumber || 0) + 1;
        io.to(room.code).emit('new-round', {});
      } else {
        io.to(opponent.userId).emit('opponent-play-again', {});
      }
    });

    socket.on('disconnect', () => {
      const playerInfo = onlinePlayers.get(socket.id);
      onlinePlayers.delete(socket.id);
      if (playerInfo) {
        const { userId, username } = playerInfo;
        if (userSockets.get(userId) === socket.id) {
          const timeout = setTimeout(() => {
            cleanupPlayerByUserId(userId, io);
            userSockets.delete(userId);
            disconnectTimeouts.delete(userId);
            broadcastOnlineCount();
          }, 7000);
          disconnectTimeouts.set(userId, timeout);
        }
      }
    });
  });

  // SPA catch-all
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });

  // Init DB and start server
  initDb();
  httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
} else {
  // Vercel mode: just init DB, app is exported
  initDb();
}

export default app;
