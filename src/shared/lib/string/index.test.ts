import { describe, it, expect } from 'vitest';
import {
  capitalize,
  capitalizeWords,
  toCamelCase,
  toPascalCase,
  toKebabCase,
  toSnakeCase,
  truncate,
  isBlank,
  isNotBlank,
  pluralize,
  formatCount,
  getInitials,
  slugify,
  isValidEmail,
  isValidUrl,
} from './index';

describe('capitalize', () => {
  it('should capitalize first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('HELLO')).toBe('HELLO');
  });

  it('should handle empty string', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('capitalizeWords', () => {
  it('should capitalize each word', () => {
    expect(capitalizeWords('hello world')).toBe('Hello World');
  });
});

describe('case conversions', () => {
  it('toCamelCase', () => {
    expect(toCamelCase('hello world')).toBe('helloWorld');
    expect(toCamelCase('Hello-World')).toBe('helloWorld');
  });

  it('toPascalCase', () => {
    expect(toPascalCase('hello world')).toBe('HelloWorld');
  });

  it('toKebabCase', () => {
    expect(toKebabCase('helloWorld')).toBe('hello-world');
    expect(toKebabCase('Hello World')).toBe('hello-world');
  });

  it('toSnakeCase', () => {
    expect(toSnakeCase('helloWorld')).toBe('hello_world');
  });
});

describe('truncate', () => {
  it('should truncate long strings', () => {
    expect(truncate('Hello, World!', 8)).toBe('Hello...');
  });

  it('should not truncate short strings', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
  });
});

describe('isBlank / isNotBlank', () => {
  it('should detect blank strings', () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank('')).toBe(true);
    expect(isBlank('   ')).toBe(true);
    expect(isBlank('hello')).toBe(false);
  });

  it('should detect non-blank strings', () => {
    expect(isNotBlank('hello')).toBe(true);
    expect(isNotBlank('')).toBe(false);
  });
});

describe('pluralize / formatCount', () => {
  it('should pluralize correctly', () => {
    expect(pluralize('item', 1)).toBe('item');
    expect(pluralize('item', 2)).toBe('items');
    expect(pluralize('child', 2, 'children')).toBe('children');
  });

  it('should format count with word', () => {
    expect(formatCount(1, 'item')).toBe('1 item');
    expect(formatCount(5, 'item')).toBe('5 items');
  });
});

describe('getInitials', () => {
  it('should get initials from name', () => {
    expect(getInitials('John Doe')).toBe('JD');
    expect(getInitials('Alice')).toBe('A');
    expect(getInitials('John Middle Doe', 2)).toBe('JM');
  });
});

describe('slugify', () => {
  it('should create URL-friendly slug', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  Multiple   Spaces  ')).toBe('multiple-spaces');
  });
});

describe('validation', () => {
  it('should validate email', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('should validate URL', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('not-a-url')).toBe(false);
  });
});
