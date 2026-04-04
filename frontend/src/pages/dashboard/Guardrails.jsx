import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { configApi } from '../../services/api';
import { Card, Btn, Input, Select, Toggle, Alert, Badge, PageHeader, Modal, Empty } from '../../components/UI';

const SEVERITY_COLORS = { critical:'#E24B4A', high:'#D85A30', medium:'#BA7517', low:'#639922' };

// ── GUARDRAILS ────────────────────────────────────────────────────────────────
export function Guardrails() {
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.org_id;
  const [guardrails, setGuardrails] = useState([]);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState('');
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState(null);

  useEffect(() => { if (orgId) configApi.guardrails(orgId).then(setGuardrails).catch(() => {}); }, [orgId]);

  const toggle = async (g) => {
    const updated = await configApi.updateGuardrail(orgId, g.id, { enabled: !g.enabled });
    setGuardrails(gs => gs.map(x => x.id === updated.id ? updated : x));
  };

  const save = async () => {
    setError('');
    try {
      let updated;
      if (editing === 'new') { updated = await configApi.createGuardrail(orgId, draft); setGuardrails(gs => [...gs, updated]); }
      else { updated = await configApi.updateGuardrail(orgId, editing, draft); setGuardrails(gs => gs.map(x => x.id === updated.id ? updated : x)); }
      setEditing(null);
    } catch (err) { setError(err.response?.data?.error || 'Failed to save'); }
  };

  const testPattern = () => {
    if (!draft.pattern) return;
    try { setTestResult(new RegExp(draft.pattern, 'i').test(testInput) ? 'match' : 'no-match'); }
    catch (e) { setTestResult('invalid'); }
  };

  const openEdit = (g) => { setDraft(g || { name:'', description:'', type:'both', severity:'medium', action:'block', pattern:'', color:'#7F77DD', enabled:true }); setEditing(g?.id || 'new'); setError(''); setTestInput(''); setTestResult(null); };

  return (
    <div>
      <PageHeader title="Guardrails" description="Configure input and output guardrail rules."
        action={can('developer') && <Btn size="sm" onClick={() => openEdit(null)}>+ New guardrail</Btn>} />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New guardrail' : 'Edit guardrail'} width={520}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Alert type="error" message={error} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Input label="Name" value={draft.name||''} onChange={e => setDraft(d=>({...d,name:e.target.value}))} />
            <Select label="Type" value={draft.type||'both'} onChange={e => setDraft(d=>({...d,type:e.target.value}))}><option value="input">Input</option><option value="output">Output</option><option value="both">Both</option></Select>
            <Select label="Severity" value={draft.severity||'medium'} onChange={e => setDraft(d=>({...d,severity:e.target.value}))}>{Object.keys(SEVERITY_COLORS).map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}</Select>
            <Select label="Action" value={draft.action||'block'} onChange={e => setDraft(d=>({...d,action:e.target.value}))}><option value="block">Block</option><option value="warn">Warn</option><option value="log">Log</option></Select>
          </div>
          <Input label="Description" value={draft.description||''} onChange={e => setDraft(d=>({...d,description:e.target.value}))} />
          <Input label="Regex pattern" value={draft.pattern||''} onChange={e => { setDraft(d=>({...d,pattern:e.target.value})); setTestResult(null); }} placeholder="e.g. \bconfidential\b" style={{ fontFamily:'monospace' }} />
          {draft.pattern && (
            <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
              <Input label="Test input" value={testInput} onChange={e=>setTestInput(e.target.value)} style={{ flex:1 }} />
              <Btn size="sm" variant="secondary" onClick={testPattern}>Test</Btn>
            </div>
          )}
          {testResult && <Alert type={testResult==='match'?'error':testResult==='no-match'?'success':'warning'} message={testResult==='match'?'✓ Pattern matches — rule would fire':testResult==='no-match'?'✗ No match':' Invalid regex'} />}
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <Btn onClick={save}>Save guardrail</Btn>
            <Btn variant="secondary" onClick={() => setEditing(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      {['input','output'].map(dir => (
        <div key={dir} style={{ marginBottom:'1.5rem' }}>
          <div style={{ fontSize:11, fontWeight:500, color:'var(--c-text3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{dir} guardrails</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {guardrails.filter(g => g.type===dir||g.type==='both').map(g => (
              <div key={g.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:'var(--radius)', background:'var(--c-bg)', border:'0.5px solid var(--c-border)', opacity:g.enabled?1:0.55 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:g.color||'#7F77DD', flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                    <span style={{ fontSize:13, fontWeight:500 }}>{g.name}</span>
                    <Badge text={g.severity} color={SEVERITY_COLORS[g.severity]||'#888'} small />
                    <Badge text={g.action} color="var(--c-text3)" small />
                  </div>
                  <div style={{ fontSize:11, color:'var(--c-text2)' }}>{g.description}</div>
                </div>
                {can('developer') && <Btn size="sm" variant="secondary" onClick={() => openEdit(g)}>Edit</Btn>}
                <Toggle checked={g.enabled} size={28} onChange={() => can('developer') && toggle(g)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── POLICIES ─────────────────────────────────────────────────────────────────
export function Policies() {
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.org_id;
  const [policies, setPolicies] = useState([]);
  const [guardrails, setGuardrails] = useState([]);

  useEffect(() => {
    if (!orgId) return;
    configApi.policies(orgId).then(setPolicies).catch(()=>{});
    configApi.guardrails(orgId).then(setGuardrails).catch(()=>{});
  }, [orgId]);

  const activate = async (id) => {
    await configApi.updatePolicy(orgId, id, { isActive: true });
    setPolicies(ps => ps.map(p => ({ ...p, is_active: p.id === id })));
  };

  const gMap = Object.fromEntries(guardrails.map(g => [g.id, g]));

  return (
    <div>
      <PageHeader title="Policies" description="Manage guardrail policy sets applied to all traffic." />
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {policies.map(p => (
          <Card key={p.id}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                  <span style={{ fontSize:14, fontWeight:500 }}>{p.name}</span>
                  {p.is_active && <Badge text="Active" color="var(--c-green)" />}
                </div>
                <div style={{ fontSize:12, color:'var(--c-text2)', marginBottom:8 }}>{p.description}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {(p.guardrail_ids||[]).map(gid => {
                    const g = gMap[gid];
                    return g ? <Badge key={gid} text={g.name} color={g.color||'#888'} small /> : null;
                  })}
                </div>
              </div>
              {can('developer') && !p.is_active && (
                <Btn size="sm" variant="secondary" onClick={() => activate(p.id)}>Activate</Btn>
              )}
            </div>
          </Card>
        ))}
        {policies.length === 0 && <Empty icon="📋" title="No policies yet" description="Create a policy set to group guardrails for different use cases." />}
      </div>
    </div>
  );
}

// ── TEMPLATES ────────────────────────────────────────────────────────────────
export function Templates() {
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.org_id;
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState('');

  useEffect(() => { if (orgId) configApi.templates(orgId).then(setTemplates).catch(()=>{}); }, [orgId]);

  const save = async () => {
    setError('');
    try {
      if (editing === 'new') { const t = await configApi.createTemplate(orgId, { name:draft.name, category:draft.category, prompt:draft.prompt, isFavorite:draft.is_favorite }); setTemplates(ts=>[...ts,t]); }
      else { const t = await configApi.updateTemplate(orgId, editing, { name:draft.name, category:draft.category, prompt:draft.prompt, isFavorite:draft.is_favorite }); setTemplates(ts=>ts.map(x=>x.id===t.id?t:x)); }
      setEditing(null);
    } catch (err) { setError(err.response?.data?.error || 'Failed to save'); }
  };

  const del = async (id) => {
    await configApi.deleteTemplate(orgId, id).catch(()=>{});
    setTemplates(ts => ts.filter(t => t.id !== id));
    setEditing(null);
  };

  const openEdit = (t) => { setDraft(t || { name:'', category:'General', prompt:'', is_favorite:false }); setEditing(t?.id||'new'); setError(''); };

  const filtered = templates.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.prompt.toLowerCase().includes(search.toLowerCase()));
  const categories = [...new Set(filtered.map(t => t.category))];

  return (
    <div>
      <PageHeader title="Templates" description="Reusable prompt templates for your team."
        action={can('developer') && <Btn size="sm" onClick={() => openEdit(null)}>+ New template</Btn>} />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing==='new'?'New template':'Edit template'} width={540}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Alert type="error" message={error} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Input label="Name" value={draft.name||''} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} />
            <Input label="Category" value={draft.category||''} onChange={e=>setDraft(d=>({...d,category:e.target.value}))} placeholder="e.g. Development" />
          </div>
          <div>
            <label style={{ fontSize:11, color:'var(--c-text2)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:4 }}>Prompt</label>
            <textarea value={draft.prompt||''} onChange={e=>setDraft(d=>({...d,prompt:e.target.value}))} rows={7} style={{ width:'100%', padding:'8px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', fontSize:13, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box', lineHeight:1.6 }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Toggle checked={!!draft.is_favorite} size={26} onChange={()=>setDraft(d=>({...d,is_favorite:!d.is_favorite}))}/>
            <span style={{ fontSize:12, color:'var(--c-text2)' }}>Show in playground quick-insert bar</span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={save}>Save</Btn>
            <Btn variant="secondary" onClick={()=>setEditing(null)}>Cancel</Btn>
            {editing!=='new'&&<Btn variant="danger" style={{marginLeft:'auto'}} onClick={()=>del(editing)}>Delete</Btn>}
          </div>
        </div>
      </Modal>

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search templates…"
        style={{ width:260, padding:'7px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', fontSize:13, marginBottom:'1.5rem' }} />

      {categories.map(cat => (
        <div key={cat} style={{ marginBottom:'1.5rem' }}>
          <div style={{ fontSize:11, fontWeight:500, color:'var(--c-text3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{cat}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {filtered.filter(t=>t.category===cat).map(t => (
              <Card key={t.id}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:13, fontWeight:500 }}>{t.name}</span>
                  {t.is_favorite && <span style={{ fontSize:12, color:'#BA7517' }}>★</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--c-text2)', lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', marginBottom:10 }}>{t.prompt}</div>
                <div style={{ display:'flex', gap:6 }}>
                  <Btn size="sm" style={{ flex:1, justifyContent:'center' }} onClick={()=>{ sessionStorage.setItem('ps_template_prompt', t.prompt); window.location.href='/dashboard/playground'; }}>Use</Btn>
                  {can('developer') && <Btn size="sm" variant="secondary" onClick={()=>openEdit(t)}>Edit</Btn>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
      {filtered.length===0&&<Empty icon="📄" title="No templates found" description="Create your first prompt template to speed up testing." action={can('developer')&&<Btn size="sm" onClick={()=>openEdit(null)}>+ New template</Btn>}/>}
    </div>
  );
}

// ── WEBHOOKS ─────────────────────────────────────────────────────────────────
export function Webhooks() {
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.org_id;
  const [webhooks, setWebhooks] = useState([]);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState('');

  useEffect(() => { if (orgId) configApi.webhooks(orgId).then(setWebhooks).catch(()=>{}); }, [orgId]);

  const save = async () => {
    setError('');
    try {
      if (editing==='new') { const w = await configApi.createWebhook(orgId, { name:draft.name, url:draft.url, events:draft.events||[], active:draft.active??true }); setWebhooks(ws=>[...ws,w]); }
      else { const w = await configApi.updateWebhook(orgId, editing, draft); setWebhooks(ws=>ws.map(x=>x.id===w.id?w:x)); }
      setEditing(null);
    } catch (err) { setError(err.response?.data?.error||'Failed to save'); }
  };

  const del = async (id) => { await configApi.deleteWebhook(orgId, id).catch(()=>{}); setWebhooks(ws=>ws.filter(w=>w.id!==id)); setEditing(null); };
  const toggleWh = async (w) => { const u = await configApi.updateWebhook(orgId, w.id, { active:!w.active }); setWebhooks(ws=>ws.map(x=>x.id===u.id?u:x)); };
  const openEdit = (w) => { setDraft(w||{name:'',url:'',events:[],active:true}); setEditing(w?.id||'new'); setError(''); };

  const EVENT_OPTS = [['all','All events'],['block','Blocked'],['critical','Critical'],['warn','Warnings']];

  return (
    <div>
      <PageHeader title="Webhooks" description="Receive real-time HTTP callbacks when guardrails fire."
        action={can('developer')&&<Btn size="sm" onClick={()=>openEdit(null)}>+ Add webhook</Btn>}/>

      <Modal open={!!editing} onClose={()=>setEditing(null)} title={editing==='new'?'New webhook':'Edit webhook'}>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Alert type="error" message={error}/>
          <Input label="Name" value={draft.name||''} onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/>
          <Input label="Endpoint URL" value={draft.url||''} onChange={e=>setDraft(d=>({...d,url:e.target.value}))} placeholder="https://hooks.example.com/…"/>
          <div>
            <label style={{fontSize:11,color:'var(--c-text2)',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.04em',display:'block',marginBottom:8}}>Trigger events</label>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {EVENT_OPTS.map(([val,lbl])=>{
                const sel=(draft.events||[]).includes(val);
                return <button key={val} onClick={()=>setDraft(d=>({...d,events:sel?d.events.filter(e=>e!==val):[...(d.events||[]),val]}))}
                  style={{fontSize:12,padding:'5px 12px',borderRadius:'var(--radius)',background:sel?'var(--c-purple)':'transparent',color:sel?'#fff':'var(--c-text2)',border:'0.5px solid var(--c-border2)',cursor:'pointer'}}>{lbl}</button>;
              })}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}><Toggle checked={!!draft.active} size={26} onChange={()=>setDraft(d=>({...d,active:!d.active}))}/><span style={{fontSize:12,color:'var(--c-text2)'}}>Active</span></div>
          <div style={{display:'flex',gap:8}}>
            <Btn onClick={save}>Save webhook</Btn>
            <Btn variant="secondary" onClick={()=>setEditing(null)}>Cancel</Btn>
            {editing!=='new'&&<Btn variant="danger" style={{marginLeft:'auto'}} onClick={()=>del(editing)}>Delete</Btn>}
          </div>
        </div>
      </Modal>

      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {webhooks.map(w=>(
          <Card key={w.id}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:w.active?'var(--c-green)':'var(--c-border2)',flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                  <span style={{fontSize:13,fontWeight:500}}>{w.name}</span>
                  {(w.events||[]).map(e=><Badge key={e} text={e} color={e==='critical'?'var(--c-red)':e==='block'?'var(--c-coral)':'var(--c-purple)'} small/>)}
                </div>
                <div style={{fontSize:11,color:'var(--c-text2)',fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.url}</div>
                <div style={{fontSize:10,color:'var(--c-text3)',marginTop:2}}>Last fired: {w.last_fired_at?new Date(w.last_fired_at).toLocaleString():'Never'} · {w.total_deliveries||0} deliveries</div>
              </div>
              {can('developer')&&<><Toggle checked={w.active} size={28} onChange={()=>toggleWh(w)}/><Btn size="sm" variant="secondary" onClick={()=>openEdit(w)}>Configure</Btn></>}
            </div>
          </Card>
        ))}
        {webhooks.length===0&&<Empty icon="🔔" title="No webhooks yet" description="Add a webhook to receive alerts when guardrails fire." action={can('developer')&&<Btn size="sm" onClick={()=>openEdit(null)}>+ Add webhook</Btn>}/>}
      </div>
    </div>
  );
}

export default Guardrails;
