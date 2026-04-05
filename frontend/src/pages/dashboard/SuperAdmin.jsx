import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/api';
import { Card, Btn, Input, Badge, Alert, PageHeader, Modal, MetricCard, Spinner, Empty } from '../../components/UI';

// ── Helpers ───────────────────────────────────────────────────────────────────
const PLAN_COLORS = { starter: '#378ADD', pro: '#BA7517', enterprise: '#7F77DD' };
const ROLE_COLORS = { user: '#378ADD', developer: '#BA7517', administrator: '#7F77DD', superuser: '#E04E4E' };

function ConfirmModal({ open, onClose, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, loading }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: 'var(--c-text2)', margin: 0 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Btn>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function StatsBar() {
  const [stats, setStats] = useState(null);
  useEffect(() => { adminApi.stats().then(setStats).catch(() => {}); }, []);
  if (!stats) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: '1.5rem' }}>
      <MetricCard label="Total users" value={stats.users?.total || 0} sub={`+${stats.users?.new_30d || 0} last 30d`} />
      <MetricCard label="Organizations" value={stats.orgs?.total || 0} sub={`${stats.orgs?.paying || 0} paying`} />
      <MetricCard label="Superusers" value={stats.users?.superusers || 0} sub="platform admins" />
      <MetricCard label="Prompt requests" value={Number(stats.requests?.total || 0).toLocaleString()} sub={`${Number(stats.requests?.month || 0).toLocaleString()} this month`} />
      <MetricCard label="MRR" value={`$${Math.round((stats.mrr || 0) / 100)}`} sub="monthly recurring" />
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab({ currentUserId }) {
  const [users, setUsers]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [confirm, setConfirm]   = useState(null); // { type, user }
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [resetPwd, setResetPwd] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.listUsers({ search, page, limit: 30 });
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (e) { setError('Failed to load users'); }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    setActionLoading(true); setError('');
    try {
      await adminApi.deleteUser(confirm.user.id);
      setSuccess(`${confirm.user.email} deleted`);
      setConfirm(null);
      load();
    } catch (e) { setError(e.response?.data?.error || 'Delete failed'); }
    finally { setActionLoading(false); }
  };

  const handleToggleSuperuser = async () => {
    setActionLoading(true); setError('');
    try {
      const updated = await adminApi.toggleSuperuser(confirm.user.id);
      setSuccess(`${confirm.user.email} is ${updated.is_superuser ? 'now' : 'no longer'} a superuser`);
      setConfirm(null);
      load();
    } catch (e) { setError(e.response?.data?.error || 'Failed to update'); }
    finally { setActionLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!resetPwd || resetPwd.length < 8) { setError('Password must be at least 8 characters'); return; }
    setActionLoading(true); setError('');
    try {
      await adminApi.resetPassword(confirm.user.id, resetPwd);
      setSuccess(`Password reset for ${confirm.user.email}`);
      setConfirm(null); setResetPwd('');
    } catch (e) { setError(e.response?.data?.error || 'Reset failed'); }
    finally { setActionLoading(false); }
  };

  const totalPages = Math.ceil(total / 30);

  return (
    <div>
      <Alert type="error" message={error} />
      <Alert type="success" message={success} />

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', alignItems: 'center' }}>
        <input
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name or email…"
          style={{ flex: 1, fontSize: 13, padding: '7px 12px', borderRadius: 'var(--radius)', border: '0.5px solid var(--c-border2)', background: 'var(--c-bg)', color: 'var(--c-text)', outline: 'none' }}
        />
        <span style={{ fontSize: 12, color: 'var(--c-text3)', whiteSpace: 'nowrap' }}>{total.toLocaleString()} users</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Spinner /></div>
      ) : (
        <>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 160px 80px 140px', gap: 8, padding: '5px 14px', fontSize: 10, color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>User</span><span>Role</span><span>Organizations</span><span>Verified</span><span style={{ textAlign: 'right' }}>Actions</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {users.map(u => (
              <div key={u.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 120px 160px 80px 140px', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--c-bg)', border: `0.5px solid ${u.is_superuser ? 'var(--c-red)44' : 'var(--c-border)'}` }}>

                {/* Name + email */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: u.is_superuser ? 'var(--c-red)22' : 'var(--c-purple)22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: u.is_superuser ? 'var(--c-red)' : 'var(--c-purple)', flexShrink: 0 }}>
                      {(u.full_name || u.email || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.full_name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                    </div>
                  </div>
                </div>

                {/* Role */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {u.is_superuser && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--c-red)22', color: 'var(--c-red)', fontWeight: 600 }}>superuser</span>}
                  {u.highest_role && !u.is_superuser && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: (ROLE_COLORS[u.highest_role] || '#888') + '22', color: ROLE_COLORS[u.highest_role] || '#888' }}>{u.highest_role}</span>}
                </div>

                {/* Orgs */}
                <div style={{ fontSize: 11, color: 'var(--c-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.org_names}>
                  {u.org_count > 0 ? `${u.org_count} org${u.org_count > 1 ? 's' : ''}: ${u.org_names || ''}` : <span style={{ color: 'var(--c-text3)' }}>No orgs</span>}
                </div>

                {/* Verified */}
                <div>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: u.email_verified ? 'var(--c-green)22' : 'var(--c-amber)22', color: u.email_verified ? 'var(--c-green)' : 'var(--c-amber)' }}>
                    {u.email_verified ? '✓ verified' : '⚠ pending'}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setConfirm({ type: 'superuser', user: u })}
                    title={u.is_superuser ? 'Revoke superuser' : 'Promote to superuser'}
                    style={{ fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius)', border: `0.5px solid ${u.is_superuser ? 'var(--c-red)' : 'var(--c-border2)'}`, background: 'transparent', color: u.is_superuser ? 'var(--c-red)' : 'var(--c-text2)', cursor: 'pointer' }}>
                    {u.is_superuser ? '★' : '☆'}
                  </button>
                  <button
                    onClick={() => { setConfirm({ type: 'reset', user: u }); setResetPwd(''); }}
                    title="Reset password"
                    style={{ fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius)', border: '0.5px solid var(--c-border2)', background: 'transparent', color: 'var(--c-text2)', cursor: 'pointer' }}>
                    🔑
                  </button>
                  {u.id !== currentUserId && (
                    <button
                      onClick={() => setConfirm({ type: 'delete', user: u })}
                      title="Delete user"
                      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius)', border: '0.5px solid var(--c-red)66', background: 'transparent', color: 'var(--c-red)', cursor: 'pointer' }}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            {users.length === 0 && <Empty icon="👤" title="No users found" description={search ? 'Try a different search term' : 'No users in the system yet'} />}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '1rem' }}>
              <Btn size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</Btn>
              <span style={{ fontSize: 12, color: 'var(--c-text2)', padding: '5px 8px' }}>Page {page} of {totalPages}</span>
              <Btn size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Btn>
            </div>
          )}
        </>
      )}

      {/* Delete confirm */}
      <ConfirmModal
        open={confirm?.type === 'delete'}
        onClose={() => setConfirm(null)}
        title="Delete user account"
        message={`Permanently delete ${confirm?.user?.email}? This removes them from all organizations and cannot be undone.`}
        confirmLabel="Yes, delete permanently"
        danger
        onConfirm={handleDelete}
        loading={actionLoading}
      />

      {/* Toggle superuser confirm */}
      <ConfirmModal
        open={confirm?.type === 'superuser'}
        onClose={() => setConfirm(null)}
        title={confirm?.user?.is_superuser ? 'Revoke superuser' : 'Promote to superuser'}
        message={confirm?.user?.is_superuser
          ? `Remove superuser privileges from ${confirm?.user?.email}? They will no longer have platform-level access.`
          : `Give ${confirm?.user?.email} full platform-level access including the ability to delete any user or organization?`}
        confirmLabel={confirm?.user?.is_superuser ? 'Yes, revoke' : 'Yes, promote'}
        danger={!confirm?.user?.is_superuser}
        onConfirm={handleToggleSuperuser}
        loading={actionLoading}
      />

      {/* Reset password modal */}
      <Modal open={confirm?.type === 'reset'} onClose={() => setConfirm(null)} title={`Reset password — ${confirm?.user?.email}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--c-text2)', margin: 0 }}>
            Set a new temporary password. The user's existing sessions will be invalidated.
          </p>
          <Alert type="error" message={error} />
          <Input label="New password (min 8 chars)" type="password" value={resetPwd} onChange={e => setResetPwd(e.target.value)} placeholder="Temporary password" />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={handleResetPassword} loading={actionLoading} disabled={!resetPwd}>Reset password</Btn>
            <Btn variant="secondary" onClick={() => setConfirm(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Create Tenant Modal ───────────────────────────────────────────────────────
function CreateTenantModal({ open, onClose, plans, onCreated }) {
  const [form, setForm] = useState({ name: '', adminEmail: '', adminName: '', adminPassword: '', planName: 'starter' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handle = async () => {
    setError(''); setLoading(true);
    try {
      await adminApi.createOrg(form);
      onCreated();
      onClose();
      setForm({ name: '', adminEmail: '', adminName: '', adminPassword: '', planName: 'starter' });
    } catch (e) { setError(e.response?.data?.error || 'Failed to create tenant'); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create new tenant">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Alert type="error" message={error} />
        <Input label="Organization name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Corp" />
        <Input label="Admin email" type="email" value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))} placeholder="admin@acme.com" />
        <Input label="Admin full name" value={form.adminName} onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))} placeholder="Jane Smith" />
        <Input label="Admin password" type="password" value={form.adminPassword} onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))} placeholder="Temporary password (min 8 chars)" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--c-text2)', fontWeight: 500 }}>Plan</label>
          <select value={form.planName} onChange={e => setForm(f => ({ ...f, planName: e.target.value }))}
            style={{ fontSize: 13, padding: '7px 10px', borderRadius: 'var(--radius)', border: '0.5px solid var(--c-border2)', background: 'var(--c-bg)', color: 'var(--c-text)', outline: 'none' }}>
            {plans.map(p => <option key={p.name} value={p.name}>{p.display_name || p.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Btn onClick={handle} loading={loading} disabled={!form.name || !form.adminEmail || !form.adminPassword}>Create tenant</Btn>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Organizations Tab ─────────────────────────────────────────────────────────
function OrgsTab() {
  const [orgs, setOrgs]               = useState([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading]         = useState(true);
  const [plans, setPlans]             = useState([]);
  const [confirm, setConfirm]         = useState(null); // { type: 'delete'|'suspend'|'activate', org }
  const [suspendReason, setSuspendReason] = useState('');
  const [showCreate, setShowCreate]   = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, plansData] = await Promise.all([
        adminApi.listOrgs({ search, page, limit: 30, status: statusFilter }),
        fetch(`${import.meta.env.VITE_API_URL || '/api'}/plans`).then(r => r.json()),
      ]);
      setOrgs(data.orgs || []);
      setTotal(data.total || 0);
      setPlans(plansData || []);
    } catch (e) { setError('Failed to load organizations'); }
    finally { setLoading(false); }
  }, [search, page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleChangePlan = async (orgId, planName) => {
    try {
      await adminApi.updateOrgPlan(orgId, planName);
      setSuccess('Plan updated'); load();
    } catch (e) { setError(e.response?.data?.error || 'Failed to update plan'); }
  };

  const handleAction = async () => {
    setActionLoading(true); setError('');
    try {
      if (confirm.type === 'delete') {
        await adminApi.deleteOrg(confirm.org.id);
        setSuccess(`"${confirm.org.name}" deleted`);
      } else if (confirm.type === 'suspend') {
        await adminApi.suspendOrg(confirm.org.id, suspendReason);
        setSuccess(`"${confirm.org.name}" suspended`);
      } else if (confirm.type === 'activate') {
        await adminApi.activateOrg(confirm.org.id);
        setSuccess(`"${confirm.org.name}" reactivated`);
      }
      setConfirm(null); setSuspendReason(''); load();
    } catch (e) { setError(e.response?.data?.error || 'Action failed'); }
    finally { setActionLoading(false); }
  };

  const totalPages = Math.ceil(total / 30);
  const STATUS_COLORS = { active: 'var(--c-green)', suspended: 'var(--c-red)', trial: 'var(--c-amber)' };

  return (
    <div>
      <Alert type="error" message={error} />
      <Alert type="success" message={success} />

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', alignItems: 'center' }}>
        <input
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search organizations…"
          style={{ flex: 1, fontSize: 13, padding: '7px 12px', borderRadius: 'var(--radius)', border: '0.5px solid var(--c-border2)', background: 'var(--c-bg)', color: 'var(--c-text)', outline: 'none' }}
        />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ fontSize: 12, padding: '7px 10px', borderRadius: 'var(--radius)', border: '0.5px solid var(--c-border2)', background: 'var(--c-bg)', color: 'var(--c-text)', outline: 'none' }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--c-text3)', whiteSpace: 'nowrap' }}>{total.toLocaleString()} orgs</span>
        <Btn size="sm" onClick={() => setShowCreate(true)}>+ New tenant</Btn>
      </div>

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px 120px 110px', gap: 8, padding: '5px 14px', fontSize: 10, color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span>Tenant</span><span>Members</span><span>Req/30d</span><span>Status</span><span>Plan</span><span style={{ textAlign: 'right' }}>Actions</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Spinner /></div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {orgs.map(o => (
              <div key={o.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px 120px 110px', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--c-bg)', border: `0.5px solid ${o.tenant_status === 'suspended' ? 'var(--c-red)44' : 'var(--c-border)'}` }}>

                {/* Name + slug */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {o.logo_url && <img src={o.logo_url} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />}
                    {o.primary_color && <div style={{ width: 10, height: 10, borderRadius: '50%', background: o.primary_color, flexShrink: 0 }} />}
                    <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c-text3)' }}>
                    /{o.slug} · {new Date(o.created_at).toLocaleDateString()}
                    {o.custom_domain && <span style={{ marginLeft: 6, color: 'var(--c-purple)' }}>🔗 {o.custom_domain}</span>}
                    {o.tenant_status === 'suspended' && o.suspended_reason && <span style={{ marginLeft: 6, color: 'var(--c-red)' }}>— {o.suspended_reason}</span>}
                  </div>
                </div>

                <span style={{ fontSize: 12, color: 'var(--c-text2)' }}>{o.member_count}</span>
                <span style={{ fontSize: 12, color: 'var(--c-text2)' }}>{Number(o.requests_30d || 0).toLocaleString()}</span>

                {/* Tenant status */}
                <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: (STATUS_COLORS[o.tenant_status] || '#888') + '22', color: STATUS_COLORS[o.tenant_status] || '#888', display: 'inline-block', fontWeight: 500 }}>
                  {o.tenant_status || 'active'}
                </span>

                {/* Plan dropdown */}
                <select value={o.plan_name} onChange={e => handleChangePlan(o.id, e.target.value)}
                  style={{ fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius)', border: `0.5px solid ${(PLAN_COLORS[o.plan_name] || '#888')}55`, background: (PLAN_COLORS[o.plan_name] || '#888') + '18', color: PLAN_COLORS[o.plan_name] || '#888', cursor: 'pointer', outline: 'none' }}>
                  {plans.map(p => <option key={p.name} value={p.name}>{p.display_name || p.name}</option>)}
                </select>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  {o.tenant_status === 'suspended' ? (
                    <button onClick={() => setConfirm({ type: 'activate', org: o })} title="Reactivate"
                      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius)', border: '0.5px solid var(--c-green)66', background: 'transparent', color: 'var(--c-green)', cursor: 'pointer' }}>
                      Activate
                    </button>
                  ) : (
                    <button onClick={() => { setConfirm({ type: 'suspend', org: o }); setSuspendReason(''); }} title="Suspend tenant"
                      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius)', border: '0.5px solid var(--c-amber)66', background: 'transparent', color: 'var(--c-amber)', cursor: 'pointer' }}>
                      Suspend
                    </button>
                  )}
                  <button onClick={() => setConfirm({ type: 'delete', org: o })} title="Delete organization"
                    style={{ fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius)', border: '0.5px solid var(--c-red)66', background: 'transparent', color: 'var(--c-red)', cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {orgs.length === 0 && <Empty icon="🏢" title="No organizations found" description={search ? 'Try a different search term' : 'No tenants yet — create one above'} action={<Btn size="sm" onClick={() => setShowCreate(true)}>+ New tenant</Btn>} />}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '1rem' }}>
              <Btn size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</Btn>
              <span style={{ fontSize: 12, color: 'var(--c-text2)', padding: '5px 8px' }}>Page {page} of {totalPages}</span>
              <Btn size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Btn>
            </div>
          )}
        </>
      )}

      {/* Create tenant modal */}
      <CreateTenantModal open={showCreate} onClose={() => setShowCreate(false)} plans={plans} onCreated={() => { setSuccess('Tenant created'); load(); }} />

      {/* Delete confirm */}
      <ConfirmModal
        open={confirm?.type === 'delete'}
        onClose={() => setConfirm(null)}
        title="Delete organization"
        message={`Permanently delete "${confirm?.org?.name}"? All members lose access immediately. Data is soft-deleted for compliance.`}
        confirmLabel="Yes, delete org"
        danger
        onConfirm={handleAction}
        loading={actionLoading}
      />

      {/* Suspend confirm */}
      <Modal open={confirm?.type === 'suspend'} onClose={() => setConfirm(null)} title={`Suspend "${confirm?.org?.name}"`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--c-text2)', margin: 0 }}>
            All API access and dashboard logins for this tenant will be blocked immediately. Their API keys will be revoked.
          </p>
          <Input label="Reason (optional — shown to the org)" value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="e.g. Non-payment, Terms violation" />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="danger" onClick={handleAction} loading={actionLoading}>Suspend tenant</Btn>
            <Btn variant="secondary" onClick={() => setConfirm(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      {/* Activate confirm */}
      <ConfirmModal
        open={confirm?.type === 'activate'}
        onClose={() => setConfirm(null)}
        title={`Reactivate "${confirm?.org?.name}"`}
        message="This will restore full access for all members of this organization."
        confirmLabel="Yes, reactivate"
        onConfirm={handleAction}
        loading={actionLoading}
      />
    </div>
  );
}

// ── Main SuperAdmin Page ───────────────────────────────────────────────────────
export default function SuperAdmin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('users');

  if (!user?.isSuperuser) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Access denied</div>
        <div style={{ fontSize: 13, color: 'var(--c-text2)' }}>Super-user privileges required to view this page.</div>
      </div>
    );
  }

  const tabs = [
    { id: 'users', label: '👤 Users' },
    { id: 'orgs',  label: '🏢 Organizations' },
  ];

  return (
    <div>
      <PageHeader
        title="Super Admin"
        description="Platform-level user and organization management — superusers only."
      />

      {/* Warning banner */}
      <div style={{ padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--c-red)0D', border: '0.5px solid var(--c-red)44', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <span style={{ fontSize: 12, color: 'var(--c-red)' }}>You are in the Super Admin panel. Actions here are irreversible and affect all tenants on the platform.</span>
      </div>

      <StatsBar />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1rem', borderBottom: '0.5px solid var(--c-border)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ fontSize: 13, padding: '8px 16px', borderRadius: 'var(--radius) var(--radius) 0 0', border: '0.5px solid transparent', borderBottom: 'none', background: tab === t.id ? 'var(--c-bg)' : 'transparent', color: tab === t.id ? 'var(--c-text)' : 'var(--c-text2)', cursor: 'pointer', fontWeight: tab === t.id ? 500 : 400, marginBottom: -1, borderColor: tab === t.id ? 'var(--c-border)' : 'transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {tab === 'users' && <UsersTab currentUserId={user?.id} />}
        {tab === 'orgs'  && <OrgsTab />}
      </Card>
    </div>
  );
}
