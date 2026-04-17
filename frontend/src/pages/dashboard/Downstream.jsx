import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { orgApi } from '../../services/api';
import { Card, Btn, Input, Select, Toggle, Alert, Modal, PageHeader, Empty, Badge } from '../../components/UI';

const BLANK = {
  name: '',
  endpoint_url: '',
  http_method: 'POST',
  body_template: '{"prompt":"{{prompt}}"}',
  response_field: '',
  timeout_ms: 10000,
  fallback_to_provider: true,
  enabled: false,
  apiKey: '',
};

function DownstreamForm({ initial, onSave, onCancel, saving, error }) {
  const [draft, setDraft] = useState({ ...BLANK, ...initial });
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Alert type="error" message={error} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
        <Input label="Name" value={draft.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Production backend" required />
        <Select label="Method" value={draft.http_method} onChange={e => set('http_method', e.target.value)} style={{ width: 90 }}>
          <option>POST</option>
          <option>GET</option>
          <option>PUT</option>
        </Select>
      </div>

      <Input
        label="Endpoint URL"
        value={draft.endpoint_url}
        onChange={e => set('endpoint_url', e.target.value)}
        placeholder="https://your-app.com/api/chat"
        required
      />

      <Input
        label="API key / Bearer token"
        type="password"
        value={draft.apiKey || ''}
        onChange={e => set('apiKey', e.target.value)}
        placeholder={initial?.id ? 'Leave blank to keep existing key' : 'Optional — sent as Bearer token'}
      />

      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
          Request body template
        </label>
        <textarea
          value={draft.body_template || ''}
          onChange={e => set('body_template', e.target.value)}
          rows={3}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', background: 'var(--bg4)', color: 'var(--text)',
            fontSize: 12, resize: 'vertical', fontFamily: 'var(--font-mono)', boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
          Use <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{'{{prompt}}'}</code> as placeholder.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Input
          label="Response field (dot notation)"
          value={draft.response_field || ''}
          onChange={e => set('response_field', e.target.value)}
          placeholder="e.g. data.reply"
        />
        <Input
          label="Timeout (ms)"
          type="number"
          value={draft.timeout_ms || 10000}
          onChange={e => set('timeout_ms', e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
        <Toggle checked={!!draft.fallback_to_provider} onChange={() => set('fallback_to_provider', !draft.fallback_to_provider)} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Fallback to LLM provider if downstream fails</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
            If unreachable or errors, the request continues to your configured LLM provider.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={() => onSave(draft)} loading={saving} disabled={!draft.endpoint_url.trim() || !draft.name.trim()}>
            {initial?.id ? 'Save changes' : 'Create connection'}
          </Btn>
          <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Enabled</span>
          <Toggle checked={!!draft.enabled} onChange={() => set('enabled', !draft.enabled)} />
        </div>
      </div>
    </div>
  );
}

export default function Downstream() {
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.org_id;

  const [connections, setConnections] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // id to confirm delete

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    orgApi.downstreams(orgId)
      .then(setConnections)
      .catch(() => setError('Failed to load downstream connections'))
      .finally(() => setLoading(false));
  }, [orgId]);

  const handleCreate = async (draft) => {
    setSaving(true); setError('');
    try {
      const ds = await orgApi.createDownstream(orgId, {
        name: draft.name, endpointUrl: draft.endpoint_url, apiKey: draft.apiKey,
        httpMethod: draft.http_method, bodyTemplate: draft.body_template,
        responseField: draft.response_field, timeoutMs: parseInt(draft.timeout_ms) || 10000,
        fallbackToProvider: draft.fallback_to_provider, enabled: draft.enabled,
      });
      setConnections(cs => [...cs, ds]);
      setShowCreate(false);
    } catch (e) { setError(e.response?.data?.error || 'Failed to create connection'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (draft) => {
    setSaving(true); setError('');
    try {
      const ds = await orgApi.updateDownstream(orgId, draft.id, {
        name: draft.name, endpointUrl: draft.endpoint_url, apiKey: draft.apiKey || undefined,
        httpMethod: draft.http_method, bodyTemplate: draft.body_template,
        responseField: draft.response_field, timeoutMs: parseInt(draft.timeout_ms) || 10000,
        fallbackToProvider: draft.fallback_to_provider, enabled: draft.enabled,
      });
      setConnections(cs => cs.map(c => c.id === ds.id ? ds : c));
      setEditingId(null);
    } catch (e) { setError(e.response?.data?.error || 'Failed to save connection'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await orgApi.deleteDownstream(orgId, id);
      setConnections(cs => cs.filter(c => c.id !== id));
    } catch (e) { setError(e.response?.data?.error || 'Failed to delete'); }
    finally { setDeleteConfirm(null); }
  };

  const toggleEnabled = async (ds) => {
    try {
      const updated = await orgApi.updateDownstream(orgId, ds.id, { enabled: !ds.enabled });
      setConnections(cs => cs.map(c => c.id === updated.id ? updated : c));
    } catch (e) { setError('Failed to update'); }
  };

  if (loading) return null;

  return (
    <div>
      <PageHeader
        title="Downstream Connections"
        description="Forward prompts that pass guardrails to your own backends. Each API key can route to a different connection."
        action={can('developer') && <Btn size="sm" onClick={() => { setShowCreate(true); setError(''); }}>+ New connection</Btn>}
      />

      <Alert type="error" message={error} />

      {/* How it works hint */}
      <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 'var(--radius)', background: 'var(--accent-dim)', border: '1px solid rgba(139,92,246,0.2)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-light)', marginBottom: 6 }}>How downstream routing works</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text)' }}>1. Prompt received</strong> → guardrails evaluated →{' '}
          <strong style={{ color: 'var(--text)' }}>2. Passes</strong> → routed to the API key's linked downstream →{' '}
          <strong style={{ color: 'var(--text)' }}>3. Response screened</strong> → returned to caller + written to audit log.
          Link a connection to an API key on the <strong style={{ color: 'var(--text)' }}>API Keys</strong> page.
        </div>
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setError(''); }} title="New downstream connection" wide>
        <DownstreamForm
          initial={BLANK}
          onSave={handleCreate}
          onCancel={() => { setShowCreate(false); setError(''); }}
          saving={saving}
          error={error}
        />
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete downstream connection">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
            This will permanently delete this connection. Any API keys linked to it will be unlinked automatically.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="danger" onClick={() => handleDelete(deleteConfirm)}>Delete</Btn>
            <Btn variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      {/* Connection list */}
      {connections.length === 0 ? (
        <Empty
          icon="🔗"
          title="No downstream connections"
          description="Create a connection to route prompts to your own backend. Link it to an API key to activate routing."
          action={can('developer') && <Btn size="sm" onClick={() => setShowCreate(true)}>+ New connection</Btn>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {connections.map(ds => (
            <Card key={ds.id} style={{ padding: 0, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: editingId === ds.id ? '1px solid var(--border)' : 'none' }}>
                {/* Status dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: ds.enabled ? '#22c55e' : 'var(--text3)',
                  boxShadow: ds.enabled ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{ds.name}</span>
                    {ds.enabled
                      ? <Badge text="Enabled" color="#22c55e" small />
                      : <Badge text="Disabled" color="#71717a" small />}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ds.http_method} {ds.endpoint_url}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                    Timeout: {ds.timeout_ms}ms · Fallback: {ds.fallback_to_provider ? 'yes' : 'no'}
                    {ds.response_field && ` · Response field: ${ds.response_field}`}
                  </div>
                </div>
                {can('developer') && editingId !== ds.id && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Toggle checked={!!ds.enabled} onChange={() => toggleEnabled(ds)} />
                    <Btn size="sm" variant="secondary" onClick={() => { setEditingId(ds.id); setError(''); }}>Edit</Btn>
                    <Btn size="sm" variant="danger" onClick={() => setDeleteConfirm(ds.id)}>Delete</Btn>
                  </div>
                )}
              </div>

              {/* Inline edit form */}
              {editingId === ds.id && (
                <div style={{ padding: '18px' }}>
                  <DownstreamForm
                    initial={ds}
                    onSave={d => handleUpdate({ ...d, id: ds.id })}
                    onCancel={() => { setEditingId(null); setError(''); }}
                    saving={saving}
                    error={error}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
