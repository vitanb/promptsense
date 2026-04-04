import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useEffect, useState } from 'react';
import { orgApi, configApi } from '../../services/api';

const NAV = [
  { to:'onboarding',   icon:'🚀', label:'Get started',  onboardingOnly: true },
  null,
  { to:'playground',   icon:'▶', label:'Playground' },
  { to:'integrations', icon:'⚡', label:'Integrations' },
  { to:'guardrails',   icon:'🛡', label:'Guardrails' },
  { to:'policies',     icon:'📋', label:'Policies' },
  { to:'templates',    icon:'📄', label:'Templates' },
  { to:'webhooks',     icon:'🔔', label:'Webhooks' },
  null,
  { to:'analytics',   icon:'📊', label:'Analytics' },
  { to:'audit',        icon:'📜', label:'Audit log' },
  { to:'gauntlet',     icon:'🎯', label:'Gauntlet',   minRole:'developer' },
  null,
  { to:'members',      icon:'👥', label:'Members',  minRole:'administrator' },
  { to:'api-keys',     icon:'🔑', label:'API keys', minRole:'developer' },
  { to:'billing',      icon:'💳', label:'Billing',  minRole:'administrator' },
  { to:'settings',     icon:'⚙', label:'Settings', minRole:'administrator' },
];

const ROLE_COLORS = { user:'#378ADD', developer:'#BA7517', administrator:'#7F77DD' };

/** Lightweight hook: checks how many onboarding steps are done */
function useOnboardingProgress(orgId) {
  const [progress, setProgress] = useState(null); // null = loading

  useEffect(() => {
    if (!orgId) return;
    // If user skipped, treat as complete
    if (localStorage.getItem(`ps_onboarding_skip_${orgId}`)) {
      setProgress(null);
      return;
    }

    let cancelled = false;
    Promise.allSettled([
      orgApi.providers(orgId),
      configApi.guardrails(orgId),
      orgApi.apiKeys(orgId),
    ]).then(([providers, guardrails, keys]) => {
      if (cancelled) return;
      const steps = [
        providers.status === 'fulfilled' && providers.value?.length > 0,
        guardrails.status === 'fulfilled' && guardrails.value?.length > 0,
        Boolean(localStorage.getItem(`ps_playground_${orgId}`)),
        keys.status === 'fulfilled' && keys.value?.length > 0,
      ];
      const done = steps.filter(Boolean).length;
      // Hide banner once all done
      if (done === steps.length) { setProgress(null); return; }
      setProgress({ done, total: steps.length });
    }).catch(() => setProgress(null));

    return () => { cancelled = true; };
  }, [orgId]);

  return progress;
}

export default function DashboardShell() {
  const { user, orgs, logout } = useAuth();
  const { currentOrg, orgDetail, role, switchOrg, can } = useOrg();
  const navigate = useNavigate();

  const progress = useOnboardingProgress(currentOrg?.org_id);

  const handleLogout = async () => { await logout(); navigate('/auth/login'); };

  const sidebarStyle = { width:220, minHeight:'100vh', background:'var(--c-bg2)', borderRight:'0.5px solid var(--c-border)', display:'flex', flexDirection:'column', flexShrink:0 };
  const linkStyle = ({ isActive }) => ({
    display:'flex', alignItems:'center', gap:9, padding:'7px 16px', fontSize:13,
    color: isActive ? 'var(--c-text)' : 'var(--c-text2)',
    background: isActive ? 'var(--c-bg3)' : 'transparent',
    borderRadius:'var(--radius)', margin:'1px 8px',
    fontWeight: isActive ? 500 : 400, textDecoration:'none',
    transition:'background 0.1s',
  });

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      {/* Sidebar */}
      <aside style={sidebarStyle}>
        {/* Logo */}
        <div style={{ padding:'20px 16px 12px', borderBottom:'0.5px solid var(--c-border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:26, height:26, background:'var(--c-purple)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L12.5 7L7 12.5L1.5 7L7 1.5Z" stroke="#fff" strokeWidth="1.5" fill="none"/><circle cx="7" cy="7" r="2" fill="#fff"/></svg>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--c-purple)' }}>PromptSense</div>
              <div style={{ fontSize:10, color:'var(--c-text3)' }}>Enterprise</div>
            </div>
          </div>
        </div>

        {/* Org switcher */}
        {orgs.length > 0 && (
          <div style={{ padding:'10px 16px', borderBottom:'0.5px solid var(--c-border)' }}>
            <select value={currentOrg?.org_id || ''} onChange={e => switchOrg(orgs.find(o => o.org_id === e.target.value))}
              style={{ width:'100%', fontSize:12, padding:'5px 8px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', cursor:'pointer' }}>
              {orgs.map(o => <option key={o.org_id} value={o.org_id}>{o.org_name}</option>)}
            </select>
            {orgDetail && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:5 }}>
                <span style={{ fontSize:10, color:'var(--c-text3)' }}>{orgDetail.plan_name} plan</span>
                <span style={{ fontSize:10, padding:'1px 6px', borderRadius:3, background: ROLE_COLORS[role]+'22', color: ROLE_COLORS[role] }}>{role}</span>
              </div>
            )}
          </div>
        )}

        {/* Onboarding progress banner */}
        {progress && (
          <NavLink to="/dashboard/onboarding" style={{ textDecoration:'none' }}>
            <div style={{ margin:'10px 10px 0', padding:'10px 12px', background:'var(--c-purple)10', border:'0.5px solid var(--c-purple)33', borderRadius:'var(--radius)', cursor:'pointer' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:11, fontWeight:600, color:'var(--c-purple)' }}>Setup checklist</span>
                <span style={{ fontSize:10, color:'var(--c-purple)' }}>{progress.done}/{progress.total}</span>
              </div>
              <div style={{ height:4, background:'var(--c-purple)22', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${Math.round((progress.done/progress.total)*100)}%`, background:'var(--c-purple)', borderRadius:2, transition:'width 0.3s' }} />
              </div>
              <div style={{ fontSize:11, color:'var(--c-text2)', marginTop:5 }}>
                {progress.total - progress.done} step{progress.total - progress.done !== 1 ? 's' : ''} remaining →
              </div>
            </div>
          </NavLink>
        )}

        {/* Nav */}
        <nav style={{ flex:1, padding:'8px 0', overflowY:'auto' }}>
          {NAV.map((item, i) => {
            if (!item) return <div key={i} style={{ height:1, background:'var(--c-border)', margin:'6px 16px' }} />;
            if (item.minRole && !can(item.minRole)) return null;
            // Hide "Get started" once onboarding progress is gone
            if (item.onboardingOnly && !progress) return null;
            return (
              <NavLink key={item.to} to={`/dashboard/${item.to}`} style={linkStyle}>
                <span style={{ fontSize:14, lineHeight:1, width:16, textAlign:'center' }}>{item.icon}</span>
                {item.label}
                {item.onboardingOnly && progress && (
                  <span style={{ marginLeft:'auto', fontSize:10, background:'var(--c-purple)', color:'#fff', borderRadius:10, padding:'1px 6px' }}>
                    {progress.done}/{progress.total}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User footer */}
        <div style={{ padding:'12px 16px', borderTop:'0.5px solid var(--c-border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--c-purple)22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:500, color:'var(--c-purple)' }}>
              {user?.fullName?.slice(0,2).toUpperCase() || user?.email?.slice(0,2).toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.fullName || user?.email}</div>
              <div style={{ fontSize:10, color:'var(--c-text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{ width:'100%', fontSize:12, padding:'5px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'none', color:'var(--c-text2)', cursor:'pointer' }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex:1, padding:'2rem', overflowY:'auto', minHeight:'100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}
