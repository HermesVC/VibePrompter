import {
  format,
  formatDistance,
  formatRelative,
  parseISO,
  isValid,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInSeconds,
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addYears,
  subDays,
  subHours,
  subMinutes,
  subMonths,
  subYears,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isBefore,
  isAfter,
  isSameDay,
  isSameMonth,
  isSameYear,
  isToday,
  isTomorrow,
  isYesterday,
  isPast,
  isFuture,
} from 'date-fns';

// Re-export date-fns functions for convenience
export {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addYears,
  subDays,
  subHours,
  subMinutes,
  subMonths,
  subYears,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isBefore,
  isAfter,
  isSameDay,
  isSameMonth,
  isSameYear,
  isToday,
  isTomorrow,
  isYesterday,
  isPast,
  isFuture,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInSeconds,
};

/**
 * Common date format patterns
 */
export const DateFormat = {
  /** 2024-01-15 */
  ISO_DATE: 'yyyy-MM-dd',
  /** 01/15/2024 */
  US_DATE: 'MM/dd/yyyy',
  /** 15/01/2024 */
  EU_DATE: 'dd/MM/yyyy',
  /** January 15, 2024 */
  LONG_DATE: 'MMMM d, yyyy',
  /** Jan 15, 2024 */
  MEDIUM_DATE: 'MMM d, yyyy',
  /** 15 Jan 2024 */
  SHORT_DATE: 'd MMM yyyy',
  /** 2024-01-15T10:30:00 */
  ISO_DATETIME: "yyyy-MM-dd'T'HH:mm:ss",
  /** January 15, 2024 at 10:30 AM */
  LONG_DATETIME: "MMMM d, yyyy 'at' h:mm a",
  /** Jan 15, 2024 10:30 AM */
  MEDIUM_DATETIME: 'MMM d, yyyy h:mm a',
  /** 10:30 AM */
  TIME: 'h:mm a',
  /** 10:30:45 AM */
  TIME_WITH_SECONDS: 'h:mm:ss a',
  /** 10:30 */
  TIME_24H: 'HH:mm',
  /** Monday */
  DAY_NAME: 'EEEE',
  /** Mon */
  DAY_NAME_SHORT: 'EEE',
  /** January */
  MONTH_NAME: 'MMMM',
  /** Jan */
  MONTH_NAME_SHORT: 'MMM',
} as const;

/**
 * Parse a date string to Date object
 */
export function parseDate(dateString: string | Date | null | undefined): Date | null {
  if (!dateString) return null;
  if (dateString instanceof Date) return isValid(dateString) ? dateString : null;
  
  const parsed = parseISO(dateString);
  return isValid(parsed) ? parsed : null;
}

/**
 * Format a date with a pattern
 */
export function formatDate(
  date: Date | string | null | undefined,
  pattern: string = DateFormat.MEDIUM_DATE
): string {
  const parsed = parseDate(date);
  if (!parsed) return '';
  return format(parsed, pattern);
}

/**
 * Format a date as ISO string (YYYY-MM-DD)
 */
export function toISODateString(date: Date | string | null | undefined): string {
  return formatDate(date, DateFormat.ISO_DATE);
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(
  date: Date | string | null | undefined,
  baseDate: Date = new Date()
): string {
  const parsed = parseDate(date);
  if (!parsed) return '';
  return formatDistance(parsed, baseDate, { addSuffix: true });
}

/**
 * Format a date relative to today (e.g., "yesterday at 5:00 PM")
 */
export function formatRelativeDate(
  date: Date | string | null | undefined,
  baseDate: Date = new Date()
): string {
  const parsed = parseDate(date);
  if (!parsed) return '';
  return formatRelative(parsed, baseDate);
}

/**
 * Get a human-readable duration string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

  return parts.join(' ');
}

/**
 * Check if a date is valid
 */
export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && isValid(date);
}

/**
 * Get the start and end of a date range
 */
export function getDateRange(
  range: 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'thisYear',
  baseDate: Date = new Date()
): { start: Date; end: Date } {
  switch (range) {
    case 'today':
      return { start: startOfDay(baseDate), end: endOfDay(baseDate) };
    case 'yesterday': {
      const yesterday = subDays(baseDate, 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    }
    case 'thisWeek':
      return { start: startOfWeek(baseDate), end: endOfWeek(baseDate) };
    case 'thisMonth':
      return { start: startOfMonth(baseDate), end: endOfMonth(baseDate) };
    case 'thisYear':
      return { start: startOfYear(baseDate), end: endOfYear(baseDate) };
  }
}

/**
 * Calculate age from birth date
 */
export function calculateAge(birthDate: Date | string | null | undefined): number | null {
  const parsed = parseDate(birthDate);
  if (!parsed) return null;

  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const monthDiff = today.getMonth() - parsed.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsed.getDate())) {
    age--;
  }

  return age;
}
