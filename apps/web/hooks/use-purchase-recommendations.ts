'use client';

import { useState, useEffect } from 'react';
import { getApiUrl } from '../lib/api';

// Define the Interface based on the Controller's return signature
export interface Recommendation {
    id: string;
    productName: string;
    currentProvider: string;
    currentPrice: number;
    recommendedPrice: number;
    savingPct: number;
    confidenceScore: number;
    explanation: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'IGNORED';
}

export function usePurchaseRecommendations() {
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const API_URL = getApiUrl();

    // Function to load data
    const fetchRecommendations = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_URL}/purchase-intelligence/recommendations?status=PENDING`);
            if (!res.ok) throw new Error('Error loading recommendations');
            const data = await res.json();
            setRecommendations(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Initial Load
    useEffect(() => {
        fetchRecommendations();
    }, []);

    // Action Handler: Accept / Ignore
    const handleAction = async (id: string, action: 'ACCEPT' | 'REJECT' | 'IGNORE') => {
        try {
            // Optimistic Update: Remove from UI immediately
            setRecommendations(prev => prev.filter(r => r.id !== id));

            const res = await fetch(`${API_URL}/purchase-intelligence/recommendations/${id}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });

            if (!res.ok) throw new Error('Action failed');
        } catch (err) {
            console.error(err);
            // Rollback? Or just Toast error.
            alert('Hubo un error al procesar tu acción.');
            fetchRecommendations(); // Re-fetch to sync
        }
    };

    return {
        recommendations,
        isLoading,
        error,
        refresh: fetchRecommendations,
        onAccept: (id: string) => handleAction(id, 'ACCEPT'),
        onIgnore: (id: string) => handleAction(id, 'IGNORE'),
    };
}
