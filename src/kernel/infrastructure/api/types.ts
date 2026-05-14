import type { AxiosRequestConfig } from 'axios';

/**
 * API Configuration - Centralized settings for HTTP client
 */
export interface ApiConfig {
  /** Base URL for all API requests */
  baseURL: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Default headers for all requests */
  headers: Record<string, string>;
  /** Retry configuration */
  retry: RetryConfig;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Number of retry attempts */
  retries: number;
  /** Delay between retries in milliseconds */
  retryDelay: number;
  /** HTTP status codes to retry on */
  retryCondition: number[];
  /** Whether to use exponential backoff */
  exponentialBackoff: boolean;
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
  success: boolean;
}

/**
 * API Error structure
 */
export interface ApiError {
  message: string;
  code?: string;
  status: number;
  errors?: Record<string, string[]>;
  timestamp?: string;
}

/**
 * Paginated request parameters
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

/**
 * Request options extending Axios config
 */
export interface RequestOptions extends Omit<AxiosRequestConfig, 'url' | 'method'> {
  /** Skip authentication header */
  skipAuth?: boolean;
  /** Custom retry config for this request */
  retry?: Partial<RetryConfig>;
  /** Cache control */
  cache?: 'no-cache' | 'force-cache' | 'default';
}

/**
 * Default API configuration
 */
export const defaultApiConfig: ApiConfig = {
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: Number(import.meta.env.VITE_API_TIMEOUT) || 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  retry: {
    retries: 3,
    retryDelay: 1000,
    retryCondition: [408, 429, 500, 502, 503, 504],
    exponentialBackoff: true,
  },
};
