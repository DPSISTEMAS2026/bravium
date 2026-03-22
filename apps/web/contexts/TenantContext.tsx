'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getApiUrl } from '../lib/api';

interface OrgBranding {
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor: string | null;
}

interface TenantContextType {
    branding: OrgBranding | null;
    slug: string | null;
    isLoading: boolean;
    error: string | null;
}

const TenantContext = createContext<TenantContextType>({
    branding: null,
    slug: null,
    isLoading: true,
    error: null,
});

/**
 * Extracts the tenant slug from the hostname.
 * Examples:
 *   bravium.dpsistemas.cl → "bravium"
 *   bravium.localhost      → "bravium"
 *   localhost              → null (no tenant)
 *   dpsistemas.cl          → null (root domain)
 */
function extractSlugFromHost(hostname: string): string | null {
    // Remove port
    const host = hostname.split(':')[0];

    // Local development: bravium.localhost → "bravium"
    if (host.endsWith('.localhost') || host.endsWith('.local')) {
        const parts = host.split('.');
        if (parts.length >= 2) return parts[0];
    }

    // localhost alone = no tenant
    if (host === 'localhost' || host === '127.0.0.1') {
        // Fallback: check query param or default for dev
        return null;
    }

    // Production: bravium.dpsistemas.cl → "bravium"
    const parts = host.split('.');
    if (parts.length >= 3) {
        return parts[0]; // subdomain
    }

    // Root domain (dpsistemas.cl) = no tenant
    return null;
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
    const [branding, setBranding] = useState<OrgBranding | null>(null);
    const [slug, setSlug] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadTenant() {
            try {
                // 1. Try subdomain first
                let tenantSlug = extractSlugFromHost(window.location.hostname);

                // 2. Fallback: check URL query param (?tenant=bravium) for local dev
                if (!tenantSlug) {
                    const params = new URLSearchParams(window.location.search);
                    tenantSlug = params.get('tenant');
                }

                // 3. Fallback: check localStorage for last used tenant
                if (!tenantSlug) {
                    tenantSlug = localStorage.getItem('dp_tenant_slug');
                }

                if (!tenantSlug) {
                    setIsLoading(false);
                    return; // No tenant = show DP Sistemas generic
                }

                setSlug(tenantSlug);

                // Fetch branding from API
                const API_URL = getApiUrl();
                const res = await fetch(`${API_URL}/organizations/branding/${tenantSlug}`);
                if (res.ok) {
                    const data = await res.json();
                    setBranding(data);
                    localStorage.setItem('dp_tenant_slug', tenantSlug);
                } else {
                    setError('Organización no encontrada');
                }
            } catch (e) {
                setError('Error al cargar organización');
            } finally {
                setIsLoading(false);
            }
        }

        loadTenant();
    }, []);

    return (
        <TenantContext.Provider value={{ branding, slug, isLoading, error }}>
            {children}
        </TenantContext.Provider>
    );
}

export const useTenant = () => useContext(TenantContext);
