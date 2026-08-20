// `same-origin` resolves to an empty base (relative URLs, same host as this
// page); unset falls back to localhost:8001 for `npm run dev` against a
// local backend — the siavonga-independence-api docker-compose maps the
// Django dev server to host port 8001, not Django's usual 8000 (see that
// repo's README/docker-compose.yml).
const rawApiBase = import.meta.env.VITE_API_BASE_URL;
const API_BASE_URL =
  rawApiBase === 'same-origin'
    ? ''
    : rawApiBase
      ? rawApiBase.replace(/\/+$/, '')
      : 'http://localhost:8001';

const ACCESS_KEY = 'sir-admin-access';
const REFRESH_KEY = 'sir-admin-refresh';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return false;

  const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) return false;

  const data = await res.json();
  localStorage.setItem(ACCESS_KEY, data.access);
  return true;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  isFormData?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, isFormData = false } = options;

  async function doFetch(): Promise<Response> {
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    return fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
    });
  }

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      clearTokens();
      window.location.href = '/login';
      throw new Error('Session expired. Please log in again.');
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.detail || JSON.stringify(errorBody) || `Request failed (${res.status})`
    );
  }

  if (res.status === 204) return undefined as T;

  return res.json();
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error('Invalid email or password.');
  }

  const data = await res.json();
  setTokens(data.access, data.refresh);
  return data;
}

// Mirrors the API's UserSerializer (GET /api/v1/auth/me/). There's no
// dedicated "role" field on the backend — every admin account is
// is_staff=True, and is_superuser distinguishes a full ADMIN from a
// read-only VIEW account (see AuthContext).
export interface CurrentUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  is_superuser: boolean;
  is_staff: boolean;
}

export async function getMe(): Promise<CurrentUser> {
  return apiFetch('/api/v1/auth/me/');
}

export { API_BASE_URL };
