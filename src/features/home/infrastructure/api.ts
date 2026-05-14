import { BaseApiService } from '@kernel/infrastructure';
import type { HomeStats, ActivityItem } from '../domain';

/**
 * Home API Service - Demonstrates the BaseApiService pattern
 * 
 * Features:
 * - Automatic retry on failure
 * - Auth token injection
 * - Type-safe requests/responses
 */
class HomeApiService extends BaseApiService {
  constructor() {
    super('/home');
  }

  /**
   * Get dashboard statistics
   */
  async getStats(): Promise<HomeStats> {
    return this.get<HomeStats>('/stats');
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(limit = 10): Promise<ActivityItem[]> {
    return this.get<ActivityItem[]>('/activity', {
      params: { limit },
    });
  }
}

// Export singleton instance
export const homeApi = new HomeApiService();
