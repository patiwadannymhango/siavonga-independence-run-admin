import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  createVendorRegistrationManually,
  deleteVendorRegistration,
  downloadVendorExport,
  getVendorCategories,
  listVendorRegistrations,
  updateVendorRegistrationStatus,
  REQUIREMENT_OPTIONS,
  STATUS_OPTIONS,
  type AdminVendorRegistration,
  type VendorCategory,
} from '../api/vendors';

const PAGE_SIZE = 25;
const REFRESH_INTERVAL_MS = 30000;

function titleCase(value?: string) {
  if (!value) return '';
  return value
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(value.includes('-') ? '-' : ' ');
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function registrationStatusLabel(status: string): 'Confirmed' | 'Unconfirmed' | 'Exempted' {
  if (status === 'CONFIRMED') return 'Confirmed';
  if (status === 'CANCELLED' || status === 'EXPIRED' || status === 'REFUNDED') return 'Exempted';
  return 'Unconfirmed';
}

export default function Vendors() {
  const { logout, role, isAdmin } = useAuth();

  const [now, setNow] = useState(new Date());
  const [categories, setCategories] = useState<VendorCategory[]>([]);

  const [rows, setRows] = useState<AdminVendorRegistration[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addForm, setAddForm] = useState({
    business_name: '',
    full_name: '',
    email: '',
    phone: '',
    business_location: '',
    category_id: '',
    products_services: '',
    requirement: '',
    status: 'CONFIRMED',
  });
  const [exportBusy, setExportBusy] = useState(false);

  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminVendorRegistration | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      setError('');
      listVendorRegistrations({
        search,
        status: statusFilter,
        category: categoryFilter,
        ordering: '-registered_at',
        page,
      })
        .then((data) => {
          setRows(data.results);
          setCount(data.count);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load vendor registrations.'))
        .finally(() => setLoading(false));
    },
    [search, statusFilter, categoryFilter, page]
  );

  useEffect(load, [load]);

  useEffect(() => {
    getVendorCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const poll = setInterval(() => load(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [load]);

  function handleRefresh() {
    load();
  }

  async function handleAddVendor() {
    setAddBusy(true);
    setError('');
    try {
      await createVendorRegistrationManually(addForm);
      setNotice(`${addForm.business_name} registered.`);
      setAddOpen(false);
      setAddForm({
        business_name: '',
        full_name: '',
        email: '',
        phone: '',
        business_location: '',
        category_id: '',
        products_services: '',
        requirement: '',
        status: 'CONFIRMED',
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register vendor.');
    } finally {
      setAddBusy(false);
    }
  }

  async function handleExport() {
    setExportBusy(true);
    setError('');
    try {
      const blob = await downloadVendorExport();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'siavonga-independence-run-vendor-registrations.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExportBusy(false);
    }
  }

  async function handleStatusChange(registration: AdminVendorRegistration, newStatus: string) {
    if (newStatus === registration.status) return;
    setStatusBusyId(registration.id);
    setError('');
    try {
      await updateVendorRegistrationStatus(registration.id, newStatus);
      setNotice(`${registration.vendor.business_name}'s status updated to ${titleCase(newStatus)}.`);
      load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setStatusBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError('');
    try {
      await deleteVendorRegistration(deleteTarget.id);
      setNotice('Vendor registration deleted.');
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete registration.');
    } finally {
      setDeleteBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="page">
      <div className="header">
        <div className="header-left">
          <img src="/logo.svg" alt="" className="logo-badge" aria-hidden="true" />
          <div className="header-title">
            <p className="eyebrow">SIAVONGA INDEPENDENCE RUN 2026</p>
            <h1>Vendors</h1>
          </div>
          <nav className="nav-tabs">
            <NavLink to="/" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`} end>
              Registrations
            </NavLink>
            <NavLink to="/vendors" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>
              Vendors
            </NavLink>
          </nav>
        </div>
        <div className="header-right">
          {role && <span className={`role-badge ${role === 'ADMIN' ? 'role-admin' : ''}`}>{role}</span>}
          <span className="live-indicator">
            <span className="live-dot" />
            Live · {formatTime(now)}
          </span>
          <button className="btn" onClick={handleRefresh}>
            ↻ Refresh
          </button>
          {isAdmin && (
            <button className="btn btn-success" onClick={() => setAddOpen(true)}>
              + Add Vendor
            </button>
          )}
          <button className="btn btn-amber" onClick={handleExport} disabled={exportBusy}>
            {exportBusy ? 'Exporting…' : '↓ Export Excel'}
          </button>
          <button className="btn" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {notice && <div className="banner banner-success">{notice}</div>}

      <div className="filters-row">
        <input
          className="filter-input"
          placeholder="Search business, contact, email, phone, reference…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="filters-count">{count} vendor registrations</span>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table className="reg-table">
            <thead>
              <tr>
                <th>•</th>
                <th>Reference</th>
                <th>Business</th>
                <th>Contact</th>
                <th>Category</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Requirement</th>
                <th>Amount</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="dim">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td className={r.registration_number ? '' : 'dim'}>{r.registration_number || 'Not yet assigned'}</td>
                  <td className="name">{r.vendor.business_name}</td>
                  <td>{r.vendor.full_name}</td>
                  <td>{r.category_name}</td>
                  <td className={r.vendor.phone ? '' : 'dim'}>{r.vendor.phone || '—'}</td>
                  <td className={r.vendor.email ? '' : 'dim'}>{r.vendor.email || '—'}</td>
                  <td className={r.requirement ? '' : 'dim'}>{r.requirement || '—'}</td>
                  <td className="dim">
                    {r.currency} {Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    {isAdmin ? (
                      <select
                        className="status-select"
                        value={r.status}
                        disabled={statusBusyId === r.id}
                        onChange={(e) => handleStatusChange(r, e.target.value)}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {titleCase(s)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`status-badge status-${r.status}`}>{registrationStatusLabel(r.status)}</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn-danger" onClick={() => setDeleteTarget(r)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="loading-state">Loading…</div>}
          {!loading && rows.length === 0 && <div className="empty-state">No vendor registrations match these filters.</div>}
        </div>

        <div className="table-footer">
          <button className="page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            ‹
          </button>
          <span className="filters-count">
            Page {page} of {totalPages}
          </span>
          <button
            className="page-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            ›
          </button>
        </div>
      </div>

      {addOpen && (
        <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Add vendor</h2>
            <div className="field">
              <label>Business / company name</label>
              <input
                value={addForm.business_name}
                onChange={(e) => setAddForm({ ...addForm, business_name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Contact person</label>
              <input value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Business location</label>
              <input
                value={addForm.business_location}
                onChange={(e) => setAddForm({ ...addForm, business_location: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Vendor category</label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={addForm.category_id}
                onChange={(e) => setAddForm({ ...addForm, category_id: e.target.value })}
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Requirement</label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={addForm.requirement}
                onChange={(e) => setAddForm({ ...addForm, requirement: e.target.value })}
              >
                <option value="">Select…</option>
                {REQUIREMENT_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Products / services</label>
              <textarea
                rows={3}
                value={addForm.products_services}
                onChange={(e) => setAddForm({ ...addForm, products_services: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Status</label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={addForm.status}
                onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={handleAddVendor}
                disabled={addBusy || !addForm.business_name || !addForm.full_name || !addForm.category_id}
              >
                {addBusy ? 'Saving…' : 'Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => !deleteBusy && setDeleteTarget(null)}>
          <div className="modal-card modal-card-sm" onClick={(e) => e.stopPropagation()}>
            <h2>Delete vendor registration?</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 12.5, marginBottom: 20 }}>
              This permanently removes {deleteTarget.vendor.business_name}'s registration (
              {deleteTarget.registration_number ?? 'unconfirmed'}). This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
