import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { configApi } from '../../services/api';

// ── Tiny UI helpers ───────────────────────────────────────────────────────────
const card  = { background:'var(--c-bg)', border:'0.5px solid var(--c-border)', borderRadius:'var(--radius-lg)', padding:'1.5rem', marginBottom:'1.25rem' };
const label = { fontSize:12, fontWeight:500, color:'var(--c-text2)', marginBottom:5, display:'block' };

function Field({ label: lbl, children, hint }) {
  return (
    <div style={{ marginBottom:16 }}>
      <label style={label}>{lbl}</label>
      {children}
      {hint && <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:4 }}>{hint}</div>}
    </div>
  );
}

function Input({ ...props }) {
  return (
    <input
      {...props}
      style={{ width:'100%', padding:'8px 10px', fontSize:13, borderRadius:'var(--radius)',
               border:'0.5px solid var(--c-border2)', background:'var(--c-bg2)',
               color:'var(--c-text)', boxSizing:'border-box', ...props.style }}
    />
  );
}

function Textarea({ ...props }) {
  return (
    <textarea
      {...props}
      style={{ width:'100%', padding:'8px 10px', fontSize:12, borderRadius:'var(--radius)',
               border:'0.5px solid var(--c-border2)', background:'var(--c-bg2)',
               color:'var(--c-text)', boxSizing:'border-box', fontFamily:'monospace',
               resize:'vertical', ...props.style }}
    />
  );
}

function Toggle({ checked, onChange, label: lbl }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', userSelect:'none' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{ width:36, height:20, borderRadius:10, background: checked ? 'var(--c-purple)' : 'var(--c-border2)',
                 position:'relative', transition:'background .2s', cursor:'pointer', flexShrink:0 }}>
        <div style={{ position:'absolute', top:2, left: checked ? 18 : 2, width:16, height:16,
                      borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }} />
      </div>
      <span style={{ fontSize:13 }}>{lbl}</span>
    </label>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ width:'100%', padding:'8px 10px', fontSize:13, borderRadius:'var(--radius)',
               border:'0.5px solid var(--c-border2)', background:'var(--c-bg2)', color:'var(--c-text)' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Btn({ children, onClick, loading, variant = 'primary', style: s }) {
  const base = {
    padding:'8px 16px', fontSize:13, fontWeight:500, borderRadius:'var(--radius)',
    border:'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
    display:'inline-flex', alignItems:'center', gap:6, ...s,
  };
  const variants = {
    primary:  { background:'var(--c-purple)', color:'#fff' },
    secondary:{ background:'var(--c-bg2)', color:'var(--c-text)', border:'0.5px solid var(--c-border2)' },
    danger:   { background:'var(--c-red)', color:'#fff' },
  };
  return <button style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={loading}>{loading ? 'Saving…' : children}</button>;
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ fontSize:11, padding:'3px 8px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)',
               background:'var(--c-bg2)', color:'var(--c-text2)', cursor:'pointer', flexShrink:0 }}>
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function CodeRow({ label: lbl, value }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ fontSize:11, color:'var(--c-text3)', marginBottom:3 }}>{lbl}</div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <code style={{ flex:1, fontSize:12, padding:'6px 10px', background:'var(--c-bg2)', borderRadius:'var(--radius)',
                       border:'0.5px solid var(--c-border)', overflowX:'auto', whiteSpace:'nowrap', color:'var(--c-purple)' }}>
          {value}
        </code>
        <CopyBtn text={value} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || '/api';

const DEFAULT_FORM = {
  providerType: 'oidc',
  enabled: false,
  emailDomain: '',
  // OIDC
  discoveryUrl: '',
  clientId: '',
  clientSecret: '',
  // SAML
  idpSsoUrl: '',
  idpEntityId: '',
  idpCertificate: '',
  spEntityId: '',
  // Mapping
  attrEmail: 'email',
  attrName: 'name',
  // Provisioning
  autoProvision: true,
  defaultRole: 'user',
};

export default function SSO() {
  const { currentOrg, can } = useOrg();
  const orgId   = currentOrg?.org_id;
  const orgSlug = currentOrg?.slug || '';

  const [form, setForm]       = useState(DEFAULT_FORM);
  const [hasConfig, setHasConfig] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  const spCallbackOidc = `${API_BASE.replace('/api','')}/api/auth/sso/oidc/callback`;
  const spCallbackSaml = `${API_BASE.replace('/api','')}/api/auth/sso/saml/callback`;
  const spMetadata     = `${API_BASE.replace('/api','')}/api/auth/sso/saml/metadata?org=${orgSlug}`;
  const spEntityId     = form.spEntityId || `promptsense-${orgSlug}`;
  const loginInitUrl   = `${API_BASE.replace('/api','')}/api/auth/sso/start?org=${orgSlug}`;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const cfg = await configApi.sso(orgId);
      if (cfg) {
        setHasConfig(true);
        setForm(f => ({
          ...f,
          providerType:   cfg.provider_type    || 'oidc',
          enabled:        cfg.enabled          ?? false,
          emailDomain:    cfg.email_domain     || '',
          discoveryUrl:   cfg.discovery_url    || '',
          clientId:       cfg.client_id        || '',
          clientSecret:   '',   // never pre-fill — server never returns it
          idpSsoUrl:      cfg.idp_sso_url      || '',
          idpEntityId:    cfg.idp_entity_id    || '',
          idpCertificate: cfg.idp_certificate  || '',
          spEntityId:     cfg.sp_entity_id     || '',
          attrEmail:      cfg.attr_email        || 'email',
          attrName:       cfg.attr_name         || 'name',
          autoProvision:  cfg.auto_provision   ?? true,
          defaultRole:    cfg.default_role     || 'user',
        }));
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const set = (field) => (val) => setForm(f => ({ ...f, [field]: val }));
  const setEv = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const save = async () => {
    setError(''); setSaving(true); setSaved(false);
    try {
      await configApi.upsertSso(orgId, form);
      setHasConfig(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save SSO configuration');
    } finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding:40, color:'var(--c-text3)', fontSize:13 }}>Loading SSO configuration…</div>;

  const isOidc = form.providerType === 'oidc';
  const canEdit = can('administrator');

  return (
    <div style={{ maxWidth:740 }}>
      {/* Header */}
      <div style={{ marginBottom:'1.5rem' }}>
        <h1 style={{ fontSize:20, fontWeight:600, marginBottom:6 }}>Single Sign-On (SSO)</h1>
        <p style={{ fontSize:13, color:'var(--c-text2)', maxWidth:600 }}>
          Allow your team to authenticate with your identity provider. Supports OpenID Connect (Okta, Azure AD, Google Workspace, Auth0) and SAML 2.0.
        </p>
      </div>

      {/* Status badge */}
      <div style={{ ...card, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background: form.enabled ? '#22c55e' : 'var(--c-border2)' }} />
          <div>
            <div style={{ fontSize:13, fontWeight:500 }}>SSO is {form.enabled ? 'enabled' : 'disabled'}</div>
            <div style={{ fontSize:11, color:'var(--c-text3)' }}>
              {form.enabled
                ? `Users with @${form.emailDomain || '...'} email will be redirected to your identity provider`
                : 'Enable SSO after completing configuration below'}
            </div>
          </div>
        </div>
        {canEdit && (
          <Toggle checked={form.enabled} onChange={set('enabled')} label="" />
        )}
      </div>

      {/* Provider type */}
      <div style={card}>
        <h2 style={{ fontSize:14, fontWeight:600, marginBottom:1 }}>Provider type</h2>
        <p style={{ fontSize:12, color:'var(--c-text2)', marginBottom:16 }}>Choose the protocol your identity provider supports.</p>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
          {[
            { value:'oidc', title:'OpenID Connect (OIDC)', desc:'Okta, Azure AD, Google Workspace, Auth0, OneLogin', icon:'🔐' },
            { value:'saml', title:'SAML 2.0', desc:'Okta, Azure AD, ADFS, PingFederate, and most enterprise IdPs', icon:'🏛️' },
          ].map(opt => (
            <div
              key={opt.value}
              onClick={() => canEdit && set('providerType')(opt.value)}
              style={{ padding:'14px 16px', borderRadius:'var(--radius)', cursor: canEdit ? 'pointer' : 'default',
                       border:`1.5px solid ${form.providerType === opt.value ? 'var(--c-purple)' : 'var(--c-border)'}`,
                       background: form.providerType === opt.value ? 'var(--c-purple)08' : 'var(--c-bg2)' }}>
              <div style={{ fontSize:16, marginBottom:4 }}>{opt.icon}</div>
              <div style={{ fontSize:13, fontWeight:500 }}>{opt.title}</div>
              <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:2 }}>{opt.desc}</div>
            </div>
          ))}
        </div>

        <Field label="Email domain" hint="Users whose email matches this domain will be auto-redirected to SSO login.">
          <Input
            value={form.emailDomain}
            onChange={setEv('emailDomain')}
            placeholder="acme.com"
            disabled={!canEdit}
          />
        </Field>
      </div>

      {/* OIDC config */}
      {isOidc && (
        <div style={card}>
          <h2 style={{ fontSize:14, fontWeight:600, marginBottom:1 }}>OpenID Connect settings</h2>
          <p style={{ fontSize:12, color:'var(--c-text2)', marginBottom:16 }}>
            In your IdP, create a new OIDC application with the redirect URI below, then paste the credentials here.
          </p>

          <div style={{ background:'var(--c-bg2)', borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:16,
                        border:'0.5px solid var(--c-border)' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--c-text3)', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>
              Add this to your IdP application
            </div>
            <CodeRow label="Redirect / Callback URI" value={spCallbackOidc} />
          </div>

          <Field label="Discovery URL (Well-Known URL)"
                 hint="Okta: https://your-domain.okta.com/oauth2/default — Azure AD: https://login.microsoftonline.com/{tenant}/v2.0 — Google: https://accounts.google.com">
            <Input
              value={form.discoveryUrl}
              onChange={setEv('discoveryUrl')}
              placeholder="https://your-domain.okta.com/oauth2/default"
              disabled={!canEdit}
            />
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Client ID">
              <Input
                value={form.clientId}
                onChange={setEv('clientId')}
                placeholder="0oa1b2c3d4e5f6g7h8i9"
                disabled={!canEdit}
              />
            </Field>
            <Field label="Client Secret" hint={hasConfig ? 'Leave blank to keep the existing secret.' : ''}>
              <Input
                type="password"
                value={form.clientSecret}
                onChange={setEv('clientSecret')}
                placeholder={hasConfig ? '••••••••• (unchanged)' : 'Paste client secret'}
                disabled={!canEdit}
              />
            </Field>
          </div>
        </div>
      )}

      {/* SAML config */}
      {!isOidc && (
        <div style={card}>
          <h2 style={{ fontSize:14, fontWeight:600, marginBottom:1 }}>SAML 2.0 settings</h2>
          <p style={{ fontSize:12, color:'var(--c-text2)', marginBottom:16 }}>
            Configure your IdP with the SP details below, then paste your IdP's details here.
          </p>

          <div style={{ background:'var(--c-bg2)', borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:16,
                        border:'0.5px solid var(--c-border)' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--c-text3)', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>
              Service Provider (SP) — add to your IdP
            </div>
            <CodeRow label="ACS URL (Assertion Consumer Service)"  value={spCallbackSaml} />
            <CodeRow label="SP Entity ID / Audience URI"           value={spEntityId} />
            <CodeRow label="SP Metadata URL"                       value={spMetadata} />
          </div>

          <Field label="IdP SSO URL" hint="The URL your IdP exposes for initiating SAML logins.">
            <Input
              value={form.idpSsoUrl}
              onChange={setEv('idpSsoUrl')}
              placeholder="https://your-domain.okta.com/app/.../sso/saml"
              disabled={!canEdit}
            />
          </Field>

          <Field label="IdP Entity ID / Issuer">
            <Input
              value={form.idpEntityId}
              onChange={setEv('idpEntityId')}
              placeholder="http://www.okta.com/exkXXXXXXXXXX"
              disabled={!canEdit}
            />
          </Field>

          <Field label="Custom SP Entity ID" hint="Override the default SP Entity ID if your IdP requires a specific value.">
            <Input
              value={form.spEntityId}
              onChange={setEv('spEntityId')}
              placeholder={`promptsense-${orgSlug}`}
              disabled={!canEdit}
            />
          </Field>

          <Field label="IdP Signing Certificate (X.509 PEM)"
                 hint="Paste the full certificate including -----BEGIN CERTIFICATE----- headers.">
            <Textarea
              rows={6}
              value={form.idpCertificate}
              onChange={setEv('idpCertificate')}
              placeholder={'-----BEGIN CERTIFICATE-----\nMIICpDCCAYwCCQDU....\n-----END CERTIFICATE-----'}
              disabled={!canEdit}
            />
          </Field>
        </div>
      )}

      {/* Attribute mapping */}
      <div style={card}>
        <h2 style={{ fontSize:14, fontWeight:600, marginBottom:1 }}>Attribute mapping</h2>
        <p style={{ fontSize:12, color:'var(--c-text2)', marginBottom:16 }}>
          Map your IdP's claim/attribute names to PromptSense fields. Most IdPs use the defaults.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="Email claim / attribute" hint="e.g. email, mail, EmailAddress">
            <Input value={form.attrEmail} onChange={setEv('attrEmail')} placeholder="email" disabled={!canEdit} />
          </Field>
          <Field label="Name claim / attribute" hint="e.g. name, displayName, cn">
            <Input value={form.attrName} onChange={setEv('attrName')} placeholder="name" disabled={!canEdit} />
          </Field>
        </div>
      </div>

      {/* JIT provisioning */}
      <div style={card}>
        <h2 style={{ fontSize:14, fontWeight:600, marginBottom:1 }}>User provisioning</h2>
        <p style={{ fontSize:12, color:'var(--c-text2)', marginBottom:16 }}>
          Control how users are created when they sign in with SSO for the first time.
        </p>

        <div style={{ marginBottom:16 }}>
          <Toggle
            checked={form.autoProvision}
            onChange={canEdit ? set('autoProvision') : undefined}
            label="Auto-provision new users (JIT)"
          />
          <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:4, marginLeft:46 }}>
            Create a PromptSense account automatically on first SSO login. If disabled, users must be invited manually first.
          </div>
        </div>

        <Field label="Default role for provisioned users">
          <Select
            value={form.defaultRole}
            onChange={canEdit ? set('defaultRole') : undefined}
            options={[
              { value:'user',          label:'User — read-only access to Playground' },
              { value:'developer',     label:'Developer — can manage guardrails, API keys' },
              { value:'administrator', label:'Administrator — full access' },
            ]}
          />
        </Field>
      </div>

      {/* SSO Login URL */}
      {hasConfig && (
        <div style={card}>
          <h2 style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>SSO login URL</h2>
          <p style={{ fontSize:12, color:'var(--c-text2)', marginBottom:12 }}>
            Share this URL with your team for direct IdP-initiated login, or embed it in your intranet portal.
          </p>
          <CodeRow label="Direct SSO login link" value={loginInitUrl} />
        </div>
      )}

      {/* Actions */}
      {canEdit && (
        <div style={{ display:'flex', alignItems:'center', gap:12, paddingBottom:32 }}>
          <Btn onClick={save} loading={saving}>
            {hasConfig ? 'Update SSO configuration' : 'Save SSO configuration'}
          </Btn>
          {saved && <span style={{ fontSize:12, color:'#22c55e' }}>✓ Saved successfully</span>}
          {error && <span style={{ fontSize:12, color:'var(--c-red)' }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
