import { Link } from 'react-router-dom';
import { Button } from './Button';

/**
 * 404 Not Found Page - Pure presentational
 */
export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-2 text-9xl font-bold text-primary-500">404</h1>
      <h2 className="mb-4 text-2xl font-semibold text-secondary-900 dark:text-secondary-100">
        Page Not Found
      </h2>
      <p className="mb-8 max-w-md text-secondary-600 dark:text-secondary-400">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/">
        <Button>Go Home</Button>
      </Link>
    </div>
  );
}
