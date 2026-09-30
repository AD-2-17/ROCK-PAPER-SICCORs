import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import PollSocket from '../services/PollSocket';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [socketVersion, setSocketVersion] = useState(0);

  useEffect(() => {
    if (token) {
      // Clean up any existing socket
      if (socketRef.current) {
        if (socketRef.current.removeAllListeners) socketRef.current.removeAllListeners();
        if (socketRef.current.disconnect) socketRef.current.disconnect();
        socketRef.current = null;
      }

      // Try WebSocket first, fall back to PollSocket for serverless environments
      const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';
      
      const realSocket = io(SOCKET_URL, {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 3,    // Only 3 attempts before giving up
        reconnectionDelay: 1000,
        timeout: 5000,              // 5s timeout
        transports: ['websocket', 'polling'],
      });

      let settled = false;
      let fallbackTimer = null;

      const useSocket = (sock) => {
        if (!settled) {
          settled = true;
          clearTimeout(fallbackTimer);
          socketRef.current = sock;
          setSocketVersion(v => v + 1);
        }
      };

      // Set up real socket handlers
      realSocket.on('connect', () => {
        console.log('[Socket] WebSocket connected/reconnected');
        useSocket(realSocket);
        realSocket.emit('authenticate', { token });
      });

      realSocket.on('authenticated', (payload) => {
        if (payload && payload.success !== false) {
          setConnected(true);
          console.log('[Socket] Authenticated via WebSocket');
        }
      });

      realSocket.on('online-count', ({ count }) => {
        setOnlineCount(count);
      });

      realSocket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        setConnected(false);
      });

      realSocket.on('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err.message);
        // If we haven't settled yet, fall back to polling
        if (!settled) {
          console.log('[Socket] WebSocket failed, switching to PollSocket (REST polling)');
          settled = true;
          clearTimeout(fallbackTimer);
          realSocket.removeAllListeners();
          realSocket.disconnect();

          const poll = new PollSocket();
          socketRef.current = poll;
          setSocketVersion(v => v + 1);

          poll.on('authenticated', (payload) => {
            if (payload && payload.success !== false) {
              setConnected(true);
              console.log('[Socket] Authenticated via PollSocket');
            }
          });
          poll.on('online-count', ({ count }) => {
            setOnlineCount(count);
          });

          poll.emit('authenticate', { token });
        }
      });

      // Fallback timer: if WebSocket doesn't connect within 4 seconds, use PollSocket
      fallbackTimer = setTimeout(() => {
        if (!settled) {
          console.log('[Socket] WebSocket timeout, switching to PollSocket');
          settled = true;
          realSocket.removeAllListeners();
          realSocket.disconnect();

          const poll = new PollSocket();
          socketRef.current = poll;
          setSocketVersion(v => v + 1);

          poll.on('authenticated', (payload) => {
            if (payload && payload.success !== false) {
              setConnected(true);
              console.log('[Socket] Authenticated via PollSocket');
            }
          });
          poll.on('online-count', ({ count }) => {
            setOnlineCount(count);
          });

          poll.emit('authenticate', { token });
        }
      }, 4000);

      realSocket.connect();

      return () => {
        settled = true;
        clearTimeout(fallbackTimer);
        if (socketRef.current) {
          if (socketRef.current.removeAllListeners) socketRef.current.removeAllListeners();
          if (socketRef.current.disconnect) socketRef.current.disconnect();
          socketRef.current = null;
        } else {
          realSocket.removeAllListeners();
          realSocket.disconnect();
        }
        setConnected(false);
      };
    } else {
      if (socketRef.current) {
        if (socketRef.current.removeAllListeners) socketRef.current.removeAllListeners();
        if (socketRef.current.disconnect) socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
    }
  }, [token]);

  const contextValue = React.useMemo(() => ({
    socket: socketRef.current,
    connected,
    onlineCount
  }), [connected, onlineCount, socketVersion]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
