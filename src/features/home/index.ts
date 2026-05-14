// Home Feature - Public API
// Only export what other features/app layer should access

// Pages - Entry points for routing
export { HomePage } from './pages';

// Domain types - If needed by other features (rare)
export type { HomeStats, ActivityItem, QuickAction } from './domain';
