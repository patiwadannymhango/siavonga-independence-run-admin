import { API_BASE_URL, apiFetch } from './client';

export interface Participant {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  gender: string;
  age_range: string;
  country: string;
}

export interface AdminRegistration {
  id: string;
  registration_number: string;
  status: string;
  amount: string;
  currency: string;
  participant: Participant;
  category: string;
  category_name: string;
  t_shirt_size: string;
  club_or_institution: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  medical_notes: string;
  registered_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface RaceCategory {
  id: string;
  name: string;
  code: string;
  distance_label: string;
  price: string;
  currency: string;
  capacity: number | null;
}

// Matches Registration.Status on the backend exactly (no DRAFT/RESERVED —
// this is a single-event API, not the multi-event platform the copperbelt
// dashboard was built against).
export const STATUS_OPTIONS = [
  'PENDING_PAYMENT',
  'PAYMENT_PROCESSING',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
];

export interface DashboardStats {
  total_registrations: number;
  today_count: number;
  by_status: { status: string; count: number }[];
  by_category: { category__name: string; count: number }[];
  revenue_confirmed: string;
  revenue_pending: string;
}

export async function getDashboard(): Promise<DashboardStats> {
  return apiFetch('/api/v1/admin/dashboard/');
}

export async function getCategories(): Promise<RaceCategory[]> {
  return apiFetch('/api/v1/categories/');
}

export async function listRegistrations(params: {
  search?: string;
  status?: string;
  category?: string;
  ordering?: string;
  page?: number;
}): Promise<Paginated<AdminRegistration>> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.category) qs.set('category', params.category);
  if (params.ordering) qs.set('ordering', params.ordering);
  if (params.page) qs.set('page', String(params.page));

  return apiFetch(`/api/v1/admin/registrations/?${qs.toString()}`);
}

export async function createRegistrationManually(payload: {
  category_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  gender?: string;
  age_range?: string;
  country?: string;
  t_shirt_size?: string;
  club_or_institution?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  medical_notes?: string;
  status?: string;
}) {
  return apiFetch<AdminRegistration>('/api/v1/admin/registrations/manual/', {
    method: 'POST',
    body: payload,
  });
}

// ADMIN only on the backend — a VIEW-role account gets a 403 here even if
// the button were somehow reachable client-side.
export async function updateRegistrationStatus(id: string, status: string) {
  return apiFetch<AdminRegistration>(`/api/v1/admin/registrations/${id}/`, {
    method: 'PATCH',
    body: { status },
  });
}

// ADMIN only on the backend — see IsSuperUserAdmin in the API's
// AdminRegistrationDetailView.
export async function deleteRegistration(id: string): Promise<void> {
  return apiFetch(`/api/v1/admin/registrations/${id}/`, { method: 'DELETE' });
}

// The export endpoint requires the same Bearer auth as everything else, so
// it can't just be an <a href> like a public download link — fetched as a
// blob and saved client-side instead (see Registrations.tsx).
export async function downloadExport(): Promise<Blob> {
  const token = localStorage.getItem('sir-admin-access');
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/registrations/export/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed.');
  return res.blob();
}
