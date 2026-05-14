import type { ActivityItem } from '../domain';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui';
import { dateUtils } from '@shared/lib';
import { cn } from '@shared/lib';

interface ActivityFeedProps {
  activities: ActivityItem[];
  className?: string;
}

/**
 * Activity type badge colors
 */
const activityTypeColors: Record<ActivityItem['type'], string> = {
  created: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  updated: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  deleted: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  completed: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
};

/**
 * Activity Feed - Displays recent activity items
 */
export function ActivityFeed({ activities, className }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No recent activity
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {activities.map((activity) => (
            <li
              key={activity.id}
              className="flex items-start gap-3 pb-4 border-b border-gray-200 dark:border-gray-700 last:border-0 last:pb-0"
            >
              <span
                className={cn(
                  'px-2 py-1 text-xs font-medium rounded capitalize',
                  activityTypeColors[activity.type]
                )}
              >
                {activity.type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {activity.description}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {activity.userName} • {dateUtils.formatRelativeTime(activity.timestamp)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
