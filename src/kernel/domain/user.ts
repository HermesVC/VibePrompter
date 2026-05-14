/**
 * User entity - Core domain model
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  role: UserRole;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * User roles - Using const object for compatibility with verbatimModuleSyntax
 */
export const UserRole = {
  User: 'user',
  Admin: 'admin',
  SuperAdmin: 'super_admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * Authentication tokens
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

/**
 * Session - Combines user and auth state
 */
export interface Session {
  user: User;
  tokens: AuthTokens;
}

/**
 * Check if user has a specific role
 */
export function hasRole(user: User | null, role: UserRole): boolean {
  if (!user) return false;
  return user.role === role;
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(user: User | null, roles: UserRole[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

/**
 * Check if user is admin or higher
 */
export function isAdmin(user: User | null): boolean {
  return hasAnyRole(user, [UserRole.Admin, UserRole.SuperAdmin]);
}

/**
 * Get user's full name
 */
export function getFullName(user: User | null): string {
  if (!user) return '';
  return `${user.firstName} ${user.lastName}`.trim();
}

/**
 * Get user's initials
 */
export function getUserInitials(user: User | null): string {
  if (!user) return '';
  const first = user.firstName?.charAt(0) || '';
  const last = user.lastName?.charAt(0) || '';
  return `${first}${last}`.toUpperCase();
}
