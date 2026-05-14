import type { HomeStats } from '../domain';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui';
import { cn } from '@shared/lib';

interface StatsCardProps {
  stats: HomeStats;
  className?: string;
}

/**
 * Stats Card - Displays home statistics
 */
export function StatsCard({ stats, className }: StatsCardProps) {
  const items = [
    { label: 'Total Users', value: stats.totalUsers, color: 'text-blue-600' },
    { label: 'Active Projects', value: stats.activeProjects, color: 'text-green-600' },
    { label: 'Completed Tasks', value: stats.completedTasks, color: 'text-purple-600' },
    { label: 'Upcoming Deadlines', value: stats.upcomingDeadlines, color: 'text-orange-600' },
  ];

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4', className)}>
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn('text-3xl font-bold', item.color)}>
              {item.value.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
