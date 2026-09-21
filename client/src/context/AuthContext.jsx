import { createContext, useContext, useEffect, useState } from 'react';
import * as authApi from '../api/auth';
import { TOKEN_KEY, setSessionEndHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Why the user was signed out (suspended, expired). The login page shows it once.
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .fetchMe()
      .then(setUser)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setSessionEndHandler((reason) => {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      setNotice(
        reason === 'suspended'
          ? 'Your account has been suspended. Contact an administrator if you think this is a mistake.'
          : 'Your session has ended. Please log in again.'
      );
    });
    return () => setSessionEndHandler(null);
  }, []);

  async function login(credentials) {
    const { token, user: loggedInUser } = await authApi.login(credentials);
    localStorage.setItem(TOKEN_KEY, token);
    setNotice('');
    setUser(loggedInUser);
    return loggedInUser;
  }

  async function signup(details) {
    const { token, user: newUser } = await authApi.signup(details);
    localStorage.setItem(TOKEN_KEY, token);
    setUser(newUser);
    return newUser;
  }

  async function updateProfile(details) {
    const updated = await authApi.updateProfile(details);
    setUser(updated);
    return updated;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setNotice('');
  }

  return (
    <AuthContext.Provider value={{ user, loading, notice, login, signup, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
