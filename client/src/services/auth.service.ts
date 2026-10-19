import api from './api';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface ProfileResponse {
  id: string;
  email: string;
  role: string;
  profile: Record<string, unknown>;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/login', credentials);
    return data;
  },

  async getProfile(): Promise<ProfileResponse> {
    const { data } = await api.get<ProfileResponse>('/auth/me');
    return data;
  },

  async refresh(tokenId: string, refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const { data } = await api.post('/auth/refresh', { tokenId, refreshToken });
    return data;
  },

  async logout(refreshToken: string): Promise<void> {
    await api.post('/auth/logout', { refreshToken });
  },
};

export const passwordService = {
  async requestReset(email: string): Promise<{ message: string }> {
    const { data } = await api.post('/auth/password/request', { email });
    return data;
  },

  async verifyOtp(email: string, otp: string): Promise<{ verifyToken: string }> {
    const { data } = await api.post('/auth/password/verify', { email, otp });
    return data;
  },
  async reset(verifyToken: string, password: string): Promise<{ message: string }> {
    const { data } = await api.post('/auth/password/reset', { verifyToken, password });
    return data;
  },
};
