"use client";

import { SWRConfig } from 'swr';
import { authFetch } from '../../lib/api';

/**
 * SWR fetcher that uses authFetch (includes silent JWT refresh on 401).
 * This ensures all SWR data fetching is authenticated and auto-renews tokens.
 */
const authApiFetcher = async (url: string) => {
    const res = await authFetch(url);
    if (!res.ok) {
        const error: any = new Error(`API error ${res.status}`);
        error.status = res.status;
        throw error;
    }
    return res.json();
};

export function SWRProvider({ children }: { children: React.ReactNode }) {
    return (
        <SWRConfig
            value={{
                fetcher: authApiFetcher,
                revalidateOnFocus: false,
                revalidateIfStale: false,
                dedupingInterval: 60000,
                errorRetryCount: 2,
                onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
                    // Don't retry on 401 (auth errors are handled by authFetch)
                    if (error?.status === 401) return;
                    // Default retry for other errors
                    if (retryCount >= 2) return;
                    setTimeout(() => revalidate({ retryCount }), 5000);
                },
            }}
        >
            {children}
        </SWRConfig>
    );
}
