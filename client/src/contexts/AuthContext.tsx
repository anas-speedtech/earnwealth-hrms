import { useState, useCallback, useEffect, ReactNode, createContext, useContext } from 'react';
import { authService } from '../services/auth.service';

export interface User {
  id: string;
  email: string;
  role: 'SUPER_ADMIN' | 'HR_ADMIN' | 'EMPLOYEE';
  profile: Record<string, unknown>;
}

const SESSION_KEY = 'ews_session';

// Marks this browser as holding an active session. localStorage is shared across
// tabs, so a second tab cannot silently create a second session for the same user.
const LOCK_KEY = 'ews_session_lock';

// Set when a session is ended by idle timeout, so the login page can explain why.
export const IDLE_REASON_KEY = 'ews_idle_reason';

// Sessions idle for longer than this are logged out automatically.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

interface SessionData {
  user: User;
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
}

function getSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

function setSession(session: SessionData): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (role: string, email: string, accessToken: string, refreshToken: string) => Promise<void>;
  fetchProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getSession()?.user ?? null);
  const [token, setToken] = useState<string | null>(() => getSession()?.accessToken ?? null);
  const [isLoading, setIsLoading] = useState(false);

  const isAuthenticated = !!user && !!token;

  const login = useCallback(async (role: string, email: string, accessToken: string, refreshToken: string) => {
    const refreshTokenId = extractTokenId(refreshToken);
    const session: SessionData = {
      user: { id: '', email, role: role as User['role'], profile: {} },
      accessToken,
      refreshToken,
      refreshTokenId,
    };
    setSession(session);
    // Claim the device lock for this user.
    localStorage.setItem(LOCK_KEY, email);
    setToken(accessToken);
    setUser(session.user);
  }, []);

  const fetchProfile = useCallback(async () => {
    const session = getSession();
    if (!session) return;

    setIsLoading(true);
    try {
      const profile = await authService.getProfile();
      const updatedUser: User = {
        id: profile.id,
        email: profile.email,
        role: profile.role as User['role'],
        profile: profile.profile ?? {},
      };
      const updatedSession: SessionData = {
        ...session,
        user: updatedUser,
      };
      setSession(updatedSession);
      setUser(updatedUser);
    } catch {
      clearSession();
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const session = getSession();
    try {
      if (session?.refreshToken) {
        await authService.logout(session.refreshToken);
      }
    } catch {
      // Best-effort
    } finally {
      clearSession();
      localStorage.removeItem(LOCK_KEY);
      setUser(null);
      setToken(null);
    }
  }, []);

  // Refresh session on mount if we have token but no user id
  useEffect(() => {
    const session = getSession();
    if (session && session.accessToken && !session.user.id) {
      fetchProfile();
    }
  }, [fetchProfile]);

  // Idle timeout — log out after 30 minutes without interaction.
  useEffect(() => {
    if (!isAuthenticated) return;

    let timer: number | undefined;

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        clearSession();
        localStorage.removeItem(LOCK_KEY);
        setUser(null);
        setToken(null);
        sessionStorage.setItem(IDLE_REASON_KEY, 'Your session expired after 30 minutes of inactivity.');
      }, IDLE_TIMEOUT_MS);
    };

    const onActivity = () => schedule();

    const events: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, onActivity));

    schedule();

    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [isAuthenticated]);

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    fetchProfile,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

function extractTokenId(refreshToken: string): string {
  try {
    const payload = JSON.parse(atob(refreshToken.split('.')[1]));
    return payload.tokenId || '';
  } catch {
    return '';
  }
}
