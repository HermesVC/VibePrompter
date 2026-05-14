/**
 * Environment configuration
 * Centralizes all environment-specific settings
 */
export const env = {
  /** Current environment mode */
  mode: import.meta.env.MODE,
  
  /** Is development environment */
  isDevelopment: import.meta.env.DEV,
  
  /** Is production environment */
  isProduction: import.meta.env.PROD,
  
  /** Base URL for the application */
  baseUrl: import.meta.env.BASE_URL,
  
  /** API base URL - Configure in .env file */
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  
  /** API timeout in milliseconds */
  apiTimeout: Number(import.meta.env.VITE_API_TIMEOUT) || 30000,
  
  /** App name */
  appName: import.meta.env.VITE_APP_NAME || 'My App',
  
  /** App version */
  appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
} as const;

/**
 * Feature flags
 */
export const features = {
  /** Enable debug mode (extra logging, dev tools) */
  debugMode: import.meta.env.VITE_DEBUG_MODE === 'true',
  
  /** Enable analytics tracking */
  analytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
  
  /** Enable service worker */
  serviceWorker: import.meta.env.VITE_ENABLE_SW === 'true',
} as const;

/**
 * Storage keys for localStorage/sessionStorage
 */
export const storageKeys = {
  /** Auth token storage key */
  authToken: 'auth_token',
  
  /** Refresh token storage key */
  refreshToken: 'refresh_token',
  
  /** User data storage key */
  user: 'user_data',
  
  /** Theme preference storage key */
  theme: 'app_theme',
  
  /** Locale/language preference */
  locale: 'app_locale',
} as const;

/**
 * Query cache keys for TanStack Query
 */
export const queryKeys = {
  /** User related queries */
  user: ['user'] as const,
  users: ['users'] as const,
  
  /** Auth related queries */
  auth: ['auth'] as const,
  session: ['auth', 'session'] as const,
} as const;

/**
 * Route paths
 */
export const routes = {
  home: '/',
  login: '/login',
  register: '/register',
  dashboard: '/dashboard',
  profile: '/profile',
  settings: '/settings',
  notFound: '*',
} as const;

/**
 * API endpoints
 */
export const endpoints = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    me: '/auth/me',
  },
  users: {
    list: '/users',
    byId: (id: string) => `/users/${id}`,
  },
} as const;
