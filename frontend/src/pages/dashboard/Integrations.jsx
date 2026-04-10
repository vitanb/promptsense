import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { orgApi, configApi } from '../../services/api';
import { Card, Btn, Input, Select, Toggle, Alert, PageHeader, Spinner } from '../../components/UI';

const PROVIDERS = [
  { id:'anthropic', label:'Anthropic Claude', color:'#D85A30', models:['claude-sonnet-4-20250514','claude-opus-4-5','claude-haiku-4-5-20251001'], defaultUrl:'https://api.anthropic.com/v1/messages' },
  { id:'openai',    label:'OpenAI',           color:'#10a37f', models:['gpt-4o','gpt-4o-mini','gpt-4-turbo','gpt-3.5-turbo'], defaultUrl:'https://api.openai.com/v1/chat/completions' },
  { id:'azure',     label:'Azure OpenAI',     color:'#0078D4', models:['gpt-4o','gpt-4','gpt-35-turbo'], defaultUrl:'https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-02-01' },
  { id:'gemini',    label:'Google Gemini',    color:'#4285F4', models:['gemini-1.5-pro','gemini-1.5-flash'], defaultUrl:'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent' },
  { id:'mistral',   label:'Mistral AI',       color:'#FF7000', models:['mistral-large-latest','mistral-medium-latest'], defaultUrl:'https://api.mistral.ai/v1/chat/completions' },
  { id:'cohere',    label:'Cohere',           color:'#39594D', models:['command-r-plus','command-r'], defaultUrl:'https://api.cohere.com/v1/chat' },
  { id:'custom',    label:'Custom / Self-hosted', color:'#7F77DD', models:[], defaultUrl:'' },
];

export default function Integrations() {
  const { loading: authLoading } = useAuth();
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.org_id;
  const [connections, setConnections] = useState({});
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!orgId) return;
    orgApi.providers(orgId).then(list => {
      const map = {};
      list.forEach(p => { map[p.provider] = p; });
      setConnections(map);
    }).catch(() => {});
  }, [orgId]);

  const openEdit = (pid) => {
    const conn = connections[pid] || {};
    const preset = PROVIDERS.find(p => p.id === pid);
    setDraft({ provider: pid, enabled: conn.enabled ?? true, apiKey: '', endpointUrl: conn.endpoint_url || preset?.defaultUrl || '', model: conn.model || preset?.models?.[0] || '', maxTokens: conn.max_tokens || 1000, systemPrompt: conn.system_prompt || 'You are a helpful assistant.' });
    setEditing(pid);
    setError(''); setSuccess('');
  };

  const save = async () => {
    if (!orgId) { setError('No organization selected — please refresh the page.'); return; }
    setLoading(true); setError('');
    try {
      const conn = await orgApi.upsertProvider(orgId, draft);
      setConnections(c => ({ ...c, [draft.provider]: conn }));
      setSuccess('Connection saved successfully');
      setEditing(null);
    } catch (err) { setError(err.response?.data?.error || 'Failed to save'); }
    finally { setLoading(false); }
  };

  // Show spinner only while auth is actively loading
  if (authLoading) {
    return (
      <div>
        <PageHeader title="Integrations" description="Connect LLM providers and configure your downstream system." />
        <div style={{ display:'flex', justifyContent:'center', padding:'4rem' }}><Spinner size={28} /></div>
      </div>
    );
  }

  // Auth finished but no org resolved — surface a clear message instead of a dead spinner
  if (!orgId) {
    return (
      <div>
        <PageHeader title="Integrations" description="Connect LLM providers and configure your downstream system." />
        <div style={{ padding:'2rem', textAlign:'center', color:'var(--c-text2)', fontSize:13 }}>
          No organization found. Please <button onClick={() => window.location.reload()} style={{ color:'var(--c-purple)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', fontSize:13 }}>refresh the page</button> or log out and back in.
        </div>
      </div>
    );
  }

  if (editing) {
    const preset = PROVIDERS.find(p => p.id === editing);
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:'1.5rem' }}>
          <Btn variant="ghost" onClick={() => setEditing(null)}>← Back</Btn>
          <h2 style={{ fontSize:15, fontWeight:500 }}>Configure {preset?.label}</h2>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--c-text2)' }}>{draft.enabled ? 'Enabled' : 'Disabled'}</span>
            <Toggle checked={draft.enabled} onChange={() => setDraft(d => ({ ...d, enabled: !d.enabled }))} />
          </div>
        </div>
        <Card style={{ maxWidth:560 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Alert type="error" message={error} />
            <Alert type="success" message={success} />
            <Input label="API key" type="password" value={draft.apiKey} onChange={e => setDraft(d => ({ ...d, apiKey: e.target.value }))} placeholder="Leave blank to keep existing key" />
            <Input label="Endpoint URL" value={draft.endpointUrl} onChange={e => setDraft(d => ({ ...d, endpointUrl: e.target.value }))} />
            <div>
              <label style={{ fontSize:11, color:'var(--c-text2)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:4 }}>Model</label>
              {preset?.models?.length > 0 ? (
                <select value={draft.model} onChange={e => setDraft(d => ({ ...d, model: e.target.value }))} style={{ width:'100%', padding:'8px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', fontSize:13 }}>
                  {preset.models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <Input value={draft.model} onChange={e => setDraft(d => ({ ...d, model: e.target.value }))} placeholder="model name" />
              )}
            </div>
            <Input label="Max tokens" type="number" value={draft.maxTokens} onChange={e => setDraft(d => ({ ...d, maxTokens: parseInt(e.target.value) || 1000 }))} />
            <div>
              <label style={{ fontSize:11, color:'var(--c-text2)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:4 }}>System prompt</label>
              <textarea value={draft.systemPrompt} onChange={e => setDraft(d => ({ ...d, systemPrompt: e.target.value }))} rows={3} style={{ width:'100%', padding:'8px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', fontSize:13, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }} />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <Btn onClick={save} loading={loading}>Save connection</Btn>
              <Btn variant="secondary" onClick={() => setEditing(null)}>Cancel</Btn>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Integrations" description="Connect LLM providers and configure your downstream system." />
      <Alert type="success" message={success} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {PROVIDERS.map(p => {
          const conn = connections[p.id];
          return (
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:'var(--radius)', background:'var(--c-bg)', border: conn?.enabled ? `0.5px solid ${p.color}55` : '0.5px solid var(--c-border)' }}>
              <div style={{ width:32, height:32, borderRadius:7, background: p.color+'20', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600, color:p.color, flexShrink:0 }}>{p.id.slice(0,3).toUpperCase()}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:500 }}>{p.label}</div>
                <div style={{ fontSize:11, color:'var(--c-text2)', marginTop:1 }}>{conn?.enabled ? conn.model || 'Connected' : 'Not connected'}</div>
              </div>
              {conn?.enabled && <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'var(--c-green)18', color:'var(--c-green)', border:'0.5px solid var(--c-green)44' }}>Active</span>}
              {can('developer') && (
                <Btn size="sm" variant="secondary" onClick={() => openEdit(p.id)}>{conn ? 'Configure' : 'Connect'}</Btn>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
