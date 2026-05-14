// Home Feature - Domain Layer
// Feature-specific entities and business rules

/**
 * Feature statistics for the home page
 */
export interface HomeStats {
  totalUsers: number;
  activeProjects: number;
  completedTasks: number;
  upcomingDeadlines: number;
}

/**
 * Quick action item
 */
export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  route: string;
}

/**
 * Recent activity item
 */
export interface ActivityItem {
  id: string;
  type: 'created' | 'updated' | 'deleted' | 'completed';
  description: string;
  timestamp: string;
  userId: string;
  userName: string;
}
