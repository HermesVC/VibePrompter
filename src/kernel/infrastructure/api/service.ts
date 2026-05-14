import { apiClient } from './client';
import type {
  ApiResponse,
  RequestOptions,
  PaginatedResponse,
  PaginationParams,
} from './types';

/**
 * Base API Service - Provides typed HTTP methods
 * 
 * Usage:
 * ```ts
 * // Create a feature-specific service
 * class UserService extends BaseApiService {
 *   constructor() {
 *     super('/users');
 *   }
 *   
 *   getUsers(params: PaginationParams) {
 *     return this.getPaginated<User>('', params);
 *   }
 *   
 *   getUser(id: string) {
 *     return this.get<User>(`/${id}`);
 *   }
 * }
 * ```
 */
export abstract class BaseApiService {
  protected basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Build full URL with base path
   */
  protected buildUrl(path: string): string {
    return `${this.basePath}${path}`;
  }

  /**
   * GET request
   */
  protected async get<T>(
    path: string,
    options?: RequestOptions
  ): Promise<T> {
    const response = await apiClient.get<T>(this.buildUrl(path), options);
    return response.data;
  }

  /**
   * GET request with API response wrapper
   */
  protected async getWithResponse<T>(
    path: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const response = await apiClient.get<ApiResponse<T>>(this.buildUrl(path), options);
    return response.data;
  }

  /**
   * GET paginated request
   */
  protected async getPaginated<T>(
    path: string,
    params: PaginationParams,
    options?: RequestOptions
  ): Promise<PaginatedResponse<T>> {
    const response = await apiClient.get<PaginatedResponse<T>>(this.buildUrl(path), {
      ...options,
      params: {
        ...params,
        ...options?.params,
      },
    });
    return response.data;
  }

  /**
   * POST request
   */
  protected async post<T, D = unknown>(
    path: string,
    data?: D,
    options?: RequestOptions
  ): Promise<T> {
    const response = await apiClient.post<T>(this.buildUrl(path), data, options);
    return response.data;
  }

  /**
   * POST request with API response wrapper
   */
  protected async postWithResponse<T, D = unknown>(
    path: string,
    data?: D,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const response = await apiClient.post<ApiResponse<T>>(this.buildUrl(path), data, options);
    return response.data;
  }

  /**
   * PUT request
   */
  protected async put<T, D = unknown>(
    path: string,
    data?: D,
    options?: RequestOptions
  ): Promise<T> {
    const response = await apiClient.put<T>(this.buildUrl(path), data, options);
    return response.data;
  }

  /**
   * PATCH request
   */
  protected async patch<T, D = unknown>(
    path: string,
    data?: D,
    options?: RequestOptions
  ): Promise<T> {
    const response = await apiClient.patch<T>(this.buildUrl(path), data, options);
    return response.data;
  }

  /**
   * DELETE request
   */
  protected async delete<T = void>(
    path: string,
    options?: RequestOptions
  ): Promise<T> {
    const response = await apiClient.delete<T>(this.buildUrl(path), options);
    return response.data;
  }

  /**
   * Upload file with multipart/form-data
   */
  protected async upload<T>(
    path: string,
    file: File | FormData,
    options?: RequestOptions
  ): Promise<T> {
    const formData = file instanceof FormData ? file : new FormData();
    if (file instanceof File) {
      formData.append('file', file);
    }

    const response = await apiClient.post<T>(this.buildUrl(path), formData, {
      ...options,
      headers: {
        ...options?.headers,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  /**
   * Download file
   */
  protected async download(
    path: string,
    filename?: string,
    options?: RequestOptions
  ): Promise<void> {
    const response = await apiClient.get(this.buildUrl(path), {
      ...options,
      responseType: 'blob',
    });

    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || this.extractFilename(response.headers) || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Extract filename from Content-Disposition header
   */
  private extractFilename(headers: Record<string, unknown>): string | null {
    const disposition = headers['content-disposition'] as string | undefined;
    if (!disposition) return null;
    
    const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    return filenameMatch ? filenameMatch[1].replace(/['"]/g, '') : null;
  }
}

// =====================
// Standalone HTTP Functions
// =====================

/**
 * Standalone GET request
 */
export async function httpGet<T>(url: string, options?: RequestOptions): Promise<T> {
  const response = await apiClient.get<T>(url, options);
  return response.data;
}

/**
 * Standalone POST request
 */
export async function httpPost<T, D = unknown>(
  url: string,
  data?: D,
  options?: RequestOptions
): Promise<T> {
  const response = await apiClient.post<T>(url, data, options);
  return response.data;
}

/**
 * Standalone PUT request
 */
export async function httpPut<T, D = unknown>(
  url: string,
  data?: D,
  options?: RequestOptions
): Promise<T> {
  const response = await apiClient.put<T>(url, data, options);
  return response.data;
}

/**
 * Standalone PATCH request
 */
export async function httpPatch<T, D = unknown>(
  url: string,
  data?: D,
  options?: RequestOptions
): Promise<T> {
  const response = await apiClient.patch<T>(url, data, options);
  return response.data;
}

/**
 * Standalone DELETE request
 */
export async function httpDelete<T = void>(url: string, options?: RequestOptions): Promise<T> {
  const response = await apiClient.delete<T>(url, options);
  return response.data;
}
