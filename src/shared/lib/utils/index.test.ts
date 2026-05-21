import { describe, it, expect } from 'vitest';
import {
  cn,
  generateId,
  isEmpty,
  debounce,
  throttle,
  safeJsonParse,
  deepClone,
} from './index';

describe('cn (classnames utility)', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    const inactive = false;
    const active = true;
    expect(cn('foo', inactive && 'bar', 'baz')).toBe('foo baz');
    expect(cn('foo', active && 'bar', 'baz')).toBe('foo bar baz');
  });

  it('should merge tailwind classes correctly', () => {
    expect(cn('px-4', 'px-2')).toBe('px-2');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });
});

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should use provided prefix', () => {
    const id = generateId('test');
    expect(id.startsWith('test-')).toBe(true);
  });
});

describe('isEmpty', () => {
  it('should return true for null and undefined', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });

  it('should return true for empty string', () => {
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('   ')).toBe(true);
  });

  it('should return true for empty array', () => {
    expect(isEmpty([])).toBe(true);
  });

  it('should return true for empty object', () => {
    expect(isEmpty({})).toBe(true);
  });

  it('should return false for non-empty values', () => {
    expect(isEmpty('hello')).toBe(false);
    expect(isEmpty([1, 2, 3])).toBe(false);
    expect(isEmpty({ a: 1 })).toBe(false);
  });
});

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    const result = safeJsonParse('{"a": 1}', {});
    expect(result).toEqual({ a: 1 });
  });

  it('should return fallback for invalid JSON', () => {
    const result = safeJsonParse('invalid', { default: true });
    expect(result).toEqual({ default: true });
  });
});

describe('deepClone', () => {
  it('should create a deep copy', () => {
    const original = { a: 1, b: { c: 2 } };
    const clone = deepClone(original);
    
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.b).not.toBe(original.b);
  });
});

describe('debounce', () => {
  it('should delay function execution', async () => {
    let count = 0;
    const fn = debounce(() => count++, 50);
    
    fn();
    fn();
    fn();
    
    expect(count).toBe(0);
    
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(count).toBe(1);
  });
});

describe('throttle', () => {
  it('should limit function execution rate', async () => {
    let count = 0;
    const fn = throttle(() => count++, 50);
    
    fn();
    fn();
    fn();
    
    expect(count).toBe(1);
    
    await new Promise((resolve) => setTimeout(resolve, 100));
    fn();
    expect(count).toBe(2);
  });
});
