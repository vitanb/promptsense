import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { configApi } from '../../services/api';
import { Card, Btn, Input, Select, Toggle, Alert, PageHeader } from '../../components/UI';

export default function Downstream() {
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.org_id;

  const [draft, setDraft]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    configApi.downstream(orgId)
      .then(data => setDraft(data || {
        name:               'My Backend',
        endpoint_url:       '',
        http_method:        'POST',
        body_template:      '{"prompt":"{{prompt}}"}',
        response_field:     '',
        timeout_ms:         10000,
        fallback_to_provider: true,
        enabled:            false,
      }))
      .catch(() => setError('Failed to load downstream config'))
      .finally(() => setLoading(false));
  }, [orgId]);

  const set = (key, val) => setDraft(d => ({ ...d, [key]: val }));

  const save = async () => {
    if (!draft.endpoint_url) { setError('Endpoint URL is required'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const saved = await configApi.upsertDownstream(orgId, {
        name:               draft.name,
        endpointUrl:        draft.endpoint_url,
        apiKey:             draft.apiKey || '',      // blank = keep existing
        httpMethod:         draft.http_method,
        bodyTemplate:       draft.body_template,
        responseField:      draft.response_field,
        timeoutMs:          parseInt(draft.timeout_ms) || 10000,
        fallbackToProvider: draft.fallback_to_provider,
        enabled:            draft.enabled,
      });
      setDraft(d => ({ ...d, ...saved, apiKey: '' }));
      setSuccess('Downstream configuration saved.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !draft) return null;

  return (
    <div>
      <PageHeader
        title="Downstream System"
        description="Forward prompts that pass guardrails to your own backend before (or instead of) calling the LLM provider."
      />

      <Alert type="error"   message={error} />
      <Alert type="success" message={success} />

      {/* ── Enable / disable ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:500 }}>Enable downstream routing</div>
            <div style={{ fontSize:11, color:'var(--c-text2)', marginTop:2 }}>
              When enabled, every prompt that passes guardrails is forwarded to your endpoint first.
            </div>
          </div>
          <Toggle checked={!!draft.enabled} onChange={() => set('enabled', !draft.enabled)} />
        </div>
      </Card>

      <Card>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          <Input
            label="Name"
            value={draft.name || ''}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. My chat backend"
          />

          {/* ── Endpoint ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10 }}>
            <Input
              label="Endpoint URL"
              value={draft.endpoint_url || ''}
              onChange={e => set('endpoint_url', e.target.value)}
              placeholder="https://your-app.com/api/chat"
            />
            <Select
              label="Method"
              value={draft.http_method || 'POST'}
              onChange={e => set('http_method', e.target.value)}
              style={{ width: 90 }}
            >
              <option>POST</option>
              <option>GET</option>
              <option>PUT</option>
            </Select>
          </div>

          {/* ── Auth ── */}
          <Input
            label="API key / Bearer token"
            type="password"
            value={draft.apiKey || ''}
            onChange={e => set('apiKey', e.target.value)}
            placeholder="Leave blank to keep existing key"
          />

          {/* ── Body template ── */}
          <div>
            <label style={{ fontSize:11, color:'var(--c-text2)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:4 }}>
              Request body template
            </label>
            <textarea
              value={draft.body_template || ''}
              onChange={e => set('body_template', e.target.value)}
              rows={4}
              style={{ width:'100%', padding:'8px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', fontSize:12, resize:'vertical', fontFamily:'monospace', boxSizing:'border-box' }}
            />
            <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:4 }}>
              Use <code style={{ fontSize:11 }}>{'{{prompt}}'}</code> as a placeholder for the user's prompt.
              Example: <code style={{ fontSize:11 }}>{`{"message":"{{prompt}}","userId":"abc"}`}</code>
            </div>
          </div>

          {/* ── Response field ── */}
          <Input
            label="Response field (dot notation)"
            value={draft.response_field || ''}
            onChange={e => set('response_field', e.target.value)}
            placeholder='e.g.  data.reply  or  result.text  (blank = use full response body)'
          />
          <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:-10 }}>
            The JSON path to extract the text reply from your backend's response.
            Leave blank to use the entire response body as the output.
          </div>

          {/* ── Timeout ── */}
          <Input
            label="Timeout (ms)"
            type="number"
            value={draft.timeout_ms || 10000}
            onChange={e => set('timeout_ms', e.target.value)}
          />

          {/* ── Fallback ── */}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:'var(--radius)', background:'var(--c-bg2)', border:'0.5px solid var(--c-border)' }}>
            <Toggle checked={!!draft.fallback_to_provider} onChange={() => set('fallback_to_provider', !draft.fallback_to_provider)} />
            <div>
              <div style={{ fontSize:13, fontWeight:500 }}>Fallback to LLM provider if downstream fails</div>
              <div style={{ fontSize:11, color:'var(--c-text2)', marginTop:2 }}>
                If your backend is unreachable or returns an error, the request will continue to your configured LLM provider.
                Disable this to hard-fail instead.
              </div>
            </div>
          </div>

          {/* ── How it works ── */}
          <div style={{ padding:'12px 14px', borderRadius:'var(--radius)', background:'var(--c-purple)0a', border:'0.5px solid var(--c-purple)33' }}>
            <div style={{ fontSize:12, fontWeight:500, color:'var(--c-purple)', marginBottom:6 }}>How the flow works</div>
            <div style={{ fontSize:11, color:'var(--c-text2)', lineHeight:1.7 }}>
              <strong style={{ color:'var(--c-text)' }}>1. Prompt received</strong> → guardrails evaluated<br/>
              <strong style={{ color:'var(--c-text)' }}>2. Passes guardrails</strong> → PromptSense POSTs to your endpoint<br/>
              <strong style={{ color:'var(--c-text)' }}>3. Your backend responds</strong> → response screened by output guardrails<br/>
              <strong style={{ color:'var(--c-text)' }}>4. Clean response</strong> → returned to your caller + written to audit log
            </div>
          </div>

          {can('developer') && (
            <div style={{ display:'flex', gap:8 }}>
              <Btn onClick={save} loading={saving}>Save configuration</Btn>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
