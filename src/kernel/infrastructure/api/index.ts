// API Infrastructure - HTTP client, services, and types
export * from './types';
export { apiClient, apiClientFactory } from './client';
export {
  BaseApiService,
  httpGet,
  httpPost,
  httpPut,
  httpPatch,
  httpDelete,
} from './service';
export { authApi, configureAuthInterceptors } from './auth.service';
export type { LoginRequest, RegisterRequest, AuthResponse } from './auth.service';
