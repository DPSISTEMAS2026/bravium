/** Base API logic. Fallback to current host if environment variable is missing. */
const API_BASE = 'https://bravium-backend.onrender.com'; // Fallback production URL

/**
 * URL base del backend (Nest).
 */
export function getApiUrl() {
  const env = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL;
  const url = (env && env.trim() !== '') ? env.trim() : API_BASE;
  if (url.includes(':8000') || !url.startsWith('http')) return API_BASE;
  return url.replace(/\/$/, "");
}

export const apiFetcher = async (url: string) => {
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
};

// ─── Silent Token Refresh System ─────────────────────────────────────
// Prevents multiple simultaneous refresh requests (mutex pattern)
let refreshPromise: Promise<boolean> | null = null;

/**
 * Attempts to refresh the access token using the stored refresh_token.
 * Returns true if successful, false otherwise.
 */
async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = typeof window !== 'undefined'
    ? localStorage.getItem('bravium_refresh_token')
    : null;

  if (!refreshToken) return false;

  try {
    const res = await fetch(`${getApiUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    if (data.access_token && data.refresh_token) {
      localStorage.setItem('bravium_token', data.access_token);
      localStorage.setItem('bravium_refresh_token', data.refresh_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Force logout: clears tokens and redirects to login.
 * Called when refresh token is also expired (after 7 days of inactivity).
 */
function forceLogout() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('bravium_token');
  localStorage.removeItem('bravium_refresh_token');
  localStorage.removeItem('bravium_user');
  // Only redirect if not already on login page
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login?expired=1';
  }
}

/**
 * Fetch con autenticación JWT y auto-refresh silencioso.
 * - Envía el access_token como Bearer.
 * - Si el server responde 401, intenta renovar el token con el refresh_token.
 * - Si la renovación funciona, reintenta la petición original (transparente para el usuario).
 * - Si la renovación falla, redirige al login.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('bravium_token') : null;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  // If 401, try silent refresh
  if (res.status === 401 && typeof window !== 'undefined') {
    // Use mutex to avoid multiple parallel refresh requests
    if (!refreshPromise) {
      refreshPromise = tryRefreshToken().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;

    if (refreshed) {
      // Retry original request with new token
      const newToken = localStorage.getItem('bravium_token');
      const retryHeaders: Record<string, string> = {
        ...(options.headers as Record<string, string> || {}),
      };
      if (newToken) {
        retryHeaders['Authorization'] = `Bearer ${newToken}`;
      }
      return fetch(url, { ...options, headers: retryHeaders });
    } else {
      // Refresh failed → force logout
      forceLogout();
      return res;
    }
  }

  return res;
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

  const res = await authFetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Error ${res.status} al cargar conciliación. ${body}`.trim());
  }
  return res.json();
}

