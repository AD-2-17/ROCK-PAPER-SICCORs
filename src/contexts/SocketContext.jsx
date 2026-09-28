import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  // Force re-render trigger when socket changes
  const [socketVersion, setSocketVersion] = useState(0);

  useEffect(() => {
    if (token) {
      // Clean up any existing socket first
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';
      const socket = io(SOCKET_URL, {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        transports: ['websocket', 'polling'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('[Socket] Connected, authenticating...');
        socket.emit('authenticate', { token });
      });

      socket.on('authenticated', (payload) => {
        if (payload && payload.success !== false) {
          setConnected(true);
          console.log('[Socket] Authenticated successfully');
        } else {
          setConnected(false);
          console.warn('[Socket] Authentication failed');
        }
      });

      socket.on('online-count', ({ count }) => {
        setOnlineCount(count);
      });

      socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        setConnected(false);
      });

      socket.on('reconnect', (attemptNumber) => {
        console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
      });

      socket.on('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err.message);
      });

      socket.connect();
      setSocketVersion(v => v + 1);

      return () => {
        socket.removeAllListeners();
        socket.disconnect();
        socketRef.current = null;
        setConnected(false);
      };
    } else {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
    }
  }, [token]);

  // Memoize context value to prevent unnecessary re-renders
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
