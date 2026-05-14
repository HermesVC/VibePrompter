import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui';
import { cn } from '@shared/lib';

interface WelcomeCardProps {
  userName: string;
  className?: string;
}

/**
 * Welcome Card - Greeting card for the home page
 */
export function WelcomeCard({ userName, className }: WelcomeCardProps) {
  const greeting = getGreeting();

  return (
    <Card className={cn('bg-gradient-to-r from-primary-500 to-primary-600 text-white', className)}>
      <CardHeader>
        <CardTitle className="text-white">{greeting}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-white">{userName}</p>
        <p className="text-primary-100 mt-2">
          Welcome back! Here's what's happening with your projects today.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Get greeting based on time of day
 */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}
