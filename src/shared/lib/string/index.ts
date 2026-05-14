/**
 * Capitalize the first letter of a string
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Capitalize the first letter of each word
 */
export function capitalizeWords(str: string): string {
  if (!str) return '';
  return str
    .split(' ')
    .map((word) => capitalize(word))
    .join(' ');
}

/**
 * Convert string to camelCase
 */
export function toCamelCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
      index === 0 ? letter.toLowerCase() : letter.toUpperCase()
    )
    .replace(/[\s\-_]+/g, '');
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter) => letter.toUpperCase())
    .replace(/[\s\-_]+/g, '');
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s\-]+/g, '_')
    .toLowerCase();
}

/**
 * Truncate a string to a specified length
 */
export function truncate(str: string, length: number, suffix = '...'): string {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.slice(0, length - suffix.length) + suffix;
}

/**
 * Remove extra whitespace from a string
 */
export function normalizeWhitespace(str: string): string {
  if (!str) return '';
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Check if a string is empty or only whitespace
 */
export function isBlank(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0;
}

/**
 * Check if a string is not empty and not only whitespace
 */
export function isNotBlank(str: string | null | undefined): str is string {
  return !isBlank(str);
}

/**
 * Pluralize a word based on count
 */
export function pluralize(word: string, count: number, plural?: string): string {
  if (count === 1) return word;
  return plural || `${word}s`;
}

/**
 * Format a number with word (e.g., "1 item", "2 items")
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(singular, count, plural)}`;
}

/**
 * Generate initials from a name
 */
export function getInitials(name: string, maxLength = 2): string {
  if (!name) return '';
  return name
    .split(' ')
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, maxLength);
}

/**
 * Mask a string (e.g., for sensitive data)
 */
export function mask(
  str: string,
  visibleChars = 4,
  maskChar = '*',
  position: 'start' | 'end' | 'middle' = 'end'
): string {
  if (!str || str.length <= visibleChars) return str;

  const maskLength = str.length - visibleChars;
  const maskString = maskChar.repeat(maskLength);

  switch (position) {
    case 'start':
      return str.slice(0, visibleChars) + maskString;
    case 'end':
      return maskString + str.slice(-visibleChars);
    case 'middle': {
      const half = Math.floor(visibleChars / 2);
      return str.slice(0, half) + maskString + str.slice(-half);
    }
  }
}

/**
 * Format email for display (partially masked)
 */
export function formatEmail(email: string): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  
  const maskedLocal = local.length > 2 
    ? local.slice(0, 2) + '*'.repeat(Math.min(local.length - 2, 5))
    : local;
  
  return `${maskedLocal}@${domain}`;
}

/**
 * Format phone number for display
 */
export function formatPhone(phone: string, format = '(###) ###-####'): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  let result = format;
  
  for (const digit of digits) {
    result = result.replace('#', digit);
  }
  
  // Remove remaining placeholders
  return result.replace(/#/g, '');
}

/**
 * Generate a slug from a string
 */
export function slugify(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Strip HTML tags from a string
 */
export function stripHtml(str: string): string {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * Check if a string is a valid email
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if a string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
