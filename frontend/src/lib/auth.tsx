// Authentication context. Holds the current session (token, role, name),
// persists it to localStorage, and exposes login/logout helpers.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { JwtPayload, LoginResponse, Role } from '../types';
import { clearToken, getToken, setToken, setUnauthorizedHandler } from './api';

const NAME_KEY = 'hireinsight_name';
const ROLE_KEY = 'hireinsight_role';

interface Session {
  token: string;
  role: Role;
  name: string;
}

interface AuthContextValue {
  token: string | null;
  role: Role | null;
  name: string | null;
  isAuthenticated: boolean;
  login: (res: LoginResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Decode a JWT payload without verifying the signature (display/expiry only).
function decodeJwt(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  return payload.exp * 1000 <= Date.now();
}

function loadSession(): Session | null {
  const token = getToken();
  if (!token || isExpired(token)) {
    return null;
  }
  const role = (localStorage.getItem(ROLE_KEY) as Role | null) ?? null;
  const name = localStorage.getItem(NAME_KEY);
  if (!role || !name) {
    // Fall back to JWT payload role if cached values are missing.
    const payload = decodeJwt(token);
    if (!payload) return null;
    return { token, role: payload.role, name: name ?? '' };
  }
  return { token, role, name };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  // If the stored token is expired/invalid, clear it on mount.
  useEffect(() => {
    if (!session) {
      clearToken();
      localStorage.removeItem(NAME_KEY);
      localStorage.removeItem(ROLE_KEY);
    }
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: session?.token ?? null,
      role: session?.role ?? null,
      name: session?.name ?? null,
      isAuthenticated: !!session,
      login: (res: LoginResponse) => {
        setToken(res.token);
        localStorage.setItem(NAME_KEY, res.name);
        localStorage.setItem(ROLE_KEY, res.role);
        setSession({ token: res.token, role: res.role, name: res.name });
      },
      logout: () => {
        clearToken();
        localStorage.removeItem(NAME_KEY);
        localStorage.removeItem(ROLE_KEY);
        setSession(null);
      },
    }),
    [session]
  );

  // Register logout as the global 401 handler so the API client can clear the
  // session and force a re-login on any expired/invalid token (see api.ts).
  useEffect(() => {
    setUnauthorizedHandler(value.logout);
    return () => setUnauthorizedHandler(null);
  }, [value.logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
