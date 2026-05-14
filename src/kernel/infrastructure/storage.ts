/**
 * Local storage wrapper with type safety and error handling
 */
export const localStorage = {
  /**
   * Get item from localStorage
   */
  get<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : fallback;
    } catch {
      console.warn(`Error reading localStorage key "${key}"`);
      return fallback;
    }
  },

  /**
   * Set item in localStorage
   */
  set<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      console.warn(`Error setting localStorage key "${key}"`);
    }
  },

  /**
   * Remove item from localStorage
   */
  remove(key: string): void {
    if (typeof window === 'undefined') return;
    
    try {
      window.localStorage.removeItem(key);
    } catch {
      console.warn(`Error removing localStorage key "${key}"`);
    }
  },

  /**
   * Clear all items from localStorage
   */
  clear(): void {
    if (typeof window === 'undefined') return;
    
    try {
      window.localStorage.clear();
    } catch {
      console.warn('Error clearing localStorage');
    }
  },
};

/**
 * Session storage wrapper with type safety and error handling
 */
export const sessionStorage = {
  /**
   * Get item from sessionStorage
   */
  get<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : fallback;
    } catch {
      console.warn(`Error reading sessionStorage key "${key}"`);
      return fallback;
    }
  },

  /**
   * Set item in sessionStorage
   */
  set<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      console.warn(`Error setting sessionStorage key "${key}"`);
    }
  },

  /**
   * Remove item from sessionStorage
   */
  remove(key: string): void {
    if (typeof window === 'undefined') return;
    
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      console.warn(`Error removing sessionStorage key "${key}"`);
    }
  },

  /**
   * Clear all items from sessionStorage
   */
  clear(): void {
    if (typeof window === 'undefined') return;
    
    try {
      window.sessionStorage.clear();
    } catch {
      console.warn('Error clearing sessionStorage');
    }
  },
};
