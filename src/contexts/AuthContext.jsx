import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('dow_token');
    if (storedToken) {
      setToken(storedToken);
      fetch(`${API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${storedToken}` }
      })
      .then(res => {
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
           throw new Error('Invalid API response');
        }
        if (!res.ok) throw new Error('Invalid token');
        return res.json();
      })
      .then(data => {
        setUser(data);
      })
      .catch(() => {
        localStorage.removeItem('dow_token');
        setToken(null);
      })
      .finally(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const handleResponse = async (res) => {
    let data;
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      // If we got an empty response or HTML (like a 404/405 page from Vercel)
      throw new Error(`Server error (${res.status}). If deployed, check your VITE_API_URL environment variable.`);
    }
    
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const login = async (username, password) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await handleResponse(res);
      localStorage.setItem('dow_token', data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      throw new Error(err.message || 'Network error: could not reach backend');
    }
  };

  const register = async (username, password) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await handleResponse(res);
      localStorage.setItem('dow_token', data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      throw new Error(err.message || 'Network error: could not reach backend');
    }
  };

  const logout = () => {
    localStorage.removeItem('dow_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
