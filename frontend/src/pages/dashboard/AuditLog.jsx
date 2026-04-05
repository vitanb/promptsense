import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { promptApi, orgApi, billingApi } from '../../services/api';
import { Card, Btn, Input, Select, Badge, Alert, PageHeader, Modal, MetricCard, Empty, Spinner } from '../../components/UI';

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────
export function AuditLog() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.org_id;
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ provider:'', passed:'' });

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const params = { page, limit:25 };
    if (filters.provider) params.provider = filters.provider;
    if (filters.passed !== '') params.passed = filters.passed;
    try {
      const data = await promptApi.audit(orgId, params);
      setEvents(data.events || []); setTotal(data.total || 0);
    } catch (e) { setEvents([]); }
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

      {loading ? <div style={{ display:'flex', justifyContent:'center', padding:'3rem' }}><Spinner /></div> : (
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
  const { currentOrg, orgDetail } = useOrg();
  const orgId = currentOrg?.org_id;
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([billingApi.get(orgId), billingApi.plans()])
      .then(([b, p]) => { setData(b); setPlans(p); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  const openPortal = async () => {
    setPortalLoading(true);
    try { const { url } = await billingApi.portal(orgId); window.location.href = url; }
    catch (e) { alert('Could not open billing portal. Please try again.'); }
    finally { setPortalLoading(false); }
  };

  const checkout = async (planName) => {
    try { const { url } = await billingApi.checkout(orgId, { planName }); window.location.href = url; }
    catch (e) { alert(e.response?.data?.error || 'Checkout failed'); }
  };

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'4rem' }}><Spinner /></div>;

  const { org, invoices, paymentMethod, usage } = data || {};
  const currentPlan = plans.find(p => p.name === org?.plan_name);

  return (
    <div>
      <PageHeader title="Billing" description="Manage your subscription and payment details." />

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
                  <Btn size="sm" style={{ width:'100%', justifyContent:'center' }} onClick={()=>checkout(plan.name)}>Upgrade</Btn>
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
export function ApiKeys() {
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.org_id;
  const [keys, setKeys] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (orgId) orgApi.apiKeys(orgId).then(setKeys).catch(()=>{}); }, [orgId]);

  const create = async () => {
    setLoading(true);
    try {
      const { key, prefix } = await orgApi.createApiKey(orgId, { name });
      setNewKey(key);
      setKeys(ks => [...ks, { key_prefix:prefix, name, created_at:new Date().toISOString(), revoked:false }]);
      setName('');
    } catch (e) { alert(e.response?.data?.error||'Failed to create key'); }
    finally { setLoading(false); }
  };

  const revoke = async (id) => {
    await orgApi.revokeApiKey(orgId, id);
    setKeys(ks => ks.map(k => k.id===id ? {...k,revoked:true} : k));
  };

  return (
    <div>
      <PageHeader title="API keys" description="Keys for authenticating SDK and proxy requests."
        action={can('developer') && <Btn size="sm" onClick={()=>setShowCreate(true)}>+ New key</Btn>} />

      {newKey && (
        <div style={{ padding:'1rem', borderRadius:'var(--radius)', background:'var(--c-green)12', border:'0.5px solid var(--c-green)44', marginBottom:'1rem' }}>
          <div style={{ fontSize:12, fontWeight:500, color:'var(--c-green)', marginBottom:6 }}>✓ Key created — copy it now, it won't be shown again</div>
          <code style={{ fontFamily:'monospace', fontSize:12, wordBreak:'break-all' }}>{newKey}</code>
          <div style={{ marginTop:8 }}>
            <Btn size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(newKey); }}>Copy to clipboard</Btn>
          </div>
        </div>
      )}

      <Modal open={showCreate} onClose={()=>setShowCreate(false)} title="Create API key">
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Input label="Key name" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Production backend" />
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={create} loading={loading} disabled={!name.trim()}>Create key</Btn>
            <Btn variant="secondary" onClick={()=>setShowCreate(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {keys.map((k,i) => (
          <div key={k.id||i} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderRadius:'var(--radius)', background:'var(--c-bg)', border:'0.5px solid var(--c-border)', opacity:k.revoked?0.5:1 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:2 }}>{k.name}</div>
              <div style={{ fontFamily:'monospace', fontSize:12, color:'var(--c-text2)' }}>{k.key_prefix}</div>
              <div style={{ fontSize:10, color:'var(--c-text3)', marginTop:2 }}>
                Created {new Date(k.created_at).toLocaleDateString()}
                {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
              </div>
            </div>
            {k.revoked ? <Badge text="Revoked" color="#888" small /> : (
              can('developer') && <Btn size="sm" variant="danger" onClick={() => revoke(k.id)}>Revoke</Btn>
            )}
          </div>
        ))}
        {keys.length===0 && <Empty icon="🔑" title="No API keys yet" description="Create a key to authenticate SDK calls to the PromptSense proxy." action={can('developer')&&<Btn size="sm" onClick={()=>setShowCreate(true)}>+ New key</Btn>}/>}
      </div>
    </div>
  );
}

export default AuditLog;
