'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

export type CartolaIngestionStep = 'uploading' | 'matching' | 'done' | 'error';

interface CartolaIngestionState {
    active: boolean;
    fileName: string | null;
    step: CartolaIngestionStep | null;
    errorMessage: string | null;
    insertedRows?: number;
}

interface CartolaIngestionContextType extends CartolaIngestionState {
    startIngestion: (fileName: string) => void;
    setStep: (step: CartolaIngestionStep) => void;
    setResult: (opts: { insertedRows?: number; errorMessage?: string }) => void;
    finishIngestion: () => void;
    dismissBar: () => void;
}

const CartolaIngestionContext = createContext<CartolaIngestionContextType | undefined>(undefined);

export function CartolaIngestionProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<CartolaIngestionState>({
        active: false,
        fileName: null,
        step: null,
        errorMessage: null,
    });

    const startIngestion = useCallback((fileName: string) => {
        setState({
            active: true,
            fileName,
            step: 'uploading',
            errorMessage: null,
        });
    }, []);

    const setStep = useCallback((step: CartolaIngestionStep) => {
        setState((prev) => (prev.active ? { ...prev, step, errorMessage: step === 'error' ? prev.errorMessage : null } : prev));
    }, []);

    const setResult = useCallback((opts: { insertedRows?: number; errorMessage?: string }) => {
        setState((prev) => (prev.active ? { ...prev, ...opts } : prev));
    }, []);

    const finishIngestion = useCallback(() => {
        setState((prev) => ({ ...prev, active: false, fileName: null, step: null, errorMessage: null }));
    }, []);

    const dismissBar = useCallback(() => {
        setState({ active: false, fileName: null, step: null, errorMessage: null });
    }, []);

    return (
        <CartolaIngestionContext.Provider
            value={{
                ...state,
                startIngestion,
                setStep,
                setResult,
                finishIngestion,
                dismissBar,
            }}
        >
            {children}
        </CartolaIngestionContext.Provider>
    );
}

export function useCartolaIngestion() {
    const ctx = useContext(CartolaIngestionContext);
    if (ctx === undefined) throw new Error('useCartolaIngestion must be used within CartolaIngestionProvider');
    return ctx;
}
