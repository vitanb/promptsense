import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { configApi, orgApi } from '../../services/api';
import { Card, Btn, Input, Select, Toggle, Alert, Badge, PageHeader, Modal, Empty } from '../../components/UI';

const SEVERITY_COLORS = { critical:'#E24B4A', high:'#D85A30', medium:'#BA7517', low:'#639922' };

// ── Country data ───────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code:'US', name:'United States' }, { code:'GB', name:'United Kingdom' },
  { code:'DE', name:'Germany' },       { code:'FR', name:'France' },
  { code:'AU', name:'Australia' },     { code:'CA', name:'Canada' },
  { code:'IN', name:'India' },         { code:'JP', name:'Japan' },
  { code:'CN', name:'China' },         { code:'BR', name:'Brazil' },
  { code:'MX', name:'Mexico' },        { code:'SG', name:'Singapore' },
  { code:'AE', name:'UAE' },           { code:'ZA', name:'South Africa' },
  { code:'NG', name:'Nigeria' },       { code:'KR', name:'South Korea' },
  { code:'IT', name:'Italy' },         { code:'ES', name:'Spain' },
  { code:'NL', name:'Netherlands' },   { code:'SE', name:'Sweden' },
  { code:'NO', name:'Norway' },        { code:'CH', name:'Switzerland' },
  { code:'PL', name:'Poland' },        { code:'AR', name:'Argentina' },
  { code:'SA', name:'Saudi Arabia' },  { code:'TR', name:'Turkey' },
  { code:'ID', name:'Indonesia' },     { code:'MY', name:'Malaysia' },
  { code:'PH', name:'Philippines' },   { code:'TH', name:'Thailand' },
  { code:'NZ', name:'New Zealand' },   { code:'IE', name:'Ireland' },
  { code:'PT', name:'Portugal' },      { code:'RU', name:'Russia' },
  { code:'UA', name:'Ukraine' },       { code:'EG', name:'Egypt' },
  { code:'PK', name:'Pakistan' },      { code:'BD', name:'Bangladesh' },
  { code:'VN', name:'Vietnam' },       { code:'IL', name:'Israel' },
];

// ── Country-specific guardrail template library ────────────────────────────────
const COUNTRY_GUARDRAIL_TEMPLATES = [
  // ── United States ──
  { name:'US — SSN detection', countries:['US'], type:'both', severity:'critical', action:'block', color:'#378ADD',
    description:'Block US Social Security Numbers (SSN) in prompts and responses.',
    pattern:String.raw`\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b` },
  { name:'US — HIPAA health info', countries:['US'], type:'both', severity:'critical', action:'block', color:'#378ADD',
    description:'Detect protected health information (PHI) patterns for HIPAA compliance.',
    pattern:String.raw`(diagnosis|prescription|medical record|patient id|dob|date of birth|insurance id|health plan)` },
  { name:'US — CCPA personal data', countries:['US'], type:'both', severity:'high', action:'warn', color:'#378ADD',
    description:'Warn on California Consumer Privacy Act sensitive data categories.',
    pattern:String.raw`(biometric|geolocation|browsing history|purchase history|inferences drawn)` },

  // ── European Union (GDPR) ──
  { name:'EU — GDPR special categories', countries:['DE','FR','IT','ES','NL','SE','NO','PL','IE','PT','BE','AT','FI','DK','CZ','RO','HU','SK','BG','HR','LT','LV','EE','SI','CY','LU','MT'], type:'both', severity:'critical', action:'block', color:'#1D9E75',
    description:'Block GDPR Article 9 special category data: health, race, religion, biometrics, political views.',
    pattern:String.raw`(racial origin|ethnic origin|political opinion|religious belief|trade union|genetic data|biometric|health data|sexual orientation|criminal conviction)` },
  { name:'EU — GDPR data transfer warning', countries:['DE','FR','IT','ES','NL','SE','NO','PL','IE','PT'], type:'both', severity:'medium', action:'warn', color:'#1D9E75',
    description:'Flag potential cross-border personal data transfer indicators.',
    pattern:String.raw`(transfer.*personal data|send.*personal data|share.*with third party|export.*user data)` },

  // ── United Kingdom ──
  { name:'UK — National Insurance Number', countries:['GB'], type:'both', severity:'critical', action:'block', color:'#D85A30',
    description:'Block UK National Insurance Numbers (NINO).',
    pattern:String.raw`\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b` },
  { name:'UK — UK phone numbers', countries:['GB'], type:'both', severity:'high', action:'warn', color:'#D85A30',
    description:'Detect UK phone numbers in traffic.',
    pattern:String.raw`(\+44\s?|0)[0-9]{10,11}\b` },

  // ── Germany ──
  { name:'DE — Steuer-ID (Tax ID)', countries:['DE'], type:'both', severity:'critical', action:'block', color:'#BA7517',
    description:'Block German tax identification numbers (Steueridentifikationsnummer).',
    pattern:String.raw`\b[1-9]\d{10}\b` },
  { name:'DE — German-specific content restrictions', countries:['DE'], type:'both', severity:'critical', action:'block', color:'#BA7517',
    description:'Block content that violates German NetzDG / Volksverhetzung laws.',
    pattern:String.raw`(volksverhetzung|nationalsozialismus|hakenkreuz|nazi|holocaust.*leugnung)` },

  // ── Australia ──
  { name:'AU — Tax File Number (TFN)', countries:['AU'], type:'both', severity:'critical', action:'block', color:'#7F77DD',
    description:'Block Australian Tax File Numbers.',
    pattern:String.raw`\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b` },
  { name:'AU — Medicare number', countries:['AU'], type:'both', severity:'critical', action:'block', color:'#7F77DD',
    description:'Detect Australian Medicare card numbers.',
    pattern:String.raw`\b[2-6]\d{9}\b` },

  // ── Canada ──
  { name:'CA — SIN (Social Insurance Number)', countries:['CA'], type:'both', severity:'critical', action:'block', color:'#E24B4A',
    description:'Block Canadian Social Insurance Numbers (SIN).',
    pattern:String.raw`\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b` },
  { name:'CA — PIPEDA personal data', countries:['CA'], type:'both', severity:'high', action:'warn', color:'#E24B4A',
    description:'Flag personal data categories covered by Canadian PIPEDA.',
    pattern:String.raw`(social insurance|SIN number|health card|provincial health|driver.s licence number)` },

  // ── India ──
  { name:'IN — Aadhaar number', countries:['IN'], type:'both', severity:'critical', action:'block', color:'#D85A30',
    description:'Block Indian Aadhaar (UID) numbers.',
    pattern:String.raw`\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b` },
  { name:'IN — PAN card', countries:['IN'], type:'both', severity:'critical', action:'block', color:'#D85A30',
    description:'Block Indian Permanent Account Numbers (PAN).',
    pattern:String.raw`\b[A-Z]{5}\d{4}[A-Z]\b` },
  { name:'IN — IT Act sensitive content', countries:['IN'], type:'both', severity:'high', action:'block', color:'#D85A30',
    description:'Block content violating India IT Act sections on obscenity and incitement.',
    pattern:String.raw`(section 66a|obscene material|offensive message|lascivious)` },

  // ── Singapore ──
  { name:'SG — NRIC / FIN number', countries:['SG'], type:'both', severity:'critical', action:'block', color:'#4285F4',
    description:'Block Singapore National Registration Identity Card (NRIC) and FIN numbers.',
    pattern:String.raw`\b[STFGM]\d{7}[A-Z]\b` },

  // ── Saudi Arabia / UAE ──
  { name:'AE/SA — National ID', countries:['AE','SA'], type:'both', severity:'critical', action:'block', color:'#1D9E75',
    description:'Block GCC national identity card numbers.',
    pattern:String.raw`\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b` },

  // ── Japan ──
  { name:'JP — My Number (個人番号)', countries:['JP'], type:'both', severity:'critical', action:'block', color:'#E24B4A',
    description:'Block Japanese My Number (Individual Number) identifiers.',
    pattern:String.raw`\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b` },

  // ── Brazil ──
  { name:'BR — CPF number', countries:['BR'], type:'both', severity:'critical', action:'block', color:'#1D9E75',
    description:'Block Brazilian CPF (Cadastro de Pessoas Físicas) numbers.',
    pattern:String.raw`\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b` },
  { name:'BR — LGPD sensitive data', countries:['BR'], type:'both', severity:'high', action:'warn', color:'#1D9E75',
    description:'Flag data categories sensitive under Brazilian LGPD law.',
    pattern:String.raw`(origem racial|convicção religiosa|opinião política|dado genético|dado biométrico|dado de saúde)` },

  // ── South Korea ──
  { name:'KR — Resident Registration Number', countries:['KR'], type:'both', severity:'critical', action:'block', color:'#BA7517',
    description:'Block Korean Resident Registration Numbers (주민등록번호).',
    pattern:String.raw`\b\d{6}[-\s]?\d{7}\b` },

  // ── China ──
  { name:'CN — Citizen ID (居民身份证)', countries:['CN'], type:'both', severity:'critical', action:'block', color:'#E24B4A',
    description:'Block Chinese national ID card numbers (18-digit format).',
    pattern:String.raw`\b[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b` },
];

// ── Country multi-select component ────────────────────────────────────────────
function CountrySelect({ selected = [], onChange }) {
  const [search, setSearch] = useState('');
  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );
  const toggle = (code) => {
    onChange(selected.includes(code) ? selected.filter(c => c !== code) : [...selected, code]);
  };
  return (
    <div>
      <label style={{ fontSize:11, color:'var(--c-text2)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:6 }}>
        Apply to countries
        <span style={{ marginLeft:6, fontWeight:400, textTransform:'none', fontSize:11, color:'var(--c-text3)' }}>
          {selected.length === 0 ? '(all countries — global)' : `${selected.length} selected`}
        </span>
      </label>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search countries…"
        style={{ width:'100%', padding:'6px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', fontSize:12, marginBottom:6 }} />
      <div style={{ maxHeight:140, overflowY:'auto', display:'flex', flexWrap:'wrap', gap:5, padding:'4px 0' }}>
        {filtered.map(c => {
          const sel = selected.includes(c.code);
          return (
            <button key={c.code} onClick={() => toggle(c.code)}
              style={{ fontSize:11, padding:'3px 9px', borderRadius:4, cursor:'pointer', border:'0.5px solid var(--c-border2)',
                background: sel ? 'var(--c-purple)' : 'var(--c-bg2)',
                color: sel ? '#fff' : 'var(--c-text2)' }}>
              {c.code} {c.name}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <button onClick={() => onChange([])} style={{ marginTop:6, fontSize:11, color:'var(--c-text3)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
          Clear — make global
        </button>
      )}
    </div>
  );
}

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
  const [tab, setTab] = useState('custom'); // 'custom' | 'country' | 'industry'
  const [countryFilter, setCountryFilter] = useState('');

  // Industry compliance state
  const [industryTemplates, setIndustryTemplates] = useState([]);
  const [complianceMode, setComplianceMode] = useState(null);
  const [complianceSaving, setComplianceSaving] = useState(false);
  const [expandedIndustry, setExpandedIndustry] = useState(null);

  useEffect(() => { if (orgId) configApi.guardrails(orgId).then(setGuardrails).catch(() => {}); }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    orgApi.getComplianceTemplates(orgId).then(setIndustryTemplates).catch(() => {});
    orgApi.getSettings(orgId).then(s => setComplianceMode(s.compliance_mode || null)).catch(() => {});
  }, [orgId]);

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

  const addFromTemplate = async (tpl) => {
    setError('');
    try {
      const created = await configApi.createGuardrail(orgId, { ...tpl, enabled: true });
      setGuardrails(gs => [...gs, created]);
    } catch (err) { setError(err.response?.data?.error || 'Failed to add guardrail'); }
  };

  const setMode = async (mode) => {
    setComplianceSaving(true);
    try {
      await orgApi.updateSettings(orgId, { compliance_mode: mode });
      setComplianceMode(mode);
    } catch (_) {}
    setComplianceSaving(false);
  };

  const importAllRules = async (industry) => {
    setError('');
    const tpl = industryTemplates.find(t => t.id === industry);
    if (!tpl) return;
    for (const rule of tpl.rules) {
      if (existingNames.has(rule.name)) continue;
      try {
        const created = await configApi.createGuardrail(orgId, { ...rule, enabled: true, countries: [] });
        setGuardrails(gs => [...gs, created]);
      } catch (_) {}
    }
  };

  const testPattern = () => {
    if (!draft.pattern) return;
    try { setTestResult(new RegExp(draft.pattern, 'i').test(testInput) ? 'match' : 'no-match'); }
    catch (e) { setTestResult('invalid'); }
  };

  const openEdit = (g) => {
    setDraft(g || { name:'', description:'', type:'both', severity:'medium', action:'block', pattern:'', color:'#7F77DD', enabled:true, countries:[] });
    setEditing(g?.id || 'new'); setError(''); setTestInput(''); setTestResult(null);
  };

  const existingNames = new Set(guardrails.map(g => g.name));

  // Tab buttons style
  const tabStyle = (active) => ({
    fontSize: 12, fontWeight: 500, padding: '5px 14px', borderRadius: 6, cursor: 'pointer', border: 'none',
    background: active ? 'var(--c-purple)' : 'transparent',
    color: active ? '#fff' : 'var(--c-text2)',
  });

  const filteredTemplates = COUNTRY_GUARDRAIL_TEMPLATES.filter(t =>
    !countryFilter || t.countries.some(c => c === countryFilter)
  );

  return (
    <div>
      <PageHeader title="Guardrails" description="Configure input and output guardrail rules."
        action={can('developer') && <Btn size="sm" onClick={() => openEdit(null)}>+ New guardrail</Btn>} />

      {/* ── Tab bar ── */}
      <div style={{ display:'flex', gap:4, marginBottom:'1.5rem', background:'var(--c-bg2)', borderRadius:8, padding:4, width:'fit-content', border:'0.5px solid var(--c-border)' }}>
        <button style={tabStyle(tab==='custom')} onClick={() => setTab('custom')}>My Guardrails</button>
        <button style={tabStyle(tab==='industry')} onClick={() => setTab('industry')}>
          🏢 Industry Templates
          {complianceMode && <span style={{ marginLeft:6, fontSize:10, padding:'1px 6px', borderRadius:10, background:'#05966922', color:'#059669', border:'0.5px solid #05966944' }}>Active</span>}
        </button>
        <button style={tabStyle(tab==='country')} onClick={() => setTab('country')}>🌍 Country Templates</button>
      </div>

      {/* ── Modal ── */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New guardrail' : 'Edit guardrail'} width={540}>
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
          <CountrySelect selected={draft.countries||[]} onChange={cs => setDraft(d=>({...d,countries:cs}))} />
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <Btn onClick={save}>Save guardrail</Btn>
            <Btn variant="secondary" onClick={() => setEditing(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      {/* ── My Guardrails tab ── */}
      {tab === 'custom' && ['input','output'].map(dir => (
        <div key={dir} style={{ marginBottom:'1.5rem' }}>
          <div style={{ fontSize:11, fontWeight:500, color:'var(--c-text3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{dir} guardrails</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {guardrails.filter(g => g.type===dir||g.type==='both').map(g => (
              <div key={g.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:'var(--radius)', background:'var(--c-bg)', border:'0.5px solid var(--c-border)', opacity:g.enabled?1:0.55 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:g.color||'#7F77DD', flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2, flexWrap:'wrap' }}>
                    <span style={{ fontSize:13, fontWeight:500 }}>{g.name}</span>
                    <Badge text={g.severity} color={SEVERITY_COLORS[g.severity]||'#888'} small />
                    <Badge text={g.action} color="var(--c-text3)" small />
                    {g.countries && g.countries.length > 0 && (
                      <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'#4285F422', color:'#4285F4', border:'0.5px solid #4285F444' }}>
                        🌍 {g.countries.join(', ')}
                      </span>
                    )}
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

      {/* ── Industry Templates tab ── */}
      {tab === 'industry' && (
        <div>
          {/* Active compliance mode banner */}
          <div style={{ marginBottom:'1.25rem', padding:'14px 18px', borderRadius:'var(--radius)', background: complianceMode ? '#05966910' : 'var(--c-bg2)', border: complianceMode ? '1px solid #05966944' : '0.5px solid var(--c-border)', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:3 }}>
                {complianceMode ? `Compliance Mode: ${industryTemplates.find(t=>t.id===complianceMode)?.icon} ${industryTemplates.find(t=>t.id===complianceMode)?.label}` : 'No compliance mode active'}
              </div>
              <div style={{ fontSize:11, color:'var(--c-text2)' }}>
                {complianceMode
                  ? 'Hard compliance rules are enforced at the proxy level on every request, regardless of individual guardrail settings.'
                  : 'Activate a compliance mode to enforce industry-grade rules on every request for your entire organisation.'}
              </div>
            </div>
            {complianceMode && can('administrator') && (
              <Btn size="sm" variant="secondary" disabled={complianceSaving} onClick={() => setMode(null)}>
                {complianceSaving ? 'Saving…' : 'Deactivate'}
              </Btn>
            )}
          </div>

          <Alert type="error" message={error} />

          {/* Industry cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'1rem' }}>
            {industryTemplates.map(tpl => {
              const isActive = complianceMode === tpl.id;
              const allImported = tpl.rules.every(r => existingNames.has(r.name));
              return (
                <div key={tpl.id} style={{ borderRadius:'var(--radius)', border: isActive ? `1.5px solid ${tpl.color}` : '0.5px solid var(--c-border)', background:'var(--c-bg)', overflow:'hidden' }}>
                  {/* Card header */}
                  <div style={{ padding:'14px 16px', borderBottom:'0.5px solid var(--c-border)', display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:24 }}>{tpl.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
                        {tpl.label}
                        {isActive && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background:tpl.color, color:'#fff', fontWeight:500 }}>ACTIVE</span>}
                      </div>
                      <div style={{ fontSize:10, color:'var(--c-text3)', marginTop:2 }}>{tpl.ruleCount} rules</div>
                    </div>
                  </div>

                  {/* Description */}
                  <div style={{ padding:'10px 16px', fontSize:11, color:'var(--c-text2)', lineHeight:1.55, borderBottom:'0.5px solid var(--c-border)' }}>
                    {tpl.description}
                  </div>

                  {/* Standards badges */}
                  <div style={{ padding:'8px 16px', display:'flex', flexWrap:'wrap', gap:4, borderBottom:'0.5px solid var(--c-border)' }}>
                    {tpl.standards.map(s => (
                      <span key={s} style={{ fontSize:9.5, padding:'2px 7px', borderRadius:10, background:`${tpl.color}18`, color:tpl.color, border:`0.5px solid ${tpl.color}44`, fontWeight:500 }}>{s}</span>
                    ))}
                  </div>

                  {/* Rule preview (expandable) */}
                  <div style={{ borderBottom:'0.5px solid var(--c-border)' }}>
                    <button onClick={() => setExpandedIndustry(expandedIndustry === tpl.id ? null : tpl.id)}
                      style={{ width:'100%', padding:'8px 16px', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:11, color:'var(--c-text2)', fontWeight:500 }}>
                      <span>View {tpl.ruleCount} rules</span>
                      <span>{expandedIndustry === tpl.id ? '▲' : '▼'}</span>
                    </button>
                    {expandedIndustry === tpl.id && (
                      <div style={{ paddingBottom:8 }}>
                        {tpl.rules.map(r => (
                          <div key={r.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 16px', opacity: existingNames.has(r.name) ? 0.5 : 1 }}>
                            <div style={{ width:6, height:6, borderRadius:'50%', background: r.action==='block' ? '#E24B4A' : r.action==='warn' ? '#BA7517' : '#639922', flexShrink:0 }} />
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:11, fontWeight:500 }}>{r.name}</div>
                              <div style={{ fontSize:10, color:'var(--c-text3)' }}>{r.description}</div>
                            </div>
                            <span style={{ fontSize:9.5, padding:'1px 5px', borderRadius:3, background:'var(--c-bg2)', color:'var(--c-text3)', flexShrink:0 }}>{r.action}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ padding:'10px 16px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    {can('administrator') && (
                      isActive
                        ? <Btn size="sm" variant="secondary" disabled={complianceSaving} onClick={() => setMode(null)}>Deactivate</Btn>
                        : <Btn size="sm" disabled={complianceSaving} onClick={() => setMode(tpl.id)} style={{ background:tpl.color, color:'#fff', borderColor:tpl.color }}>Activate</Btn>
                    )}
                    {can('developer') && (
                      allImported
                        ? <span style={{ fontSize:11, color:'var(--c-text3)' }}>All rules imported</span>
                        : <Btn size="sm" variant="secondary" onClick={() => importAllRules(tpl.id)}>Import as guardrails</Btn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Explanatory note */}
          <div style={{ marginTop:'1.25rem', padding:'10px 14px', borderRadius:'var(--radius)', background:'var(--c-bg2)', border:'0.5px solid var(--c-border)', fontSize:11, color:'var(--c-text2)', lineHeight:1.6 }}>
            <strong style={{ color:'var(--c-text)' }}>Activate</strong> enforces rules at the proxy level on every request (recommended — cannot be bypassed).{' '}
            <strong style={{ color:'var(--c-text)' }}>Import as guardrails</strong> adds rules as editable org guardrails for custom tuning.
          </div>
        </div>
      )}

      {/* ── Country Templates tab ── */}
      {tab === 'country' && (
        <div>
          <div style={{ marginBottom:'1rem', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <p style={{ margin:0, fontSize:13, color:'var(--c-text2)', flex:1 }}>
              Pre-built guardrails for regional compliance laws (GDPR, HIPAA, CCPA, LGPD, and more).
              Click <strong style={{ color:'var(--c-text)' }}>Add</strong> to enable a template for your org.
            </p>
            <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
              style={{ padding:'6px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', fontSize:12 }}>
              <option value=''>All countries</option>
              {COUNTRIES.filter(c => COUNTRY_GUARDRAIL_TEMPLATES.some(t => t.countries.includes(c.code))).map(c =>
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              )}
            </select>
          </div>
          <Alert type="error" message={error} />
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {filteredTemplates.map((tpl, i) => {
              const alreadyAdded = existingNames.has(tpl.name);
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:'var(--radius)', background:'var(--c-bg)', border:'0.5px solid var(--c-border)', opacity: alreadyAdded ? 0.5 : 1 }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:tpl.color, flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2, flexWrap:'wrap' }}>
                      <span style={{ fontSize:13, fontWeight:500 }}>{tpl.name}</span>
                      <Badge text={tpl.severity} color={SEVERITY_COLORS[tpl.severity]||'#888'} small />
                      <Badge text={tpl.action} color="var(--c-text3)" small />
                      <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'#4285F422', color:'#4285F4', border:'0.5px solid #4285F444' }}>
                        🌍 {tpl.countries.length > 4 ? `${tpl.countries.slice(0,3).join(', ')} +${tpl.countries.length-3} more` : tpl.countries.join(', ')}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--c-text2)' }}>{tpl.description}</div>
                  </div>
                  {can('developer') && (
                    alreadyAdded
                      ? <span style={{ fontSize:11, color:'var(--c-text3)' }}>Added</span>
                      : <Btn size="sm" onClick={() => addFromTemplate(tpl)}>Add</Btn>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── POLICIES ─────────────────────────────────────────────────────────────────
export function Policies() {
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.org_id;
  const [policies, setPolicies]   = useState([]);
  const [guardrails, setGuardrails] = useState([]);
  const [editing, setEditing]     = useState(null);   // null | 'new' | policy id
  const [draft, setDraft]         = useState({});
  const [error, setError]         = useState('');
  const [deleting, setDeleting]   = useState(null);   // policy id awaiting confirm
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!orgId) return;
    configApi.policies(orgId).then(setPolicies).catch(() => {});
    configApi.guardrails(orgId).then(setGuardrails).catch(() => {});
  }, [orgId]);

  const openNew = () => {
    setDraft({ name: '', description: '', guardrailIds: [] });
    setEditing('new');
    setError('');
  };

  const openEdit = (p) => {
    setDraft({ name: p.name, description: p.description || '', guardrailIds: p.guardrail_ids || [] });
    setEditing(p.id);
    setError('');
  };

  const save = async () => {
    if (!draft.name?.trim()) { setError('Policy name is required'); return; }
    setSaving(true); setError('');
    try {
      if (editing === 'new') {
        const created = await configApi.createPolicy(orgId, { name: draft.name, description: draft.description, guardrailIds: draft.guardrailIds });
        setPolicies(ps => [...ps, created]);
      } else {
        const updated = await configApi.updatePolicy(orgId, editing, { name: draft.name, description: draft.description, guardrailIds: draft.guardrailIds });
        setPolicies(ps => ps.map(p => p.id === updated.id ? updated : p));
      }
      setEditing(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save policy');
    }
    setSaving(false);
  };

  const activate = async (id) => {
    await configApi.updatePolicy(orgId, id, { isActive: true });
    setPolicies(ps => ps.map(p => ({ ...p, is_active: p.id === id })));
  };

  const deactivate = async (id) => {
    await configApi.updatePolicy(orgId, id, { isActive: false });
    setPolicies(ps => ps.map(p => p.id === id ? { ...p, is_active: false } : p));
  };

  const confirmDelete = async () => {
    await configApi.deletePolicy(orgId, deleting);
    setPolicies(ps => ps.filter(p => p.id !== deleting));
    setDeleting(null);
  };

  const toggleGuardrail = (gid) => {
    setDraft(d => ({
      ...d,
      guardrailIds: d.guardrailIds.includes(gid)
        ? d.guardrailIds.filter(id => id !== gid)
        : [...d.guardrailIds, gid],
    }));
  };

  const gMap = Object.fromEntries(guardrails.map(g => [g.id, g]));

  return (
    <div>
      <PageHeader
        title="Policies"
        description="Group guardrails into named policy sets. Activate a policy to apply its rules to all traffic."
        action={can('developer') && <Btn size="sm" onClick={openNew}>+ New policy</Btn>}
      />

      {/* ── Policy list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {policies.map(p => (
          <PolicyCard
            key={p.id}
            policy={p}
            gMap={gMap}
            canEdit={can('developer')}
            onEdit={() => openEdit(p)}
            onActivate={() => activate(p.id)}
            onDeactivate={() => deactivate(p.id)}
            onDelete={() => setDeleting(p.id)}
          />
        ))}
        {policies.length === 0 && (
          <Empty
            icon="📋"
            title="No policies yet"
            description="Create a policy set to bundle guardrails for a specific use case — e.g. 'HIPAA Input Checks' or 'Customer-facing Outputs'."
            action={can('developer') && <Btn size="sm" onClick={openNew}>Create your first policy</Btn>}
          />
        )}
      </div>

      {/* ── Create / Edit modal ── */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New policy' : 'Edit policy'} width={540}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Alert type="error" message={error} />

          <Input label="Policy name" value={draft.name || ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. HIPAA Input Checks" />
          <Input label="Description (optional)" value={draft.description || ''} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Describe what this policy enforces…" />

          {/* Guardrail picker */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--c-text2)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
              Guardrails in this policy
              <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', fontSize: 11, color: 'var(--c-text3)' }}>
                {draft.guardrailIds?.length || 0} selected
              </span>
            </label>
            {guardrails.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--c-text3)', padding: '10px 0' }}>
                No guardrails yet — create some on the Guardrails page first.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
              {guardrails.map(g => {
                const selected = draft.guardrailIds?.includes(g.id);
                return (
                  <div
                    key={g.id}
                    onClick={() => toggleGuardrail(g.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      borderRadius: 'var(--radius)', cursor: 'pointer',
                      background: selected ? 'var(--c-purple)0d' : 'var(--c-bg2)',
                      border: selected ? '1px solid var(--c-purple)44' : '0.5px solid var(--c-border)',
                      transition: 'all var(--transition)',
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: selected ? 'none' : '1.5px solid var(--c-border2)',
                      background: selected ? 'var(--c-purple)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>}
                    </div>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: g.color || '#7F77DD', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{g.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--c-text3)' }}>{g.type} · {g.severity} · {g.action}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Btn onClick={save} loading={saving}>Save policy</Btn>
            <Btn variant="secondary" onClick={() => setEditing(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      {/* ── Delete confirm ── */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete policy?" width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--c-text2)' }}>
            This will permanently delete the policy. Individual guardrails won't be affected.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="danger" onClick={confirmDelete}>Delete</Btn>
            <Btn variant="secondary" onClick={() => setDeleting(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PolicyCard({ policy: p, gMap, canEdit, onEdit, onActivate, onDeactivate, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const guardrailCount = (p.guardrail_ids || []).length;
  return (
    <Card style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Active indicator bar */}
        <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 3, background: p.is_active ? 'var(--c-green)' : 'var(--c-border2)', flexShrink: 0, minHeight: 40 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
            {p.is_active
              ? <Badge text="● Active" color="var(--c-green)" />
              : <Badge text="Inactive" color="var(--c-text3)" />
            }
            <span style={{ fontSize: 11, color: 'var(--c-text3)' }}>{guardrailCount} guardrail{guardrailCount !== 1 ? 's' : ''}</span>
          </div>

          {/* Description */}
          {p.description && (
            <div style={{ fontSize: 12, color: 'var(--c-text2)', marginBottom: 8 }}>{p.description}</div>
          )}

          {/* Guardrail badges */}
          {guardrailCount > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(p.guardrail_ids || []).slice(0, 8).map(gid => {
                const g = gMap[gid];
                return g ? <Badge key={gid} text={g.name} color={g.color || '#888'} small /> : null;
              })}
              {guardrailCount > 8 && (
                <span style={{ fontSize: 10, color: 'var(--c-text3)', alignSelf: 'center' }}>+{guardrailCount - 8} more</span>
              )}
            </div>
          )}
          {guardrailCount === 0 && (
            <span style={{ fontSize: 11, color: 'var(--c-text3)', fontStyle: 'italic' }}>No guardrails assigned</span>
          )}
        </div>

        {/* Actions */}
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {p.is_active
              ? <Btn size="sm" variant="secondary" onClick={onDeactivate}>Deactivate</Btn>
              : <Btn size="sm" variant="secondary" onClick={onActivate}>Activate</Btn>
            }
            <Btn size="sm" variant="secondary" onClick={onEdit}>Edit</Btn>
            <Btn size="sm" variant="danger" onClick={onDelete}>Delete</Btn>
          </div>
        )}
      </div>
    </Card>
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
