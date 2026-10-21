import axios from 'axios';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../utils/constants';
import { authService } from './auth.service';

const SESSION_KEY = 'ews_session';

function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function updateSession(accessToken: string, refreshToken: string): void {
  const session = getSession();
  if (!session) return;
  session.accessToken = accessToken;
  session.refreshToken = refreshToken;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const session = getSession();
    if (session?.accessToken) {
      config.headers.Authorization = `Bearer ${session.accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

let isRefreshing = false;
let pendingRequests: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Don't try to refresh on login or refresh endpoint itself
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh')) {
        clearSession();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          pendingRequests.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      isRefreshing = true;

      try {
        const session = getSession();
        if (!session?.refreshToken || !session?.refreshTokenId) {
          throw new Error('No refresh token available');
        }

        const { accessToken, refreshToken: newRefreshToken } = await authService.refresh(
          session.refreshTokenId,
          session.refreshToken,
        );

        updateSession(accessToken, newRefreshToken);

        // Resolve all pending requests
        pendingRequests.forEach(({ resolve }) => resolve(accessToken));
        pendingRequests = [];

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        pendingRequests.forEach(({ reject }) => reject(new Error('Session expired')));
        pendingRequests = [];
        clearSession();
        // A revoked refresh token means this session was ended elsewhere — most
        // often a newer login for the same account. Say so on the login page
        // rather than silently dropping the user there.
        const reason = error.response?.data?.error?.message;
        if (reason === 'Invalid or expired refresh token.') {
          sessionStorage.setItem(
            'ews_session_ended',
            'You were signed out because your account was signed in somewhere else.',
          );
        }
        window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // Prefer the most specific server-side error message. Zod validation
    // failures carry per-field issues in `validationErrors`; fall back to the
    // top-level `error.message`, then to the axios message.
    const body = error.response?.data?.error;
    const validationIssues: Array<{ field: string; message: string }> | undefined =
      body?.validationErrors;
    const message =
      (validationIssues && validationIssues.length
        ? validationIssues.map((v) => `${v.field}: ${v.message}`).join(' ')
        : body?.message) ||
      error.message ||
      'An error occurred';

    if (error.response?.status !== 429 && error.response?.status !== 401) {
      toast.error(message);
    }

    return Promise.reject(error);
  },
);

export default api;
