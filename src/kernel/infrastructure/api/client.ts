import axios, {
  type AxiosInstance,
  type AxiosError,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from 'axios';
import axiosRetry from 'axios-retry';
import { defaultApiConfig, type ApiConfig, type ApiError } from './types';

/**
 * Token getter function type
 */
type TokenGetter = () => string | null;

/**
 * Token refresh function type
 */
type TokenRefresher = () => Promise<string | null>;

/**
 * Logout callback type
 */
type LogoutCallback = () => void;

/**
 * API Client Factory - Creates configured Axios instances
 */
class ApiClientFactory {
  private static instance: ApiClientFactory;
  private client: AxiosInstance;
  private config: ApiConfig;
  private tokenGetter: TokenGetter = () => null;
  private tokenRefresher: TokenRefresher | null = null;
  private logoutCallback: LogoutCallback | null = null;
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];
  private customHeaders: Map<string, string> = new Map();

  private constructor(config: ApiConfig = defaultApiConfig) {
    this.config = config;
    this.client = this.createClient();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: ApiConfig): ApiClientFactory {
    if (!ApiClientFactory.instance) {
      ApiClientFactory.instance = new ApiClientFactory(config);
    }
    return ApiClientFactory.instance;
  }

  /**
   * Create configured Axios instance
   */
  private createClient(): AxiosInstance {
    const instance = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: this.config.headers,
    });

    // Configure retry logic
    axiosRetry(instance, {
      retries: this.config.retry.retries,
      retryDelay: (retryCount) => {
        if (this.config.retry.exponentialBackoff) {
          return Math.pow(2, retryCount) * this.config.retry.retryDelay;
        }
        return this.config.retry.retryDelay;
      },
      retryCondition: (error: AxiosError) => {
        const status = error.response?.status;
        if (!status) return true; // Network error
        return this.config.retry.retryCondition.includes(status);
      },
      onRetry: (retryCount, error) => {
        console.warn(`[API] Retry attempt ${retryCount} for ${error.config?.url}`);
      },
    });

    // Request interceptor
    instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => this.handleRequest(config),
      (error: AxiosError) => Promise.reject(error)
    );

    // Response interceptor
    instance.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: AxiosError<ApiError>) => this.handleResponseError(error)
    );

    return instance;
  }

  /**
   * Handle outgoing request
   */
  private handleRequest(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    // Add auth token
    const token = this.tokenGetter();
    if (token && !config.headers.get('Authorization')) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }

    // Add custom headers
    this.customHeaders.forEach((value, key) => {
      if (!config.headers.get(key)) {
        config.headers.set(key, value);
      }
    });

    // Add request timestamp for debugging
    if (import.meta.env.DEV) {
      config.headers.set('X-Request-Time', new Date().toISOString());
    }

    return config;
  }

  /**
   * Handle response errors
   */
  private async handleResponseError(error: AxiosError<ApiError>): Promise<never> {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (this.tokenRefresher) {
        return this.handleTokenRefresh(originalRequest) as Promise<never>;
      } else {
        this.handleLogout();
      }
    }

    // Transform error to consistent format
    const apiError: ApiError = {
      message: error.response?.data?.message || error.message || 'An unexpected error occurred',
      code: error.response?.data?.code || error.code,
      status: error.response?.status || 0,
      errors: error.response?.data?.errors,
      timestamp: new Date().toISOString(),
    };

    return Promise.reject(apiError);
  }

  /**
   * Handle token refresh
   */
  private async handleTokenRefresh(
    originalRequest: InternalAxiosRequestConfig & { _retry?: boolean }
  ): Promise<AxiosResponse> {
    if (this.isRefreshing) {
      // Wait for refresh to complete
      return new Promise((resolve) => {
        this.refreshSubscribers.push((token: string) => {
          originalRequest.headers.set('Authorization', `Bearer ${token}`);
          resolve(this.client(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    this.isRefreshing = true;

    try {
      const newToken = await this.tokenRefresher!();
      if (newToken) {
        // Notify all waiting requests
        this.refreshSubscribers.forEach((callback) => callback(newToken));
        this.refreshSubscribers = [];
        
        originalRequest.headers.set('Authorization', `Bearer ${newToken}`);
        return this.client(originalRequest);
      } else {
        this.handleLogout();
        throw new Error('Token refresh failed');
      }
    } catch (refreshError) {
      this.handleLogout();
      throw refreshError;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Handle logout
   */
  private handleLogout(): void {
    if (this.logoutCallback) {
      this.logoutCallback();
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  // =====================
  // Public Configuration Methods
  // =====================

  /**
   * Set token getter function
   */
  public setTokenGetter(getter: TokenGetter): void {
    this.tokenGetter = getter;
  }

  /**
   * Set token refresh function
   */
  public setTokenRefresher(refresher: TokenRefresher): void {
    this.tokenRefresher = refresher;
  }

  /**
   * Set logout callback
   */
  public setLogoutCallback(callback: LogoutCallback): void {
    this.logoutCallback = callback;
  }

  /**
   * Add a custom header to all requests
   */
  public addHeader(key: string, value: string): void {
    this.customHeaders.set(key, value);
  }

  /**
   * Remove a custom header
   */
  public removeHeader(key: string): void {
    this.customHeaders.delete(key);
  }

  /**
   * Clear all custom headers
   */
  public clearHeaders(): void {
    this.customHeaders.clear();
  }

  /**
   * Update base URL
   */
  public setBaseURL(url: string): void {
    this.config.baseURL = url;
    this.client.defaults.baseURL = url;
  }

  /**
   * Update timeout
   */
  public setTimeout(timeout: number): void {
    this.config.timeout = timeout;
    this.client.defaults.timeout = timeout;
  }

  /**
   * Get the Axios instance
   */
  public getClient(): AxiosInstance {
    return this.client;
  }
}

// Export singleton instance
export const apiClientFactory = ApiClientFactory.getInstance();
export const apiClient = apiClientFactory.getClient();
