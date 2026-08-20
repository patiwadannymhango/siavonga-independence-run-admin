import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  createRegistrationManually,
  deleteRegistration,
  downloadExport,
  getCategories,
  getDashboard,
  listRegistrations,
  updateRegistrationStatus,
  STATUS_OPTIONS,
  type AdminRegistration,
  type DashboardStats,
  type RaceCategory,
} from '../api/registrations';

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

// Matches the public registration form's exact field options/values, so an
// admin-entered registration validates the same way a public one does.
const GENDER_OPTIONS = ['male', 'female'];
const AGE_RANGE_OPTIONS = ['Under 18', '18-29', '30-39', '40-49', '50-59', '60+'];
const TSHIRT_SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];

// Collapses the backend's 6 statuses down to the 3 buckets the admin cares
// about at a glance.
function registrationStatusLabel(status: string): 'Confirmed' | 'Unconfirmed' | 'Exempted' {
  if (status === 'CONFIRMED') return 'Confirmed';
  if (status === 'CANCELLED' || status === 'EXPIRED' || status === 'REFUNDED') return 'Exempted';
  return 'Unconfirmed';
}

export default function Registrations() {
  const { logout, role, isAdmin } = useAuth();

  const [now, setNow] = useState(new Date());
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [categories, setCategories] = useState<RaceCategory[]>([]);

  const [rows, setRows] = useState<AdminRegistration[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [raceFilter, setRaceFilter] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addForm, setAddForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    category_id: '',
    gender: '',
    age_range: '',
    country: '',
    t_shirt_size: '',
    club_or_institution: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    medical_notes: '',
    status: 'CONFIRMED',
  });
  const [exportBusy, setExportBusy] = useState(false);

  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRegistration | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      setError('');
      listRegistrations({
        search,
        status: statusFilter,
        category: raceFilter,
        ordering: '-registered_at',
        page,
      })
        .then((data) => {
          setRows(data.results);
          setCount(data.count);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load registrations.'))
        .finally(() => setLoading(false));
    },
    [search, statusFilter, raceFilter, page]
  );

  function loadStats() {
    getDashboard()
      .then(setStats)
      .catch(() => {});
  }

  useEffect(load, [load]);
  useEffect(loadStats, []);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      load(true);
      loadStats();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [load]);

  function handleRefresh() {
    load();
    loadStats();
  }

  function statusCount(status: string) {
    return stats?.by_status.find((s) => s.status === status)?.count ?? 0;
  }

  const pendingCount = statusCount('PENDING_PAYMENT') + statusCount('PAYMENT_PROCESSING');

  async function handleAddPerson() {
    setAddBusy(true);
    setError('');
    try {
      await createRegistrationManually({
        category_id: addForm.category_id,
        full_name: addForm.full_name,
        email: addForm.email,
        phone: addForm.phone,
        gender: addForm.gender,
        age_range: addForm.age_range,
        country: addForm.country,
        t_shirt_size: addForm.t_shirt_size,
        club_or_institution: addForm.club_or_institution,
        emergency_contact_name: addForm.emergency_contact_name,
        emergency_contact_phone: addForm.emergency_contact_phone,
        medical_notes: addForm.medical_notes,
        status: addForm.status,
      });
      setNotice('Person registered.');
      setAddOpen(false);
      setAddForm({
        full_name: '',
        email: '',
        phone: '',
        category_id: '',
        gender: '',
        age_range: '',
        country: '',
        t_shirt_size: '',
        club_or_institution: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        medical_notes: '',
        status: 'CONFIRMED',
      });
      load();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register person.');
    } finally {
      setAddBusy(false);
    }
  }

  async function handleExport() {
    setExportBusy(true);
    setError('');
    try {
      const blob = await downloadExport();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'siavonga-independence-run-registrations.xlsx';
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

  async function handleStatusChange(registration: AdminRegistration, newStatus: string) {
    if (newStatus === registration.status) return;
    setStatusBusyId(registration.id);
    setError('');
    try {
      await updateRegistrationStatus(registration.id, newStatus);
      setNotice(`${registration.participant.full_name}'s status updated to ${titleCase(newStatus)}.`);
      load(true);
      loadStats();
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
      await deleteRegistration(deleteTarget.id);
      setNotice('Registration deleted.');
      setDeleteTarget(null);
      load();
      loadStats();
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
            <h1>Registrations</h1>
          </div>
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
          <button className="btn btn-success" onClick={() => setAddOpen(true)}>
            + Add Person
          </button>
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

      {stats && (
        <div className="stats-row">
          <div className="stat-card">
            <p className="stat-label">TOTAL</p>
            <p className="stat-value">{stats.total_registrations}</p>
            <p className="stat-sub">registrations</p>
          </div>
          <div className="stat-card paid">
            <p className="stat-label">PAID</p>
            <p className="stat-value">{statusCount('CONFIRMED')}</p>
            <p className="stat-sub">confirmed</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">AWAITING CONFIRMATION</p>
            <p className="stat-value">{pendingCount}</p>
            <p className="stat-sub">pending / processing</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">TODAY</p>
            <p className="stat-value">{stats.today_count}</p>
            <p className="stat-sub">new today</p>
          </div>
        </div>
      )}

      <div className="filters-row">
        <input
          className="filter-input"
          placeholder="Search name, email, phone, reference…"
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
          value={raceFilter}
          onChange={(e) => {
            setRaceFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All races</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="filters-count">
          {count} of {stats?.total_registrations ?? count}
        </span>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table className="reg-table">
            <thead>
              <tr>
                <th>•</th>
                <th>Reference</th>
                <th>Name</th>
                <th>Organisation</th>
                <th>Race</th>
                <th>Gender</th>
                <th>Age</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Shirt</th>
                <th>Amount</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="dim">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td>{r.registration_number}</td>
                  <td className="name">{r.participant.full_name}</td>
                  <td className={r.club_or_institution ? '' : 'dim'}>{r.club_or_institution || '—'}</td>
                  <td>{r.category_name}</td>
                  <td className={r.participant.gender ? '' : 'dim'}>
                    {titleCase(r.participant.gender) || '—'}
                  </td>
                  <td className={r.participant.age_range ? '' : 'dim'}>{r.participant.age_range || '—'}</td>
                  <td className={r.participant.phone ? '' : 'dim'}>{r.participant.phone || '—'}</td>
                  <td className={r.participant.email ? '' : 'dim'}>{r.participant.email || '—'}</td>
                  <td className={r.t_shirt_size ? '' : 'dim'}>{r.t_shirt_size || '—'}</td>
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
                      <span className={`status-badge status-${r.status}`}>
                        {registrationStatusLabel(r.status)}
                      </span>
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
          {!loading && rows.length === 0 && <div className="empty-state">No registrations match these filters.</div>}
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
            <h2>Add person</h2>
            <div className="field">
              <label>Full name</label>
              <input
                value={addForm.full_name}
                onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
              />
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
              <label>Race</label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={addForm.category_id}
                onChange={(e) => setAddForm({ ...addForm, category_id: e.target.value })}
              >
                <option value="">Select a race…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
            <div className="field">
              <label>Gender</label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={addForm.gender}
                onChange={(e) => setAddForm({ ...addForm, gender: e.target.value })}
              >
                <option value="">Select…</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {titleCase(g)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Age range</label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={addForm.age_range}
                onChange={(e) => setAddForm({ ...addForm, age_range: e.target.value })}
              >
                <option value="">Select…</option>
                {AGE_RANGE_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Country</label>
              <input
                value={addForm.country}
                placeholder="Zambia"
                onChange={(e) => setAddForm({ ...addForm, country: e.target.value })}
              />
            </div>
            <div className="field">
              <label>T-shirt size</label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={addForm.t_shirt_size}
                onChange={(e) => setAddForm({ ...addForm, t_shirt_size: e.target.value })}
              >
                <option value="">Select…</option>
                {TSHIRT_SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Club / institution</label>
              <input
                value={addForm.club_or_institution}
                onChange={(e) => setAddForm({ ...addForm, club_or_institution: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Emergency contact name</label>
              <input
                value={addForm.emergency_contact_name}
                onChange={(e) => setAddForm({ ...addForm, emergency_contact_name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Emergency contact phone</label>
              <input
                value={addForm.emergency_contact_phone}
                onChange={(e) => setAddForm({ ...addForm, emergency_contact_phone: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Medical notes</label>
              <textarea
                rows={3}
                value={addForm.medical_notes}
                onChange={(e) => setAddForm({ ...addForm, medical_notes: e.target.value })}
              />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={handleAddPerson}
                disabled={addBusy || !addForm.full_name || !addForm.category_id}
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
            <h2>Delete registration?</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 12.5, marginBottom: 20 }}>
              This permanently removes {deleteTarget.participant.full_name}'s registration (
              {deleteTarget.registration_number}). This cannot be undone.
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
