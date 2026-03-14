"use client";

import { SWRConfig } from 'swr';
import { apiFetcher } from '../../lib/api';

export function SWRProvider({ children }: { children: React.ReactNode }) {
    return (
        <SWRConfig
            value={{
                fetcher: apiFetcher,
                revalidateOnFocus: false,
                revalidateIfStale: false,
                dedupingInterval: 60000,
                errorRetryCount: 2,
            }}
        >
            {children}
        </SWRConfig>
    );
}
