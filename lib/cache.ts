/**
 * Simple in-memory cache with TTL support
 * Helps reduce database quota usage by caching frequently accessed data
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
  hits: number;
  created: number;
}

class Cache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries = 1000;
  private readonly defaultTTL = 300; // 5 minutes
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  /**
   * Get cached value if it exists and hasn't expired
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }

    // Cache hit
    entry.hits++;
    this.stats.hits++;
    return entry.data as T;
  }

  /**
   * Set cached value with optional TTL (in seconds)
   */
  set<T>(key: string, data: T, ttlSeconds: number = this.defaultTTL): void {
    // Evict oldest entry if cache is full
    if (this.store.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.store.set(key, {
      data,
      expiry: Date.now() + ttlSeconds * 1000,
      hits: 0,
      created: Date.now(),
    });
  }

  /**
   * Delete specific cache entry
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Invalidate cache by pattern (e.g., "dashboard-*")
   */
  invalidatePattern(pattern: string): number {
    const regex = new RegExp(pattern);
    let count = 0;

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : "0.00";

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.store.size,
      maxEntries: this.maxEntries,
      memory: `${(this.store.size * 0.001).toFixed(2)} KB (est)`,
    };
  }

  /**
   * Evict the oldest entry (by creation time)
   */
  private evictOldest(): void {
    let oldest: { key: string; created: number } | null = null;

    for (const [key, entry] of this.store.entries()) {
      if (!oldest || entry.created < oldest.created) {
        oldest = { key, created: entry.created };
      }
    }

    if (oldest) {
      this.store.delete(oldest.key);
      this.stats.evictions++;
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }
}

// Export singleton instance
export const cache = new Cache();

/**
 * Helper to wrap async functions with caching
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  // Try to get from cache
  const cached = cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  const data = await fn();

  // Cache the result
  cache.set(key, data, ttlSeconds);

  return data;
}

/**
 * Get cache statistics endpoint
 */
export function getCacheStatus() {
  return {
    timestamp: new Date().toISOString(),
    stats: cache.getStats(),
  };
}
