import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  clearTokens,
  getMe,
  isAuthenticated as checkAuth,
  login as loginApi,
} from '../api/client';

export type Role = 'ADMIN' | 'VIEW';

interface AuthContextValue {
  authenticated: boolean;
  role: Role | null;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(checkAuth());
  const [role, setRole] = useState<Role | null>(null);

  // is_superuser accounts are full ADMIN; every other signed-in account
  // (created without the "superuser" checkbox — see AdminUserCreateView
  // on the API) is a read-only VIEW account.
  useEffect(() => {
    if (!authenticated) {
      setRole(null);
      return;
    }
    getMe()
      .then((me) => setRole(me.is_superuser ? 'ADMIN' : 'VIEW'))
      .catch(() => setRole(null));
  }, [authenticated]);

  async function login(email: string, password: string) {
    await loginApi(email, password);
    setAuthenticated(true);
  }

  function logout() {
    clearTokens();
    setAuthenticated(false);
    setRole(null);
  }

  return (
    <AuthContext.Provider value={{ authenticated, role, isAdmin: role === 'ADMIN', login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
