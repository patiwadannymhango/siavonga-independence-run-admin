import { API_BASE_URL, apiFetch } from './client';

export interface Vendor {
  id: string;
  business_name: string;
  full_name: string;
  email: string;
  phone: string;
  business_location: string;
}

export interface AdminVendorRegistration {
  id: string;
  registration_number: string | null;
  status: string;
  amount: string;
  currency: string;
  vendor: Vendor;
  category: string;
  category_name: string;
  products_services: string;
  requirement: string;
  latest_payment_reference: string | null;
  registered_at: string;
  updated_at: string;
}

export interface VendorCategory {
  id: string;
  name: string;
  code: string;
  price: string;
  currency: string;
  capacity: number | null;
}

// Matches VendorRegistration.Status on the backend — the same lifecycle
// runner registrations use (see apps/common/models.py BaseRegistration).
export const STATUS_OPTIONS = [
  'PENDING_PAYMENT',
  'PAYMENT_PROCESSING',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
];

export const REQUIREMENT_OPTIONS = [
  'Exhibition Space',
  'Vendor Stall',
  'Food & Beverage Stall',
  'Corporate Activation',
  'Branding / Promotional Space',
  'Other',
];

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export async function getVendorCategories(): Promise<VendorCategory[]> {
  return apiFetch('/api/v1/vendors/categories/');
}

export async function listVendorRegistrations(params: {
  search?: string;
  status?: string;
  category?: string;
  ordering?: string;
  page?: number;
}): Promise<Paginated<AdminVendorRegistration>> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.category) qs.set('category', params.category);
  if (params.ordering) qs.set('ordering', params.ordering);
  if (params.page) qs.set('page', String(params.page));

  return apiFetch(`/api/v1/vendors/admin/registrations/?${qs.toString()}`);
}

export async function createVendorRegistrationManually(payload: {
  category_id: string;
  business_name: string;
  full_name: string;
  email?: string;
  phone?: string;
  business_location?: string;
  products_services?: string;
  requirement?: string;
  status?: string;
}) {
  return apiFetch<AdminVendorRegistration>('/api/v1/vendors/admin/registrations/manual/', {
    method: 'POST',
    body: payload,
  });
}

// ADMIN only on the backend.
export async function updateVendorRegistrationStatus(id: string, status: string) {
  return apiFetch<AdminVendorRegistration>(`/api/v1/vendors/admin/registrations/${id}/`, {
    method: 'PATCH',
    body: { status },
  });
}

// ADMIN only on the backend.
export async function deleteVendorRegistration(id: string): Promise<void> {
  return apiFetch(`/api/v1/vendors/admin/registrations/${id}/`, { method: 'DELETE' });
}

export async function downloadVendorExport(): Promise<Blob> {
  const token = localStorage.getItem('sir-admin-access');
  const res = await fetch(`${API_BASE_URL}/api/v1/vendors/admin/registrations/export/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed.');
  return res.blob();
}
