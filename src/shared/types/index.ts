/**
 * Common API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * API error response
 */
export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  errors?: Record<string, string[]>;
}

/**
 * Base entity with common fields
 */
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Auditable entity with user tracking
 */
export interface AuditableEntity extends BaseEntity {
  createdBy?: string;
  updatedBy?: string;
}

/**
 * Soft-deletable entity
 */
export interface SoftDeletableEntity extends BaseEntity {
  deletedAt?: string | null;
  isDeleted: boolean;
}

/**
 * Option type for select/dropdown components
 */
export interface SelectOption<T = string> {
  label: string;
  value: T;
  disabled?: boolean;
  description?: string;
}

/**
 * Key-value pair
 */
export interface KeyValue<K = string, V = unknown> {
  key: K;
  value: V;
}

/**
 * Nullable type helper
 */
export type Nullable<T> = T | null;

/**
 * Optional type helper
 */
export type Optional<T> = T | undefined;

/**
 * Make all properties optional and nullable
 */
export type NullablePartial<T> = {
  [P in keyof T]?: T[P] | null;
};

/**
 * Make specific properties required
 */
export type RequiredProps<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Make specific properties optional
 */
export type OptionalProps<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Extract the resolved type from a Promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Function type with arguments and return type
 */
export type Fn<TArgs extends unknown[] = unknown[], TReturn = void> = (
  ...args: TArgs
) => TReturn;

/**
 * Async function type
 */
export type AsyncFn<TArgs extends unknown[] = unknown[], TReturn = void> = (
  ...args: TArgs
) => Promise<TReturn>;

/**
 * Dictionary type
 */
export type Dictionary<T = unknown> = Record<string, T>;

/**
 * Status type for async operations
 */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a success result
 */
export function success<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create a failure result
 */
export function failure<E>(error: E): Result<never, E> {
  return { success: false, error };
}
