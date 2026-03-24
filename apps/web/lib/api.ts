/** Backend API en puerto 3000. Frontend en 3001. No se usa 8000. */
const API_BASE = 'http://localhost:3000';

/**
 * URL base del backend (Nest). Siempre 3000 en este proyecto.
 * - Backend: npm run start:dev → http://localhost:3000
 * - Frontend: npm run dev → http://localhost:3001
 */
export function getApiUrl() {
  const env = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL;
  const url = (env && env.trim() !== '') ? env.trim() : API_BASE;
  if (url.includes(':8000') || !url.startsWith('http')) return API_BASE;
  return url.replace(/\/$/, "");
}

export const apiFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
};

/**
 * Fetch con autenticación JWT.
 * Lee el token de localStorage y lo envía como Bearer token.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('bravium_token') : null;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

export type ConciliacionDashboard = {
  period: { from: string; to: string };
  summary: {
    transactions: {
      total: number;
      matched: number;
      pending: number;
      match_rate: string;
      total_amount: number;
    };
    dtes: {
      total: number;
      paid: number;
      unpaid: number;
      partially_paid: number;
      payment_rate: string;
      total_amount: number;
      outstanding_amount: number;
    };
    matches: {
      total: number;
      confirmed: number;
      draft: number;
      automatic: number;
      manual: number;
      auto_rate: string;
    };
  };
  pending: {
    transactions: Array<{
      id: string;
      date: string;
      amount: number;
      description: string;
      reference: string | null;
      type: 'CREDIT' | 'DEBIT';
      bankAccount?: { accountNumber: string; bankName: string } | null;
    }>;
    dtes: Array<{
      id: string;
      folio: number;
      type: number;
      totalAmount: number;
      outstandingAmount: number;
      issuedDate: string;
      rutIssuer: string;
      provider?: { name: string; rut: string } | null;
    }>;
  };
  recent_matches: Array<{
    id: string;
    status: 'CONFIRMED' | 'DRAFT';
    origin: 'AUTOMATIC' | 'MANUAL';
    confidence: number;
    ruleApplied: string;
    createdAt: string;
    transaction: { date: string; amount: number; description: string };
    dte?: { folio: number; type: number; totalAmount: number; provider?: { name: string } | null } | null;
    payment?: { amount: number; paymentDate: string; provider?: { name: string } | null } | null;
  }>;
  insights: {
    top_providers: Array<{
      provider: { id: string; name: string; rut: string };
      total_outstanding: number;
      total_amount: number;
      dte_count: number;
    }>;
    high_value_unmatched: {
      transactions: Array<{ id: string; date: string; amount: number; description: string; type: 'CREDIT' | 'DEBIT' }>;
      dtes: Array<{ id: string; folio: number; type: number; outstandingAmount: number; issuedDate: string; provider?: { name: string } | null }>;
    };
  };
};

export async function fetchConciliacionDashboard(params: {
  fromDate: string;
  toDate: string;
}): Promise<ConciliacionDashboard> {
  const url = new URL('/conciliacion/dashboard', getApiUrl());
  url.searchParams.set('fromDate', params.fromDate);
  url.searchParams.set('toDate', params.toDate);

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Error ${res.status} al cargar conciliación. ${body}`.trim());
  }
  return res.json();
}

