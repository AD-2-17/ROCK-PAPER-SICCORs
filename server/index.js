import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
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

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// In-memory state
const onlinePlayers = new Map(); // socketId → { userId, username }
const rooms = new Map(); // roomCode → { code, players: [{ userId, username, choice, wantsRematch }], scores: {}, state, createdAt }
let matchmakingQueue = []; // [{ userId, username }]
const userSockets = new Map(); // userId → socketId
const disconnectTimeouts = new Map(); // userId → timeout
// Reverse lookup: userId → roomCode (for O(1) room finding instead of scanning all rooms)
const userRooms = new Map();

// Periodic room cleanup — remove rooms older than 30 minutes that are in 'waiting' state with 0 players
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    // Clean up empty rooms
    if (room.players.length === 0) {
      rooms.delete(code);
      continue;
    }
    // Clean up waiting rooms older than 30 minutes
    if (room.state === 'waiting' && room.createdAt && (now - room.createdAt > 30 * 60 * 1000)) {
      // Notify any remaining player
      for (const p of room.players) {
        userRooms.delete(p.userId);
        const sid = userSockets.get(p.userId);
        if (sid) {
          io.to(sid).emit('error', { message: 'Room expired due to inactivity' });
        }
      }
      rooms.delete(code);
    }
  }
}, 60000); // Check every minute

// Serve static files
app.use(express.static(path.join(__dirname, '../dist')));

// Middleware
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

// REST Endpoints
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

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

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
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/leaderboard', (req, res) => {
  try {
    const leaderboard = getLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/matches', authMiddleware, (req, res) => {
  try {
    const matches = getUserMatches(req.user.userId);
    res.json(matches);
  } catch (error) {
    console.error('Matches error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Socket Helpers
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous: 0/O, 1/I
  let code;
  let attempts = 0;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    attempts++;
    if (attempts > 100) {
      // Fallback to crypto if we can't find a unique code
      code = crypto.randomBytes(3).toString('hex').toUpperCase();
    }
  } while (rooms.has(code));
  return code;
}

function normalizeRoomCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function broadcastOnlineCount() {
  io.emit('online-count', { count: userSockets.size });
}

function getPlayerRoomByUserId(userId) {
  // O(1) lookup using the reverse map
  const roomCode = userRooms.get(userId);
  if (roomCode) {
    const room = rooms.get(roomCode);
    if (room && room.players.find(p => p.userId === userId)) {
      return room;
    }
    // Stale entry — clean it up
    userRooms.delete(userId);
  }
  return null;
}

function cleanupPlayerFromRoom(userId) {
  const room = getPlayerRoomByUserId(userId);
  if (!room) return null;

  const roomCode = room.code;
  
  // Remove from socket.io room
  const socketId = userSockets.get(userId);
  if (socketId) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(roomCode);
    }
  }

  // Remove from room
  room.players = room.players.filter(p => p.userId !== userId);
  userRooms.delete(userId);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
  } else {
    const remainingPlayer = room.players[0];
    io.to(remainingPlayer.userId).emit('opponent-left', {});
    room.state = 'waiting';
    remainingPlayer.choice = null;
    remainingPlayer.wantsRematch = false;
  }

  return roomCode;
}

function cleanupPlayerByUserId(userId) {
  matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);
  cleanupPlayerFromRoom(userId);
}

// Socket.IO Events
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on('authenticate', ({ token }) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.userId.toString(); // stringify for socket room
      const username = decoded.username;

      // Clear any pending disconnect timeout
      if (disconnectTimeouts.has(userId)) {
        clearTimeout(disconnectTimeouts.get(userId));
        disconnectTimeouts.delete(userId);
        console.log(`Reconnect grace period cleared for ${username}`);
      }

      // If there's an old socket for this user, clean it up
      const oldSocketId = userSockets.get(userId);
      if (oldSocketId && oldSocketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
          onlinePlayers.delete(oldSocketId);
          // Don't disconnect the old socket aggressively, just remove mapping
        }
      }

      onlinePlayers.set(socket.id, { userId, username });
      userSockets.set(userId, socket.id);
      
      // Join a room named after userId for targeted messaging
      socket.join(userId);

      socket.emit('authenticated', { success: true, user: { id: userId, username } });
      broadcastOnlineCount();
      console.log(`User authenticated: ${username} (${socket.id})`);

      // If they were already in a game, reconnect them
      const room = getPlayerRoomByUserId(userId);
      if (room) {
        socket.join(room.code);
        if (room.state === 'playing') {
          const opponent = room.players.find(p => p.userId !== userId);
          // Give frontend a bit of time to reach lobby state if they just refreshed
          setTimeout(() => {
            socket.emit('match-ready', { roomCode: room.code, opponent: opponent ? opponent.username : 'Opponent' });
          }, 800);
        } else if (room.state === 'waiting') {
          socket.emit('room-created', { roomCode: room.code });
        }
      }

    } catch (err) {
      console.error('Authentication failed:', err.message);
      socket.emit('error', { message: 'Authentication failed' });
    }
  });

  socket.on('find-match', () => {
    const player = onlinePlayers.get(socket.id);
    if (!player) return socket.emit('error', { message: 'Not authenticated' });

    // Already in queue or room — don't double-join
    if (matchmakingQueue.find(p => p.userId === player.userId) || getPlayerRoomByUserId(player.userId)) {
      return;
    }

    matchmakingQueue.push({ ...player });
    console.log(`Player joined queue: ${player.username}`);

    if (matchmakingQueue.length >= 2) {
      const p1 = matchmakingQueue.shift();
      const p2 = matchmakingQueue.shift();

      // Verify both sockets are still valid
      const p1SocketId = userSockets.get(p1.userId);
      const p2SocketId = userSockets.get(p2.userId);

      if (!p1SocketId || !io.sockets.sockets.get(p1SocketId)) {
        // p1 disconnected, put p2 back in queue
        matchmakingQueue.unshift(p2);
        return;
      }
      if (!p2SocketId || !io.sockets.sockets.get(p2SocketId)) {
        // p2 disconnected, put p1 back in queue
        matchmakingQueue.unshift(p1);
        return;
      }

      const roomCode = generateRoomCode();
      const room = {
        code: roomCode,
        players: [
          { ...p1, choice: null, wantsRematch: false },
          { ...p2, choice: null, wantsRematch: false }
        ],
        scores: {
          [p1.userId]: 0,
          [p2.userId]: 0
        },
        state: 'playing',
        createdAt: Date.now()
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
      
      console.log(`Match created: ${p1.username} vs ${p2.username} in room ${roomCode}`);
    }
  });

  socket.on('cancel-find', () => {
    const player = onlinePlayers.get(socket.id);
    if (player) {
      matchmakingQueue = matchmakingQueue.filter(p => p.userId !== player.userId);
    }
  });

  socket.on('create-room', () => {
    const player = onlinePlayers.get(socket.id);
    if (!player) return socket.emit('error', { message: 'Not authenticated' });

    // Clean up any existing room this player is in
    const existingRoom = getPlayerRoomByUserId(player.userId);
    if (existingRoom) {
      cleanupPlayerFromRoom(player.userId);
    }

    // Remove from matchmaking queue
    matchmakingQueue = matchmakingQueue.filter(p => p.userId !== player.userId);

    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      players: [{ ...player, choice: null, wantsRematch: false }],
      scores: {
        [player.userId]: 0
      },
      state: 'waiting',
      createdAt: Date.now()
    };

    rooms.set(roomCode, room);
    userRooms.set(player.userId, roomCode);
    socket.join(roomCode);
    socket.emit('room-created', { roomCode });
    console.log(`Room created: ${roomCode} by ${player.username}`);
  });

  socket.on('join-room', ({ roomCode: rawRoomCode }) => {
    const player = onlinePlayers.get(socket.id);
    if (!player) return socket.emit('error', { message: 'Not authenticated' });

    // Normalize the room code
    const roomCode = normalizeRoomCode(rawRoomCode);
    if (!roomCode) return socket.emit('error', { message: 'Invalid room code' });

    console.log(`[join-room] ${player.username} attempting to join room: "${roomCode}"`);

    // Check if room exists
    const room = rooms.get(roomCode);
    if (!room) {
      console.log(`[join-room] Room "${roomCode}" not found. Available rooms: [${[...rooms.keys()].join(', ')}]`);
      return socket.emit('error', { message: `Room "${roomCode}" not found` });
    }

    // Check if room is full
    if (room.players.length >= 2) {
      console.log(`[join-room] Room "${roomCode}" is full`);
      return socket.emit('error', { message: 'Room is full' });
    }

    // Check if player is already in this room
    if (room.players.find(p => p.userId === player.userId)) {
      console.log(`[join-room] ${player.username} is already in room "${roomCode}"`);
      return socket.emit('error', { message: 'You are already in this room' });
    }

    // Clean up any other room this player is in
    const existingRoom = getPlayerRoomByUserId(player.userId);
    if (existingRoom && existingRoom.code !== roomCode) {
      cleanupPlayerFromRoom(player.userId);
    }

    // Remove from matchmaking queue
    matchmakingQueue = matchmakingQueue.filter(p => p.userId !== player.userId);

    // Add the joining player to the room with properly initialized fields
    room.players.push({ ...player, choice: null, wantsRematch: false });
    room.scores[player.userId] = 0;
    room.state = 'playing';
    userRooms.set(player.userId, roomCode);

    // Join socket.io room
    socket.join(roomCode);

    const host = room.players[0];
    const joiner = room.players[1];

    // Ensure host socket is also in the socket.io room
    const hostSocketId = userSockets.get(host.userId);
    if (hostSocketId) {
      const hostSocket = io.sockets.sockets.get(hostSocketId);
      if (hostSocket && !hostSocket.rooms.has(roomCode)) {
        hostSocket.join(roomCode);
      }
    }

    // Emit match-ready to both players using their userId rooms (most reliable)
    io.to(host.userId).emit('match-ready', { roomCode, opponent: joiner.username });
    io.to(joiner.userId).emit('match-ready', { roomCode, opponent: host.username });
    
    console.log(`[join-room] ${player.username} joined room ${roomCode} successfully. Players: [${room.players.map(p => p.username).join(', ')}]`);
  });

  socket.on('leave-room', () => {
    const player = onlinePlayers.get(socket.id);
    if (!player) return;
    cleanupPlayerByUserId(player.userId);
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
    if (player.choice !== null && player.choice !== undefined) return; // Already chose

    player.choice = choice;
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const opponent = room.players[opponentIndex];

    // Notify opponent that this player has chosen (without revealing the choice)
    io.to(opponent.userId).emit('opponent-chose', {});

    // Check if both players have chosen
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
          room.players[0].userId,
          room.players[1].userId,
          room.players[0].choice,
          room.players[1].choice,
          winnerId,
          isDraw
        );
      } catch (err) {
        console.error('Error recording match:', err);
      }

      // Send personalized results to each player
      io.to(room.players[0].userId).emit('round-result', {
        playerChoice: room.players[0].choice,
        opponentChoice: room.players[1].choice,
        result: result === 'player1' ? 'win' : result === 'player2' ? 'loss' : 'draw',
        scores: {
          player: room.scores[room.players[0].userId],
          opponent: room.scores[room.players[1].userId]
        }
      });

      io.to(room.players[1].userId).emit('round-result', {
        playerChoice: room.players[1].choice,
        opponentChoice: room.players[0].choice,
        result: result === 'player2' ? 'win' : result === 'player1' ? 'loss' : 'draw',
        scores: {
          player: room.scores[room.players[1].userId],
          opponent: room.scores[room.players[0].userId]
        }
      });

      // Reset for next round
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
      room.players[0].choice = null;
      room.players[1].choice = null;
      room.players[0].wantsRematch = false;
      room.players[1].wantsRematch = false;
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
      
      // Only clean up if this was the current socket for this user
      // (prevents cleanup when a stale socket disconnects after reconnect)
      if (userSockets.get(userId) === socket.id) {
        // Start grace period for reconnection
        const timeout = setTimeout(() => {
          cleanupPlayerByUserId(userId);
          userSockets.delete(userId);
          disconnectTimeouts.delete(userId);
          broadcastOnlineCount();
          console.log(`Player ${username} timed out after disconnect`);
        }, 7000);
        disconnectTimeouts.set(userId, timeout);
      }
    }
    
    console.log(`Disconnected: ${socket.id}`);
  });
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

initDb();

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
