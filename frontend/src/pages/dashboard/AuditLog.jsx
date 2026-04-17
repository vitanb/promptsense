import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { promptApi, orgApi, billingApi } from '../../services/api';
import { Card, Btn, Input, Select, Badge, Alert, PageHeader, Modal, MetricCard, Empty, Spinner, Toggle } from '../../components/UI';

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────
export function AuditLog() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.org_id;
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState({ provider:'', passed:'' });

  const load = async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    const params = { page, limit:25 };
    if (filters.provider) params.provider = filters.provider;
    if (filters.passed !== '') params.passed = filters.passed;
    try {
      const data = await promptApi.audit(orgId, params);
      setEvents(data.events || []); setTotal(data.total || 0);
    } catch (e) {
      setLoadError(e.response?.data?.error || 'Failed to load audit log. Check that your backend is deployed.');
      setEvents([]);
    }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [orgId, page, filters]);

  return (
    <div>
      <PageHeader title="Audit log" description={`${total.toLocaleString()} total events`}
        action={<Btn size="sm" variant="secondary" onClick={() => promptApi.exportCsv(orgId)}>Export CSV</Btn>} />

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:'1rem' }}>
        <select value={filters.provider} onChange={e => setFilters(f=>({...f,provider:e.target.value}))}
          style={{ fontSize:12, padding:'5px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)' }}>
          <option value="">All providers</option>
          {['anthropic','openai','azure','gemini','mistral','cohere','downstream'].map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filters.passed} onChange={e => setFilters(f=>({...f,passed:e.target.value}))}
          style={{ fontSize:12, padding:'5px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)' }}>
          <option value="">All status</option>
          <option value="true">Passed</option>
          <option value="false">Flagged</option>
        </select>
      </div>

      {loading ? <div style={{ display:'flex', justifyContent:'center', padding:'3rem' }}><Spinner /></div> : loadError ? (
        <div style={{ padding:'2rem', textAlign:'center' }}>
          <div style={{ color:'var(--c-red)', fontSize:14, marginBottom:8 }}>⚠ {loadError}</div>
          <button onClick={load} style={{ fontSize:12, padding:'6px 14px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', cursor:'pointer' }}>Retry</button>
        </div>
      ) : (
        <>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {events.map(e => (
              <div key={e.id} onClick={() => setSelected(selected?.id===e.id ? null : e)}
                style={{ padding:'9px 12px', borderRadius:'var(--radius)', cursor:'pointer', background:'var(--c-bg)', border: selected?.id===e.id ? '0.5px solid var(--c-border2)' : '0.5px solid var(--c-border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background: e.passed ? 'var(--c-green)' : 'var(--c-red)' }} />
                  <span style={{ fontSize:11, color:'var(--c-text3)', flexShrink:0 }}>{new Date(e.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                  <span style={{ fontSize:11, padding:'1px 5px', borderRadius:3, background:'var(--c-bg2)', color:'var(--c-text2)', flexShrink:0 }}>{e.provider}</span>
                  <span style={{ fontSize:12, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.input_text}</span>
                  <span style={{ fontSize:10, color:'var(--c-text3)', flexShrink:0 }}>{e.latency_ms}ms</span>
                  <div style={{ display:'flex', gap:3 }}>
                    {[...(e.input_flags||[]),...(e.output_flags||[])].slice(0,2).map(f=><Badge key={f} text={f.split(' ')[0]} color="var(--c-red)" small />)}
                  </div>
                </div>
                {selected?.id===e.id && (
                  <div style={{ marginTop:10, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, paddingTop:10, borderTop:'0.5px solid var(--c-border)' }}>
                    {[['Input',e.input_text,e.input_flags],['Output',e.output_text,e.output_flags]].map(([lbl,txt,flags])=>(
                      <div key={lbl}>
                        <div style={{ fontSize:10, color:'var(--c-text3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{lbl}</div>
                        <div style={{ fontSize:12, lineHeight:1.6, color:'var(--c-text)', wordBreak:'break-word' }}>{txt}</div>
                        {flags?.length>0 && <div style={{ display:'flex', gap:4, marginTop:5, flexWrap:'wrap' }}>{flags.map(f=><Badge key={f} text={f} color="var(--c-red)" small />)}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {events.length===0 && <Empty icon="📜" title="No events yet" description="Prompt activity will appear here once you start using the playground or API." />}
          </div>
          {total > 25 && (
            <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:'1rem' }}>
              <Btn size="sm" variant="secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Prev</Btn>
              <span style={{ fontSize:12, color:'var(--c-text2)', padding:'5px 8px' }}>Page {page} of {Math.ceil(total/25)}</span>
              <Btn size="sm" variant="secondary" disabled={page>=Math.ceil(total/25)} onClick={()=>setPage(p=>p+1)}>Next →</Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── MEMBERS ───────────────────────────────────────────────────────────────────
export function Members() {
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.org_id;
  const [members, setMembers] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ email:'', role:'user', department:'' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingDept, setEditingDept] = useState(null); // memberId being edited
  const [deptDraft, setDeptDraft] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null); // member object to confirm removal

  useEffect(() => { if (orgId) orgApi.members(orgId).then(setMembers).catch(()=>{}); }, [orgId]);

  const sendInvite = async () => {
    setError(''); setLoading(true);
    try {
      await orgApi.invite(orgId, invite);
      setSuccess(`Invitation sent to ${invite.email}`);
      setShowInvite(false); setInvite({ email:'', role:'user', department:'' });
    } catch (err) { setError(err.response?.data?.error||'Failed to send invite'); }
    finally { setLoading(false); }
  };

  const changeRole = async (memberId, role) => {
    await orgApi.updateRole(orgId, memberId, role);
    setMembers(ms => ms.map(m => m.id===memberId ? {...m,role} : m));
  };

  const startEditDept = (m) => {
    setEditingDept(m.id);
    setDeptDraft(m.department || '');
  };

  const saveDept = async (memberId) => {
    try {
      await orgApi.updateDepartment(orgId, memberId, deptDraft);
      setMembers(ms => ms.map(m => m.id===memberId ? {...m, department: deptDraft || null} : m));
    } catch (e) { /* silent */ }
    finally { setEditingDept(null); }
  };

  const remove = async (memberId) => {
    await orgApi.removeMember(orgId, memberId);
    setMembers(ms => ms.map(m => m.id===memberId ? {...m,active:false} : m));
    setConfirmRemove(null);
  };

  const ROLE_COLORS = { user:'#378ADD', developer:'#BA7517', administrator:'#7F77DD' };

  return (
    <div>
      <PageHeader title="Team members" description={`${members.filter(m=>m.active).length} active members`}
        action={can('administrator') && <Btn size="sm" onClick={() => setShowInvite(true)}>+ Invite member</Btn>} />

      <Alert type="success" message={success} />

      {/* Confirm remove modal */}
      <Modal open={!!confirmRemove} onClose={()=>setConfirmRemove(null)} title="Remove member">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <p style={{ fontSize:13, color:'var(--c-text2)', margin:0 }}>
            Remove <strong>{confirmRemove?.full_name || confirmRemove?.email}</strong> from this organization? They will lose access immediately but their account won't be deleted.
          </p>
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="danger" onClick={() => remove(confirmRemove?.id)}>Yes, remove</Btn>
            <Btn variant="secondary" onClick={()=>setConfirmRemove(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={showInvite} onClose={()=>setShowInvite(false)} title="Invite team member">
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Alert type="error" message={error} />
          <Input label="Email address" type="email" value={invite.email} onChange={e=>setInvite(i=>({...i,email:e.target.value}))} placeholder="colleague@company.com" />
          <Select label="Role" value={invite.role} onChange={e=>setInvite(i=>({...i,role:e.target.value}))}>
            <option value="user">User — playground access only</option>
            <option value="developer">Developer — config + integrations</option>
            <option value="administrator">Administrator — full access</option>
          </Select>
          <Input label="Department (optional)" value={invite.department} onChange={e=>setInvite(i=>({...i,department:e.target.value}))} placeholder="e.g. Engineering, Sales, Support" />
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={sendInvite} loading={loading}>Send invite</Btn>
            <Btn variant="secondary" onClick={()=>setShowInvite(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {members.map(m => (
          <div key={m.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderRadius:'var(--radius)', background:'var(--c-bg)', border:'0.5px solid var(--c-border)', opacity:m.active?1:0.5 }}>
            {/* Avatar */}
            <div style={{ width:34, height:34, borderRadius:'50%', background:(ROLE_COLORS[m.role]||'#888')+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:500, color:ROLE_COLORS[m.role]||'#888', flexShrink:0 }}>
              {(m.full_name||m.email||'?').slice(0,2).toUpperCase()}
            </div>

            {/* Name / email */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.full_name||m.email}</div>
              <div style={{ fontSize:11, color:'var(--c-text2)' }}>{m.email} {m.last_login_at ? `· last login ${new Date(m.last_login_at).toLocaleDateString()}` : ''}</div>
            </div>

            {/* Department — inline edit for admins */}
            {can('administrator') ? (
              editingDept === m.id ? (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <input
                    autoFocus
                    value={deptDraft}
                    onChange={e => setDeptDraft(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter') saveDept(m.id); if (e.key==='Escape') setEditingDept(null); }}
                    placeholder="Department"
                    style={{ fontSize:11, padding:'4px 8px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-purple)', background:'var(--c-bg)', color:'var(--c-text)', width:120, outline:'none' }}
                  />
                  <button onClick={() => saveDept(m.id)} style={{ fontSize:11, padding:'4px 8px', borderRadius:'var(--radius)', background:'var(--c-purple)', color:'#fff', border:'none', cursor:'pointer' }}>✓</button>
                  <button onClick={() => setEditingDept(null)} style={{ fontSize:11, padding:'4px 8px', borderRadius:'var(--radius)', background:'var(--c-bg2)', color:'var(--c-text2)', border:'0.5px solid var(--c-border)', cursor:'pointer' }}>✕</button>
                </div>
              ) : (
                <button onClick={() => startEditDept(m)}
                  title="Click to set department"
                  style={{ fontSize:11, padding:'3px 8px', borderRadius:'var(--radius)', background: m.department ? 'var(--c-bg2)' : 'transparent', color: m.department ? 'var(--c-text2)' : 'var(--c-text3)', border:'0.5px dashed var(--c-border2)', cursor:'pointer', whiteSpace:'nowrap', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis' }}>
                  {m.department || '+ dept'}
                </button>
              )
            ) : (
              m.department && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'var(--c-bg2)', color:'var(--c-text2)' }}>{m.department}</span>
            )}

            {!m.active && <Badge text="Inactive" color="#888" small />}
            {m.invite_status==='pending' && <Badge text="Invited" color="var(--c-amber)" small />}

            {/* Role selector */}
            {can('administrator') ? (
              <select value={m.role} onChange={e=>changeRole(m.id, e.target.value)}
                style={{ fontSize:11, padding:'4px 8px', borderRadius:'var(--radius)', border:`0.5px solid ${ROLE_COLORS[m.role]||'#888'}55`, background:(ROLE_COLORS[m.role]||'#888')+'18', color:ROLE_COLORS[m.role]||'#888', cursor:'pointer', outline:'none' }}>
                {['user','developer','administrator'].map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
            ) : <Badge text={m.role} color={ROLE_COLORS[m.role]||'#888'} small />}

            {can('administrator') && m.active && (
              <Btn size="sm" variant="secondary" onClick={()=>setConfirmRemove(m)}>Remove</Btn>
            )}
          </div>
        ))}
      </div>

      {can('administrator') && members.length > 0 && (
        <p style={{ fontSize:11, color:'var(--c-text3)', marginTop:'0.75rem' }}>
          Tip: click <strong>+ dept</strong> next to a member to assign their department. Department data appears in Analytics → Departments.
        </p>
      )}
    </div>
  );
}

// ── BILLING ───────────────────────────────────────────────────────────────────
export function Billing() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.org_id;
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(null); // planName being checked out
  const [checkoutError, setCheckoutError] = useState('');
  const [stripeUnconfigured, setStripeUnconfigured] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([billingApi.get(orgId), billingApi.plans()])
      .then(([b, p]) => { setData(b); setPlans(p); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  const openPortal = async () => {
    setPortalLoading(true);
    setCheckoutError('');
    try {
      const { url } = await billingApi.portal(orgId);
      window.location.href = url;
    } catch (e) {
      const msg = e.response?.data?.error || 'Could not open billing portal. Please try again.';
      setCheckoutError(msg);
      if (e.response?.status === 503) setStripeUnconfigured(true);
    } finally {
      setPortalLoading(false);
    }
  };

  const checkout = async (planName) => {
    setCheckoutError('');
    setStripeUnconfigured(false);
    setCheckoutLoading(planName);
    try {
      const { url } = await billingApi.checkout(orgId, { planName });
      window.location.href = url;
    } catch (e) {
      const status = e.response?.status;
      const msg    = e.response?.data?.error;

      if (status === 503) {
        // Stripe not configured on the server at all
        setStripeUnconfigured(true);
        setCheckoutError(msg || 'Billing is not configured on this server.');
      } else if (status === 400) {
        setCheckoutError(msg || 'This plan is not available for purchase yet.');
      } else {
        setCheckoutError(msg || 'Checkout failed. Please try again or contact support.');
      }
    } finally {
      setCheckoutLoading(null);
    }
  };

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'4rem' }}><Spinner /></div>;

  const { org, invoices, paymentMethod, usage } = data || {};
  const currentPlan = plans.find(p => p.name === org?.plan_name);

  return (
    <div>
      <PageHeader title="Billing" description="Manage your subscription and payment details." />

      {/* Stripe not configured — admin setup instructions */}
      {stripeUnconfigured && (
        <div style={{ marginBottom:'1.5rem', padding:'16px 18px', borderRadius:'var(--radius)', background:'rgba(245,158,11,0.08)',
                      border:'1px solid rgba(245,158,11,0.25)', color:'#f59e0b' }}>
          <div style={{ fontWeight:600, marginBottom:6, fontSize:13 }}>⚠️ Stripe is not configured</div>
          <div style={{ fontSize:12, lineHeight:1.6, color:'var(--text2)' }}>
            To enable paid plan upgrades, add the following environment variables to your Render backend service:
          </div>
          <pre style={{ fontSize:11, marginTop:8, padding:'10px 12px', background:'rgba(245,158,11,0.05)', borderRadius:4,
                        overflowX:'auto', lineHeight:1.7, border:'1px solid rgba(245,158,11,0.15)', color:'#fcd34d' }}>
{`STRIPE_SECRET_KEY        = sk_live_...
STRIPE_PRICE_GROWTH      = price_...   (Growth plan price ID from Stripe)
STRIPE_PRICE_ENTERPRISE  = price_...   (Enterprise plan price ID from Stripe)
STRIPE_WEBHOOK_SECRET    = whsec_...   (from Stripe webhook settings)`}
          </pre>
          <div style={{ fontSize:11, marginTop:8, color:'#f59e0b' }}>
            Find these in your{' '}
            <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer"
               style={{ color:'#fcd34d', fontWeight:600 }}>Stripe dashboard → API keys</a>
            {' '}and{' '}
            <a href="https://dashboard.stripe.com/products" target="_blank" rel="noreferrer"
               style={{ color:'#fcd34d', fontWeight:600 }}>Products → Prices</a>.
          </div>
        </div>
      )}

      {/* Inline checkout error (non-503) */}
      {checkoutError && !stripeUnconfigured && (
        <div style={{ marginBottom:'1.5rem', padding:'12px 16px', borderRadius:'var(--radius)',
                      background:'var(--c-red)10', border:'0.5px solid var(--c-red)44', color:'var(--c-red)', fontSize:13 }}>
          {checkoutError}
        </div>
      )}

      <div style={{ display:'flex', gap:10, marginBottom:'1.5rem' }}>
        <MetricCard label="Current plan" value={org?.display_name || org?.plan_name || '—'} sub={org?.subscription_status} />
        <MetricCard label="Requests this month" value={(usage?.requests||0).toLocaleString()} sub={currentPlan?.requests_per_month===-1?'Unlimited':`of ${(currentPlan?.requests_per_month||0).toLocaleString()} limit`} />
        <MetricCard label="Tokens used" value={(usage?.tokens||0).toLocaleString()} />
        {paymentMethod && <MetricCard label="Payment method" value={`•••• ${paymentMethod.last4}`} sub={`${paymentMethod.brand} · ${paymentMethod.expMonth}/${paymentMethod.expYear}`} />}
      </div>

      {org?.stripe_customer_id && (
        <div style={{ marginBottom:'1.5rem' }}>
          <Btn onClick={openPortal} loading={portalLoading} variant="secondary">Manage billing →</Btn>
        </div>
      )}

      {/* Plans grid */}
      <Card style={{ marginBottom:'1.5rem' }}>
        <div style={{ fontSize:13, fontWeight:500, marginBottom:'1rem' }}>Available plans</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10 }}>
          {plans.map(plan => {
            const isCurrent = plan.name === org?.plan_name;
            const features = Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features||'[]');
            return (
              <div key={plan.name} style={{ border:`0.5px solid ${isCurrent?'var(--c-purple)':'var(--c-border)'}`, borderRadius:'var(--radius)', padding:'1rem', background: isCurrent?'var(--c-purple)08':'var(--c-bg)' }}>
                <div style={{ fontSize:12, fontWeight:600, color: isCurrent?'var(--c-purple)':'var(--c-text2)', marginBottom:4 }}>{plan.display_name}{isCurrent&&' ✓'}</div>
                <div style={{ fontSize:20, fontWeight:600, marginBottom:'0.75rem' }}>
                  {plan.price_monthly===0?'Free':plan.name==='enterprise'?'Custom':'$'+Math.round(plan.price_monthly/100)+'/mo'}
                </div>
                <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:4, marginBottom:'0.75rem' }}>
                  {features.map(f=><li key={f} style={{ fontSize:11, color:'var(--c-text2)' }}>✓ {f}</li>)}
                </ul>
                {!isCurrent && plan.name!=='enterprise' && plan.price_monthly>0 && (
                  <Btn size="sm" loading={checkoutLoading === plan.name}
                       style={{ width:'100%', justifyContent:'center' }}
                       onClick={() => checkout(plan.name)}>
                    Upgrade
                  </Btn>
                )}
                {plan.name==='enterprise' && !isCurrent && (
                  <a href="mailto:sales@promptsense.io" style={{ display:'block', textAlign:'center', fontSize:12, padding:'5px', color:'var(--c-purple)' }}>Contact sales</a>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Invoices */}
      {invoices?.length > 0 && (
        <Card>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:'1rem' }}>Invoice history</div>
          {invoices.map(inv => (
            <div key={inv.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'0.5px solid var(--c-border)', fontSize:13 }}>
              <span style={{ color:'var(--c-text2)' }}>{new Date(inv.date*1000).toLocaleDateString()}</span>
              <span>${(inv.amount/100).toFixed(2)}</span>
              <Badge text={inv.status} color={inv.status==='paid'?'var(--c-green)':'var(--c-red)'} small />
              {inv.url && <a href={inv.url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'var(--c-purple)' }}>Download</a>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ── Controlled number input that commits on blur ──────────────────────────────
function RetentionDaysInput({ value, disabled, onCommit }) {
  const [local, setLocal] = useState(value != null ? String(value) : '');
  useEffect(() => { setLocal(value != null ? String(value) : ''); }, [value]);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <input
        type="number" min={1} max={3650}
        value={local}
        disabled={disabled}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => onCommit(local === '' ? null : parseInt(local, 10) || null)}
        placeholder="∞"
        style={{ width:64, padding:'5px 8px', borderRadius:'var(--radius)',
                 border:'0.5px solid var(--c-border2)', background:'var(--c-bg)',
                 color:'var(--c-text)', fontSize:12, textAlign:'right',
                 opacity: disabled ? 0.5 : 1 }}
      />
      <span style={{ fontSize:11, color:'var(--c-text3)' }}>days</span>
    </div>
  );
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────
const TIMEZONES = ['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Paris','Europe/Berlin','Asia/Tokyo','Asia/Singapore','Asia/Dubai','Australia/Sydney'];

export function Settings() {
  const { currentOrg, orgDetail, setOrgDetail, can } = useOrg();
  const { deleteAccount } = useAuth();
  const orgId = currentOrg?.org_id;
  const [form, setForm] = useState({ name:'', billingEmail:'' });
  const [branding, setBranding] = useState({ logoUrl:'', primaryColor:'#7F77DD', customDomain:'', timezone:'UTC' });
  const [success, setSuccess] = useState('');
  const [brandingSuccess, setBrandingSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Privacy settings state ──
  const [privacy, setPrivacy] = useState({ store_prompts: true, mask_pii_in_logs: false, retention_days: null });
  const [privacySaving, setPrivacySaving] = useState(null); // which key is saving
  const [privacySuccess, setPrivacySuccess] = useState('');

  useEffect(() => {
    if (orgDetail) {
      setForm({ name: orgDetail.name||'', billingEmail: orgDetail.billing_email||'' });
      setBranding({
        logoUrl:      orgDetail.logo_url || '',
        primaryColor: orgDetail.primary_color || '#7F77DD',
        customDomain: orgDetail.custom_domain || '',
        timezone:     orgDetail.timezone || 'UTC',
      });
    }
  }, [orgDetail]);

  // Load privacy settings on mount
  useEffect(() => {
    if (!orgId) return;
    orgApi.getSettings(orgId).then(s => setPrivacy(s)).catch(() => {});
  }, [orgId]);

  const patchPrivacy = async (key, value) => {
    setPrivacySaving(key);
    setPrivacySuccess('');
    try {
      const updated = await orgApi.updateSettings(orgId, { [key]: value });
      setPrivacy(updated);
      setPrivacySuccess('Saved');
      setTimeout(() => setPrivacySuccess(''), 2000);
    } catch (e) { alert(e.response?.data?.error || 'Failed to save setting'); }
    finally { setPrivacySaving(null); }
  };

  const save = async () => {
    setLoading(true);
    try {
      const updated = await orgApi.update(orgId, form);
      setOrgDetail(o => ({ ...o, ...updated }));
      setSuccess('Settings saved');
    } catch (e) { alert(e.response?.data?.error || 'Failed to save'); }
    finally { setLoading(false); }
  };

  const saveBranding = async () => {
    setBrandingLoading(true);
    try {
      const updated = await orgApi.updateBranding(orgId, branding);
      setOrgDetail(o => ({ ...o, ...updated }));
      setBrandingSuccess('Branding saved');
    } catch (e) { alert(e.response?.data?.error || 'Failed to save branding'); }
    finally { setBrandingLoading(false); }
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');
    setDeleteLoading(true);
    try {
      await deleteAccount(deletePassword);
      window.location.href = '/auth/login';
    } catch (e) {
      setDeleteError(e.response?.data?.error || 'Failed to delete account. Check your password.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Organization settings and preferences." />
      <Card style={{ maxWidth:520 }}>
        <Alert type="success" message={success} />
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop: success?12:0 }}>
          <Input label="Organization name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} disabled={!can('administrator')} />
          <Input label="Billing email" type="email" value={form.billingEmail} onChange={e=>setForm(f=>({...f,billingEmail:e.target.value}))} disabled={!can('administrator')} />
          <div style={{ padding:'12px 14px', borderRadius:'var(--radius)', background:'var(--c-bg2)', fontSize:12, color:'var(--c-text2)' }}>
            <div style={{ marginBottom:4, fontWeight:500 }}>SDK proxy endpoint</div>
            <code style={{ fontFamily:'monospace', fontSize:11 }}>https://api.promptsense.io/proxy/v1/messages</code>
            <div style={{ marginTop:6 }}>Use your API key in the <code style={{ fontFamily:'monospace', fontSize:11 }}>X-PromptSense-Key</code> header.</div>
          </div>
          {can('administrator') && <Btn onClick={save} loading={loading} style={{ alignSelf:'flex-start' }}>Save changes</Btn>}
        </div>
      </Card>

      {/* ── Branding ── */}
      {can('administrator') && (
        <Card style={{ maxWidth:520, marginTop:'1.5rem' }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:'1rem' }}>Tenant branding</div>
          <Alert type="success" message={brandingSuccess} />
          <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop: brandingSuccess?12:0 }}>
            {/* Color picker */}
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <label style={{ fontSize:11, color:'var(--c-text2)', fontWeight:500 }}>Primary color</label>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input type="color" value={branding.primaryColor}
                  onChange={e => setBranding(b => ({ ...b, primaryColor: e.target.value }))}
                  style={{ width:36, height:36, borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', cursor:'pointer', padding:2 }} />
                <input type="text" value={branding.primaryColor}
                  onChange={e => setBranding(b => ({ ...b, primaryColor: e.target.value }))}
                  style={{ fontSize:12, padding:'6px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', width:100, fontFamily:'monospace', outline:'none' }} />
                <div style={{ width:24, height:24, borderRadius:'50%', background:branding.primaryColor }} />
              </div>
            </div>

            <Input label="Logo URL" value={branding.logoUrl} onChange={e => setBranding(b => ({ ...b, logoUrl: e.target.value }))} placeholder="https://cdn.yourcompany.com/logo.png" />

            {branding.logoUrl && (
              <div style={{ padding:'8px 12px', background:'var(--c-bg2)', borderRadius:'var(--radius)', display:'flex', alignItems:'center', gap:8 }}>
                <img src={branding.logoUrl} alt="Logo preview" style={{ height:28, objectFit:'contain', maxWidth:120 }} onError={e => { e.target.style.display='none'; }} />
                <span style={{ fontSize:11, color:'var(--c-text3)' }}>Logo preview</span>
              </div>
            )}

            <Input label="Custom domain (optional)" value={branding.customDomain} onChange={e => setBranding(b => ({ ...b, customDomain: e.target.value }))} placeholder="ai.yourcompany.com" />

            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:11, color:'var(--c-text2)', fontWeight:500 }}>Timezone</label>
              <select value={branding.timezone} onChange={e => setBranding(b => ({ ...b, timezone: e.target.value }))}
                style={{ fontSize:12, padding:'7px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', outline:'none' }}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>

            <Btn onClick={saveBranding} loading={brandingLoading} style={{ alignSelf:'flex-start' }}>Save branding</Btn>
          </div>
        </Card>
      )}

      {/* ── Privacy & Data ── */}
      <Card style={{ maxWidth:520, marginTop:'1.5rem' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
          <div style={{ fontSize:13, fontWeight:600 }}>Privacy &amp; Data Retention</div>
          {privacySuccess && <span style={{ fontSize:11, color:'var(--c-green)' }}>✓ {privacySuccess}</span>}
        </div>

        {/* Store prompt text */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, paddingBottom:14, marginBottom:14, borderBottom:'0.5px solid var(--c-border)' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:3 }}>Store prompt &amp; response text</div>
            <div style={{ fontSize:12, color:'var(--c-text2)', lineHeight:1.55 }}>
              {privacy.store_prompts !== false
                ? 'Full prompt and response text is saved to the audit log for search, replay, and export.'
                : 'Prompt and response text is discarded after guardrail evaluation. Audit rows still record flags, latency, and tokens — only the text content is suppressed.'}
            </div>
            {privacy.store_prompts === false && (
              <div style={{ marginTop:6, fontSize:11, padding:'3px 8px', borderRadius:4, display:'inline-block',
                            background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)', color:'#f59e0b' }}>
                ⚠️ Audit log will show "[not stored]" — text cannot be recovered retroactively
              </div>
            )}
          </div>
          <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6, paddingTop:2 }}>
            {privacySaving === 'store_prompts' && <Spinner size={13} />}
            <Toggle
              checked={privacy.store_prompts !== false}
              onChange={v => can('administrator') && patchPrivacy('store_prompts', v)}
              disabled={!can('administrator') || privacySaving === 'store_prompts'}
            />
          </div>
        </div>

        {/* Mask PII in logs */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, paddingBottom:14, marginBottom:14, borderBottom:'0.5px solid var(--c-border)' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:3 }}>Mask PII in audit log display</div>
            <div style={{ fontSize:12, color:'var(--c-text2)', lineHeight:1.55 }}>
              Emails, phone numbers, and card patterns shown as ████ in the UI. Raw text in the database is unchanged.
            </div>
          </div>
          <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6, paddingTop:2 }}>
            {privacySaving === 'mask_pii_in_logs' && <Spinner size={13} />}
            <Toggle
              checked={!!privacy.mask_pii_in_logs}
              onChange={v => can('administrator') && patchPrivacy('mask_pii_in_logs', v)}
              disabled={!can('administrator') || privacySaving === 'mask_pii_in_logs'}
            />
          </div>
        </div>

        {/* Retention period */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:3 }}>Audit log retention</div>
            <div style={{ fontSize:12, color:'var(--c-text2)', lineHeight:1.55 }}>
              Auto-delete audit events older than N days. Leave blank to retain forever.
            </div>
          </div>
          <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
            {privacySaving === 'retention_days' && <Spinner size={13} />}
            <RetentionDaysInput
              value={privacy.retention_days}
              disabled={!can('administrator') || privacySaving === 'retention_days'}
              onCommit={val => patchPrivacy('retention_days', val)}
            />
          </div>
        </div>

        {!can('administrator') && (
          <div style={{ marginTop:10, fontSize:11, color:'var(--c-text3)' }}>
            Administrator role required to change privacy settings.
          </div>
        )}
      </Card>

      {/* ── Danger Zone ── */}
      <div style={{ maxWidth:520, marginTop:'2rem', border:'0.5px solid var(--c-red)44', borderRadius:'var(--radius)', overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', background:'var(--c-red)0D', borderBottom:'0.5px solid var(--c-red)44' }}>
          <span style={{ fontSize:12, fontWeight:600, color:'var(--c-red)', letterSpacing:'0.04em', textTransform:'uppercase' }}>Danger zone</span>
        </div>
        <div style={{ padding:'14px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:500 }}>Delete my account</div>
            <div style={{ fontSize:11, color:'var(--c-text2)', marginTop:2 }}>Permanently remove your account and all associated data. This cannot be undone.</div>
          </div>
          <Btn size="sm" variant="danger" onClick={() => { setDeletePassword(''); setDeleteError(''); setShowDeleteModal(true); }}>
            Delete account
          </Btn>
        </div>
      </div>

      {/* Delete account confirmation modal */}
      <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete your account">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <p style={{ fontSize:13, color:'var(--c-text2)', margin:0 }}>
            This will <strong>permanently delete</strong> your account, revoke all sessions, and remove you from all organizations. This action cannot be undone.
          </p>
          <Alert type="error" message={deleteError} />
          <Input
            label="Confirm your password"
            type="password"
            value={deletePassword}
            onChange={e => setDeletePassword(e.target.value)}
            placeholder="Enter your current password"
            onKeyDown={e => e.key === 'Enter' && deletePassword && handleDeleteAccount()}
          />
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="danger" onClick={handleDeleteAccount} loading={deleteLoading} disabled={!deletePassword}>
              Yes, permanently delete
            </Btn>
            <Btn variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── API KEYS ──────────────────────────────────────────────────────────────────
const EXPIRY_OPTIONS = [
  { label: 'No expiry',   value: '' },
  { label: '7 days',      value: '7d' },
  { label: '30 days',     value: '30d' },
  { label: '90 days',     value: '90d' },
  { label: '1 year',      value: '365d' },
  { label: 'Custom date', value: 'custom' },
];

export function ApiKeys() {
  const { currentOrg, can, isSuperuser } = useOrg();
  const orgId = currentOrg?.org_id;

  const [keys, setKeys]               = useState([]);
  const [downstreams, setDownstreams] = useState([]);
  const [showCreate, setShowCreate]   = useState(false);
  const [newKey, setNewKey]           = useState('');
  const [name, setName]               = useState('');
  const [expiryPreset, setExpiryPreset] = useState('');
  const [customDate, setCustomDate]   = useState('');
  const [downstreamId, setDownstreamId] = useState('');
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    if (!orgId) return;
    orgApi.apiKeys(orgId).then(setKeys).catch(() => {});
    orgApi.downstreams(orgId).then(setDownstreams).catch(() => {});
  }, [orgId]);

  const resolvedExpiry = () => {
    if (!expiryPreset) return null;
    if (expiryPreset === 'custom') return customDate ? new Date(customDate).toISOString() : null;
    const d = new Date();
    d.setDate(d.getDate() + parseInt(expiryPreset));
    return d.toISOString();
  };

  const resetForm = () => { setName(''); setExpiryPreset(''); setCustomDate(''); setDownstreamId(''); };

  const create = async () => {
    setLoading(true);
    try {
      const expiresAt = resolvedExpiry();
      const { key, prefix } = await orgApi.createApiKey(orgId, {
        name, expiresAt, downstreamId: downstreamId || null,
      });
      const ds = downstreams.find(d => d.id === downstreamId);
      setNewKey(key);
      setKeys(ks => [...ks, {
        key_prefix: prefix, name, created_at: new Date().toISOString(),
        expires_at: expiresAt, revoked: false,
        downstream_system_id: downstreamId || null,
        downstream_name: ds?.name || null,
        downstream_url: ds?.endpoint_url || null,
        downstream_enabled: ds?.enabled ?? null,
      }]);
      resetForm();
      setShowCreate(false);
    } catch (e) { alert(e.response?.data?.error || 'Failed to create key'); }
    finally { setLoading(false); }
  };

  const revoke = async (id) => {
    await orgApi.revokeApiKey(orgId, id);
    setKeys(ks => ks.map(k => k.id === id ? { ...k, revoked: true } : k));
  };

  const deleteKey = async (id) => {
    if (!window.confirm('Permanently delete this API key? This cannot be undone.')) return;
    try {
      await orgApi.deleteApiKey(orgId, id);
      setKeys(ks => ks.filter(k => k.id !== id));
    } catch (e) { alert(e.response?.data?.error || 'Failed to delete key'); }
  };

  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div>
      <PageHeader title="API Keys" description="Keys for authenticating SDK and proxy requests. Each key can route to a specific downstream connection."
        action={can('developer') && <Btn size="sm" onClick={() => { setShowCreate(true); resetForm(); }}>+ New key</Btn>} />

      {/* Newly created key — shown once */}
      {newKey && (
        <div style={{ padding: '1rem', borderRadius: 'var(--radius)', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', marginBottom: '1rem' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#22c55e', marginBottom: 6 }}>✓ Key created — copy it now, it won't be shown again</div>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all', color: 'var(--text)' }}>{newKey}</code>
          <div style={{ marginTop: 8 }}>
            <Btn size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(newKey)}>Copy to clipboard</Btn>
          </div>
        </div>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); resetForm(); }} title="Create API key">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input label="Key name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production backend" />

          {/* Downstream connection picker */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
              Downstream connection
            </label>
            {downstreams.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: '10px 12px', borderRadius: 'var(--radius)', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                No downstream connections configured.{' '}
                <a href="#" onClick={e => { e.preventDefault(); setShowCreate(false); }} style={{ color: 'var(--accent-light)' }}>
                  Create one on the Downstream page first.
                </a>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* "None" option */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--radius)', border: `1px solid ${downstreamId === '' ? 'var(--accent-mid)' : 'var(--border)'}`, background: downstreamId === '' ? 'var(--accent-dim)' : 'var(--bg4)', cursor: 'pointer' }}>
                  <input type="radio" name="ds" value="" checked={downstreamId === ''} onChange={() => setDownstreamId('')} style={{ accentColor: 'var(--accent-mid)' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>No downstream</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Requests go directly to the configured LLM provider</div>
                  </div>
                </label>
                {downstreams.map(ds => (
                  <label key={ds.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--radius)', border: `1px solid ${downstreamId === ds.id ? 'var(--accent-mid)' : 'var(--border)'}`, background: downstreamId === ds.id ? 'var(--accent-dim)' : 'var(--bg4)', cursor: 'pointer', opacity: ds.enabled ? 1 : 0.6 }}>
                    <input type="radio" name="ds" value={ds.id} checked={downstreamId === ds.id} onChange={() => setDownstreamId(ds.id)} style={{ accentColor: 'var(--accent-mid)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{ds.name}</span>
                        {!ds.enabled && <Badge text="Disabled" color="#71717a" small />}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ds.endpoint_url}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Expiry picker */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>Expiry</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {EXPIRY_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setExpiryPreset(opt.value)} style={{
                  padding: '7px 0', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  border: expiryPreset === opt.value ? '1px solid var(--accent-mid)' : '1px solid var(--border)',
                  background: expiryPreset === opt.value ? 'var(--accent-dim)' : 'var(--bg4)',
                  color: expiryPreset === opt.value ? 'var(--accent-light)' : 'var(--text2)',
                  transition: 'all .15s',
                }}>{opt.label}</button>
              ))}
            </div>
          </div>

          {expiryPreset === 'custom' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>Select date</label>
              <input type="date" value={customDate} min={minDate} onChange={e => setCustomDate(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg4)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
            <Btn onClick={create} loading={loading} disabled={!name.trim() || (expiryPreset === 'custom' && !customDate)}>
              Create key
            </Btn>
            <Btn variant="secondary" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      {/* Key list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {keys.map((k, i) => {
          const expired = k.expires_at && new Date(k.expires_at) < new Date();
          return (
            <div key={k.id || i} style={{ borderRadius: 'var(--radius)', background: 'var(--bg4)', border: '1px solid var(--border)', overflow: 'hidden', opacity: (k.revoked || expired) ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{k.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text2)' }}>{k.key_prefix}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>Created {new Date(k.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {k.expires_at ? (
                      <span style={{ color: expired ? '#ef4444' : 'var(--text3)' }}>
                        {expired ? '⚠ Expired' : '⏱'}{' '}
                        {new Date(k.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {!expired && ` (${Math.ceil((new Date(k.expires_at) - new Date()) / 86400000)}d left)`}
                      </span>
                    ) : <span>No expiry</span>}
                    {k.last_used_at && <span>Last used {new Date(k.last_used_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {k.revoked && <Badge text="Revoked" color="#888" small />}
                  {!k.revoked && expired && <Badge text="Expired" color="#ef4444" small />}
                  {!k.revoked && !expired && can('developer') && (
                    <Btn size="sm" variant="danger" onClick={() => revoke(k.id)}>Revoke</Btn>
                  )}
                  {k.revoked && isSuperuser && (
                    <Btn size="sm" variant="danger" onClick={() => deleteKey(k.id)}>Delete</Btn>
                  )}
                </div>
              </div>

              {/* Downstream connection badge */}
              <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {k.downstream_system_id ? (
                  <>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: k.downstream_enabled ? '#22c55e' : '#71717a', boxShadow: k.downstream_enabled ? '0 0 5px rgba(34,197,94,0.5)' : 'none', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                      Routes to: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{k.downstream_name}</strong>
                      {!k.downstream_enabled && <span style={{ color: '#f59e0b', marginLeft: 6 }}>⚠ downstream is disabled</span>}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {k.downstream_url}
                    </span>
                  </>
                ) : (
                  <>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text3)', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>No downstream — routes directly to LLM provider</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {keys.length === 0 && (
          <Empty icon="🔑" title="No API keys yet" description="Create a key to authenticate SDK calls to the PromptSense proxy."
            action={can('developer') && <Btn size="sm" onClick={() => setShowCreate(true)}>+ New key</Btn>} />
        )}
      </div>
    </div>
  );
}

export default AuditLog;
