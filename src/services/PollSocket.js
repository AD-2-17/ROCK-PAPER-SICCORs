/**
 * PollSocket — A drop-in replacement for Socket.IO that uses REST polling.
 * Has the same .on() / .off() / .emit() interface as a Socket.IO socket,
 * so the existing Lobby and GameRoom components work without changes.
 */

const API_URL = import.meta.env.VITE_API_URL || '';

export default class PollSocket {
  constructor() {
    this.listeners = {};
    this.connected = false;
    this.token = null;
    this.userId = null;
    this.roomCode = null;
    this.pollTimer = null;
    this.matchmakingTimer = null;
    this.lastState = null;
    this.lastRoundNumber = -1;
    this.seenResult = false;
    this.seenMatchReady = false;
  }

  // ── Socket.IO interface ──────────────────────────────────────

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    if (callback) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    } else {
      delete this.listeners[event];
    }
  }

  emit(event, data) {
    switch (event) {
      case 'authenticate':   return this._authenticate(data);
      case 'create-room':    return this._createRoom();
      case 'join-room':      return this._joinRoom(data);
      case 'find-match':     return this._findMatch();
      case 'cancel-find':    return this._cancelFind();
      case 'player-choice':  return this._makeChoice(data);
      case 'play-again':     return this._playAgain();
      case 'leave-room':     return this._leaveRoom();
      default:
        console.warn('[PollSocket] Unknown event:', event);
    }
  }

  disconnect() {
    this._stopAllPolling();
    this.connected = false;
    this.token = null;
    this.roomCode = null;
    this.lastState = null;
  }

  removeAllListeners() {
    this.listeners = {};
  }

  connect() {
    // No-op for PollSocket (connection happens via authenticate)
  }

  // ── Internal helpers ─────────────────────────────────────────

  _fire(event, data) {
    const cbs = this.listeners[event];
    if (cbs) cbs.forEach(cb => { try { cb(data); } catch(e) { console.error(e); } });
  }

  async _fetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_URL}${url}`, { ...options, headers });
    const ct = res.headers.get('content-type');
    if (ct && ct.includes('application/json')) {
      return await res.json();
    }
    throw new Error(`Non-JSON response (${res.status})`);
  }

  _stopAllPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.matchmakingTimer) { clearInterval(this.matchmakingTimer); this.matchmakingTimer = null; }
  }

  _startGamePolling() {
    this._stopGamePolling();
    this.pollTimer = setInterval(() => this._pollGameState(), 1500);
    // Also poll immediately
    this._pollGameState();
  }

  _stopGamePolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  _startMatchmakingPolling() {
    this._stopMatchmakingPolling();
    this.matchmakingTimer = setInterval(() => this._pollMatchmaking(), 2000);
  }

  _stopMatchmakingPolling() {
    if (this.matchmakingTimer) { clearInterval(this.matchmakingTimer); this.matchmakingTimer = null; }
  }

  // ── Event handlers ───────────────────────────────────────────

  async _authenticate({ token }) {
    this.token = token;
    try {
      const data = await this._fetch('/api/auth/me');
      if (data && data.id) {
        this.userId = data.id.toString();
        this.connected = true;
        this._fire('authenticated', { success: true, user: data });
        this._fire('online-count', { count: 1 }); // Approximate for serverless
      } else {
        this._fire('error', { message: 'Authentication failed' });
      }
    } catch (err) {
      console.error('[PollSocket] Auth error:', err);
      this._fire('error', { message: 'Authentication failed' });
    }
  }

  async _createRoom() {
    try {
      const data = await this._fetch('/api/game/create-room', { method: 'POST' });
      if (data.roomCode) {
        this.roomCode = data.roomCode;
        this.seenMatchReady = false;
        this.seenResult = false;
        this.lastRoundNumber = 0;
        this.lastState = null;
        this._fire('room-created', { roomCode: data.roomCode });
        this._startGamePolling();
      } else if (data.error) {
        this._fire('error', { message: data.error });
      }
    } catch (err) {
      console.error('[PollSocket] Create room error:', err);
      this._fire('error', { message: 'Failed to create room' });
    }
  }

  async _joinRoom({ roomCode }) {
    try {
      const data = await this._fetch('/api/game/join-room', {
        method: 'POST',
        body: JSON.stringify({ roomCode }),
      });
      if (data.roomCode) {
        this.roomCode = data.roomCode;
        this.seenMatchReady = false;
        this.seenResult = false;
        this.lastRoundNumber = 0;
        this.lastState = null;
        // Fire match-ready immediately since joining means both players are in
        this._fire('match-ready', { roomCode: data.roomCode, opponent: data.opponent });
        this.seenMatchReady = true;
        this._startGamePolling();
      } else if (data.error) {
        this._fire('error', { message: data.error });
      }
    } catch (err) {
      console.error('[PollSocket] Join room error:', err);
      this._fire('error', { message: 'Failed to join room' });
    }
  }

  async _findMatch() {
    try {
      const data = await this._fetch('/api/game/find-match', { method: 'POST' });
      if (data.matched) {
        this.roomCode = data.roomCode;
        this.seenMatchReady = true;
        this.seenResult = false;
        this.lastRoundNumber = 0;
        this.lastState = null;
        this._fire('match-ready', { roomCode: data.roomCode, opponent: data.opponent });
        this._startGamePolling();
      } else if (data.queued) {
        this._startMatchmakingPolling();
      }
    } catch (err) {
      console.error('[PollSocket] Find match error:', err);
      this._fire('error', { message: 'Failed to find match' });
    }
  }

  async _cancelFind() {
    this._stopMatchmakingPolling();
    try {
      await this._fetch('/api/game/find-match', { method: 'DELETE' });
    } catch (err) {
      console.error('[PollSocket] Cancel find error:', err);
    }
  }

  async _makeChoice({ choice }) {
    try {
      await this._fetch('/api/game/choice', {
        method: 'POST',
        body: JSON.stringify({ choice }),
      });
      // Result will be picked up by polling
    } catch (err) {
      console.error('[PollSocket] Choice error:', err);
    }
  }

  async _playAgain() {
    try {
      await this._fetch('/api/game/play-again', { method: 'POST' });
      // New round will be picked up by polling
    } catch (err) {
      console.error('[PollSocket] Play again error:', err);
    }
  }

  async _leaveRoom() {
    this._stopAllPolling();
    try {
      await this._fetch('/api/game/leave-room', { method: 'POST' });
    } catch (err) {
      console.error('[PollSocket] Leave room error:', err);
    }
    this.roomCode = null;
    this.lastState = null;
  }

  // ── Polling loops ────────────────────────────────────────────

  async _pollMatchmaking() {
    try {
      const data = await this._fetch('/api/game/matchmaking-status');
      if (data.status === 'matched') {
        this._stopMatchmakingPolling();
        this.roomCode = data.roomCode;
        this.seenMatchReady = true;
        this.seenResult = false;
        this.lastRoundNumber = 0;
        this.lastState = null;
        this._fire('match-ready', { roomCode: data.roomCode, opponent: data.opponent });
        this._startGamePolling();
      }
    } catch (err) {
      console.error('[PollSocket] Matchmaking poll error:', err);
    }
  }

  async _pollGameState() {
    if (!this.roomCode) return;
    try {
      const state = await this._fetch(`/api/game/state/${this.roomCode}`);
      this._processStateUpdate(state);
    } catch (err) {
      console.error('[PollSocket] Game state poll error:', err);
    }
  }

  _processStateUpdate(state) {
    const prev = this.lastState;
    this.lastState = state;

    // Opponent left
    if (state.opponentLeft) {
      this._stopGamePolling();
      this._fire('opponent-left', {});
      return;
    }

    // Match became ready (host created room, opponent joined)
    if (state.matchReady && !this.seenMatchReady) {
      this.seenMatchReady = true;
      this._fire('match-ready', { roomCode: state.roomCode, opponent: state.opponent });
    }

    // Opponent chose (only meaningful before result)
    if (state.opponentChose && prev && !prev.opponentChose && !state.lastResult) {
      this._fire('opponent-chose', {});
    }

    // Round result arrived
    if (state.lastResult && !this.seenResult) {
      this.seenResult = true;
      this._fire('round-result', state.lastResult);
    }

    // Opponent wants rematch
    if (state.opponentWantsRematch && prev && !prev.opponentWantsRematch) {
      this._fire('opponent-play-again', {});
    }

    // New round started (roundNumber increased)
    const currentRound = state.roundNumber || 0;
    if (currentRound > this.lastRoundNumber) {
      this.lastRoundNumber = currentRound;
      this.seenResult = false;
      this._fire('new-round', {});
    }
  }
}
