import { Outlet, NavLink, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useEffect, useState } from 'react';
import { orgApi } from '../../services/api';
import { Spinner } from '../../components/UI';

// ── Nav definition ─────────────────────────────────────────────────────────
// trialOk: true  → visible during free trial
// trialOk: false → locked during trial
const NAV = [
  { to: 'onboarding',   icon: RocketIcon,    label: 'Get started',  onboardingOnly: true, trialOk: true },
  null,
  { to: 'playground',   icon: PlayIcon,      label: 'Playground',   trialOk: true },
  { to: 'integrations', icon: IntegIcon,     label: 'Integrations', trialOk: true },
  { to: 'guardrails',   icon: ShieldIcon,    label: 'Guardrails',   trialOk: false },
  { to: 'policies',     icon: PolicyIcon,    label: 'Policies',     trialOk: false },
  { to: 'templates',    icon: TemplateIcon,  label: 'Templates',    trialOk: false },
  { to: 'webhooks',     icon: BellIcon,      label: 'Webhooks',     trialOk: false },
  { to: 'slack',        icon: SlackIcon,     label: 'Slack',        trialOk: false },
  { to: 'downstream',   icon: DownstreamIcon,label: 'Downstream',   trialOk: false, minRole: 'developer' },
  null,
  { to: 'analytics',    icon: BarChartIcon,  label: 'Analytics',    trialOk: false },
  { to: 'audit',        icon: ScrollIcon,    label: 'Audit log',    trialOk: false },
  { to: 'gauntlet',     icon: TargetIcon,    label: 'Gauntlet',     trialOk: false, minRole: 'developer' },
  null,
  { to: 'members',      icon: UsersIcon,     label: 'Members',      trialOk: false, minRole: 'administrator' },
  { to: 'api-keys',     icon: KeyIcon,       label: 'API keys',     trialOk: true,  minRole: 'developer' },
  { to: 'sso',          icon: LockIcon,      label: 'SSO',          trialOk: false, minRole: 'administrator' },
  { to: 'billing',      icon: CardIcon,      label: 'Billing',      trialOk: true,  minRole: 'administrator' },
  { to: 'settings',     icon: GearIcon,      label: 'Settings',     trialOk: false, minRole: 'administrator' },
  null,
  { to: 'super-admin',  icon: SuperIcon,     label: 'Super Admin',  trialOk: true,  superuserOnly: true },
];

const TRIAL_ALLOWED   = new Set(['playground', 'integrations', 'onboarding', 'billing']);
const EXPIRED_ALLOWED = new Set(['billing']);

// ── Activation progress hook ──────────────────────────────────────────────
function useActivationProgress(orgId) {
  const [progress, setProgress] = useState(null);
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    orgApi.activation(orgId).then(status => {
      if (cancelled) return;
      const steps = [status.providerConnected, status.firstRequestSent, status.guardrailFired];
      const done = steps.filter(Boolean).length;
      if (done === steps.length) { setProgress(null); return; }
      setProgress({ done, total: steps.length });
    }).catch(() => setProgress(null));
    return () => { cancelled = true; };
  }, [orgId]);
  return progress;
}

// ── Shell ─────────────────────────────────────────────────────────────────
export default function DashboardShell() {
  const { user, orgs, logout } = useAuth();
  const isSuperuser = user?.isSuperuser === true;
  const { currentOrg, orgDetail, role, switchOrg, can,
          isFreePlan, isTrialActive, isTrialExpired, trialDaysLeft } = useOrg();
  const navigate  = useNavigate();
  const location  = useLocation();

  const handleLogout = async () => { await logout(); navigate('/auth/login'); };

  const isSuspended = orgDetail?.tenant_status === 'suspended';
  const onTrial     = isTrialActive  && !isSuperuser;
  const trialDead   = isTrialExpired && !isSuperuser;

  const progress = useActivationProgress(currentOrg?.org_id);

  const routeSlug           = location.pathname.replace('/dashboard/', '').split('/')[0];
  const pageLockedByTrial   = onTrial   && !TRIAL_ALLOWED.has(routeSlug);
  const pageLockedByExpired = trialDead && !EXPIRED_ALLOWED.has(routeSlug);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* ── Banners ── */}
      {user && !user.emailVerified && (
        <div style={{ background: '#92400e', color: '#fef3c7', padding: '7px 20px', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, zIndex: 100 }}>
          <span>📧 Please verify your email address — check your inbox (and spam folder) for the verification link.</span>
        </div>
      )}
      {isSuspended && (
        <div style={{ background: 'var(--red)', color: '#fff', padding: '7px 20px', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, zIndex: 100 }}>
          <span>⚠️</span>
          <span>This organization has been <strong>suspended</strong>.{orgDetail.suspended_reason ? ` ${orgDetail.suspended_reason}.` : ''} Contact support.</span>
        </div>
      )}
      {onTrial && (
        <div style={{ background: 'linear-gradient(90deg,#5b21b6,#7c3aed)', color: '#fff', padding: '6px 20px', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 100 }}>
          <span>🧪 Free trial — <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}</strong> remaining. Playground &amp; Integrations available now.</span>
          <NavLink to="/dashboard/billing" style={{ color: '#fff', fontWeight: 600, fontSize: 12, textDecoration: 'underline', marginLeft: 16 }}>Upgrade →</NavLink>
        </div>
      )}
      {trialDead && (
        <div style={{ background: 'var(--red)', color: '#fff', padding: '6px 20px', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 100 }}>
          <span>⏰ Your free trial has expired. Upgrade to continue using PromptSense.</span>
          <NavLink to="/dashboard/billing" style={{ color: '#fff', fontWeight: 600, fontSize: 12, textDecoration: 'underline', marginLeft: 16 }}>Upgrade now →</NavLink>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1 }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width: 216, minHeight: '100vh', background: 'var(--bg2)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        }}>

          {/* Logo */}
          <div style={{ padding: '16px 14px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 28, height: 28, flexShrink: 0,
                background: 'linear-gradient(135deg, var(--accent-mid), var(--accent))',
                borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px var(--accent-glow)',
              }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1.5L12.5 7L7 12.5L1.5 7L7 1.5Z" stroke="#fff" strokeWidth="1.6" fill="none"/>
                  <circle cx="7" cy="7" r="2.1" fill="#fff"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.025em' }}>PromptSense</div>
                <div style={{ fontSize: 9.5, color: 'var(--text3)', fontWeight: 500, letterSpacing: '0.03em' }}>Enterprise AI Guardrails</div>
              </div>
            </div>
          </div>

          {/* Org switcher */}
          {orgs.length > 0 && (
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <select
                value={currentOrg?.org_id || ''}
                onChange={e => switchOrg(orgs.find(o => o.org_id === e.target.value))}
                style={{
                  width: '100%', fontSize: 12, height: 30, padding: '0 8px',
                  borderRadius: 'var(--radius)', border: '1px solid var(--border2)',
                  background: 'var(--bg4)', color: 'var(--text)', cursor: 'pointer',
                }}
              >
                {orgs.map(o => <option key={o.org_id} value={o.org_id}>{o.org_name}</option>)}
              </select>

              {orgDetail && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>{orgDetail.plan_name} plan</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {orgDetail.tenant_status === 'suspended' && (
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--red-dim)', color: 'var(--red)', fontWeight: 600 }}>SUSPENDED</span>
                    )}
                    <span style={{
                      fontSize: 9.5, padding: '1px 7px', borderRadius: 99,
                      background: isSuperuser ? 'rgba(239,68,68,0.12)' : 'var(--accent-dim)',
                      color: isSuperuser ? 'var(--red)' : 'var(--accent-light)',
                      fontWeight: 600, letterSpacing: '0.02em',
                    }}>
                      {isSuperuser ? 'SUPER' : role?.toUpperCase()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Onboarding progress */}
          {progress && (
            <NavLink to="/dashboard/onboarding" style={{ textDecoration: 'none', flexShrink: 0 }}>
              <div style={{
                margin: '10px 10px 0', padding: '10px 12px',
                background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
                borderRadius: 'var(--radius)', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-light)' }}>Setup checklist</span>
                  <span style={{ fontSize: 10, color: 'var(--accent-mid)' }}>{progress.done}/{progress.total}</span>
                </div>
                <div style={{ height: 3, background: 'rgba(139,92,246,0.2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((progress.done / progress.total) * 100)}%`, background: 'var(--accent-mid)', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text2)', marginTop: 5 }}>
                  {progress.total - progress.done} step{progress.total - progress.done !== 1 ? 's' : ''} remaining →
                </div>
              </div>
            </NavLink>
          )}

          {/* Navigation */}
          <nav style={{ flex: 1, padding: '8px 6px', overflowY: 'auto' }}>
            {NAV.map((item, i) => {
              if (!item) return <div key={i} style={{ height: 1, background: 'var(--border)', margin: '5px 8px' }} />;
              if (item.minRole && !can(item.minRole) && !isSuperuser) return null;
              if (item.superuserOnly && !isSuperuser) return null;
              if (item.onboardingOnly && !progress) return null;

              const lockedByTrial   = onTrial   && !item.trialOk;
              const lockedByExpired = trialDead && !item.trialOk;
              const locked = lockedByTrial || lockedByExpired;

              if (locked) {
                return (
                  <div key={item.to} title="Upgrade to unlock"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px',
                      fontSize: 13, color: 'var(--text4)', borderRadius: 'var(--radius)',
                      cursor: 'not-allowed', opacity: 0.4, userSelect: 'none',
                    }}
                  >
                    <item.icon size={15} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <span style={{ fontSize: 9 }}>🔒</span>
                  </div>
                );
              }

              return (
                <NavLink
                  key={item.to}
                  to={`/dashboard/${item.to}`}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px',
                    fontSize: 13, borderRadius: 'var(--radius)', margin: '1px 0',
                    fontWeight: isActive ? 600 : 400, textDecoration: 'none',
                    color: isActive ? 'var(--accent-light)' : 'var(--text2)',
                    background: isActive ? 'var(--accent-dim)' : 'transparent',
                    transition: 'all var(--transition)',
                  })}
                  onMouseEnter={e => {
                    if (!e.currentTarget.classList.contains('active')) {
                      e.currentTarget.style.background = 'var(--bg5)';
                      e.currentTarget.style.color = 'var(--text)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!e.currentTarget.classList.contains('active')) {
                      e.currentTarget.style.background = '';
                      e.currentTarget.style.color = '';
                    }
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <span style={{ color: isActive ? 'var(--accent-mid)' : 'var(--text3)', flexShrink: 0 }}>
                        <item.icon size={15} />
                      </span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.onboardingOnly && progress && (
                        <span style={{ fontSize: 9.5, background: 'var(--accent)', color: '#fff', borderRadius: 99, padding: '1px 6px', fontWeight: 600 }}>
                          {progress.done}/{progress.total}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* User footer */}
          <div style={{ padding: '10px 10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 4px 10px', overflow: 'hidden' }}>
              {/* Avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: isSuperuser
                  ? 'linear-gradient(135deg,#ef4444,#b91c1c)'
                  : 'linear-gradient(135deg,var(--accent-mid),var(--accent))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10.5, fontWeight: 700, color: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }}>
                {(user?.fullName || user?.email || '?').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.fullName || user?.email}
                  </span>
                  {isSuperuser && (
                    <span style={{ fontSize: 8.5, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,0.15)', color: 'var(--red)', fontWeight: 700, flexShrink: 0 }}>
                      SUPER
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </div>
              </div>
            </div>
            <LogoutBtn onClick={handleLogout} />
          </div>
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, padding: '2rem 2.5rem', overflowY: 'auto', minHeight: '100vh', background: 'var(--bg)', maxWidth: '100%' }}>
          <div className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Logout button ──────────────────────────────────────────────────────────
function LogoutBtn({ onClick }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: '100%', height: 30, fontSize: 12, borderRadius: 'var(--radius)',
        border: `1px solid ${h ? 'var(--border3)' : 'var(--border)'}`,
        background: h ? 'var(--bg5)' : 'transparent',
        color: h ? 'var(--text)' : 'var(--text3)',
        transition: 'all var(--transition)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16,17 21,12 16,7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      Sign out
    </button>
  );
}

// ── SVG icon components ────────────────────────────────────────────────────
function Icon({ d, size = 15, viewBox = '0 0 24 24' }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {Array.isArray(d) ? d.map((path, i) => <path key={i} d={path} />) : <path d={d} />}
    </svg>
  );
}
function RocketIcon({ size })    { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>; }
function PlayIcon({ size })      { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>; }
function IntegIcon({ size })     { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>; }
function ShieldIcon({ size })    { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function PolicyIcon({ size })    { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>; }
function TemplateIcon({ size })  { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>; }
function BellIcon({ size })      { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function DownstreamIcon({ size }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>; }
function BarChartIcon({ size })  { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function ScrollIcon({ size })    { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>; }
function TargetIcon({ size })    { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>; }
function UsersIcon({ size })     { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function KeyIcon({ size })       { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>; }
function LockIcon({ size })      { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>; }
function CardIcon({ size })      { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>; }
function GearIcon({ size })      { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function SuperIcon({ size })     { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>; }
function SlackIcon({ size })     { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 8h.01M15 8h.01M9 16h.01M15 16h.01M9 12h6"/></svg>; }
