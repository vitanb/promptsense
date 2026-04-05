import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [orgs, setOrgs]       = useState([]);
  const [loading, setLoading] = useState(true);

  const saveSession = useCallback((data) => {
    localStorage.setItem('ps_access_token',  data.accessToken);
    localStorage.setItem('ps_refresh_token', data.refreshToken);
    setUser(data.user);
    setOrgs(data.orgs || []);
    if (data.orgs?.[0]) localStorage.setItem('ps_org_id', data.orgs[0].org_id);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem('ps_access_token');
    localStorage.removeItem('ps_refresh_token');
    localStorage.removeItem('ps_org_id');
    setUser(null); setOrgs([]);
  }, []);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('ps_access_token');
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(data => { setUser(data.user); setOrgs(data.orgs || []); })
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, [clearSession]);

  const login = async (email, password) => {
    const data = await authApi.login({ email, password });
    saveSession(data);
    return data;
  };

  const register = async (form) => {
    const data = await authApi.register(form);
    saveSession(data);
    return data;
  };

  const logout = async () => {
    await authApi.logout().catch(() => {});
    clearSession();
  };

  const deleteAccount = async (password) => {
    await authApi.deleteAccount(password);
    clearSession();
  };

  return (
    <AuthContext.Provider value={{ user, orgs, loading, login, register, logout, deleteAccount, setOrgs }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
