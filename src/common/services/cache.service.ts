import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

@Injectable()
export class CacheService {
    private readonly logger = new Logger(CacheService.name);
    private readonly store = new Map<string, CacheEntry<any>>();

    get<T>(key: string): T | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.data as T;
    }

    set<T>(key: string, data: T, ttlMs: number): void {
        this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
    }

    async getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
        const cached = this.get<T>(key);
        if (cached !== null) return cached;
        const data = await fetcher();
        this.set(key, data, ttlMs);
        return data;
    }

    invalidate(pattern?: string): void {
        if (!pattern) {
            this.store.clear();
            return;
        }
        for (const key of this.store.keys()) {
            if (key.includes(pattern)) this.store.delete(key);
        }
    }
}
