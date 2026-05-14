import { BaseApiService, apiClientFactory } from '@kernel/infrastructure';
import type { User, AuthTokens } from '@kernel/domain';

/**
 * Login request payload
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Register request payload
 */
export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * Auth response from API
 */
export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

/**
 * Auth API Service - Handles authentication endpoints
 * 
 * Example usage:
 * ```ts
 * const result = await authApi.login({ email, password });
 * dispatch(loginSuccess(result));
 * ```
 */
class AuthApiService extends BaseApiService {
  constructor() {
    super('/auth');
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    return this.post<AuthResponse>('/login', credentials);
  }

  /**
   * Register new user
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    return this.post<AuthResponse>('/register', data);
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<User> {
    return this.get<User>('/me');
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    return this.post<{ accessToken: string }>('/refresh', { refreshToken });
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    return this.post<void>('/logout');
  }

  /**
   * Request password reset
   */
  async forgotPassword(email: string): Promise<void> {
    return this.post<void>('/forgot-password', { email });
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    return this.post<void>('/reset-password', { token, newPassword });
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<void> {
    return this.post<void>('/verify-email', { token });
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.post<void>('/change-password', { currentPassword, newPassword });
  }
}

// Create singleton instance
export const authApi = new AuthApiService();

/**
 * Configure API client with auth token getters
 * Call this during app initialization
 */
export function configureAuthInterceptors(
  getToken: () => string | null,
  refreshToken: () => Promise<string | null>,
  onLogout: () => void
): void {
  apiClientFactory.setTokenGetter(getToken);
  apiClientFactory.setTokenRefresher(refreshToken);
  apiClientFactory.setLogoutCallback(onLogout);
}
