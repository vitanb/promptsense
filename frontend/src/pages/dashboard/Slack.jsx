import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { orgApi } from '../../services/api';
import { Card, Btn, Input, Toggle, Alert, PageHeader } from '../../components/UI';

// ── Slack logo SVG ────────────────────────────────────────────────────────────
function SlackLogo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/>
      <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
      <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/>
      <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
      <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/>
      <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
      <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
      <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
    </svg>
  );
}

// ── Section card for each integration block ───────────────────────────────────
function SlackSection({ title, description, icon, children }) {
  return (
    <Card style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)', marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{description}</div>
        </div>
      </div>
      {children}
    </Card>
  );
}

// ── Setup guide link ──────────────────────────────────────────────────────────
function SetupGuide() {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 8,
      background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.2)',
      fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16,
    }}>
      <strong style={{ color: 'var(--text1)' }}>How to get a webhook URL:</strong>{' '}
      Go to{' '}
      <a
        href="https://api.slack.com/apps"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--accent)', textDecoration: 'underline' }}
      >
        api.slack.com/apps
      </a>
      {' '}→ Create or select your app → <em>Incoming Webhooks</em> → Activate and copy the webhook URL.
    </div>
  );
}

// ── Test result badge ─────────────────────────────────────────────────────────
function TestBadge({ state }) {
  if (!state) return null;
  const ok = state === 'ok';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      color: ok ? '#4ade80' : '#f87171',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
    }}>
      {ok ? '✓ Message sent' : '✕ Failed — check webhook URL'}
    </span>
  );
}

// ── Main Slack page ───────────────────────────────────────────────────────────
export default function Slack() {
  const { orgId } = useOrg();

  const [config, setConfig]   = useState({
    digestUrl:      '',
    alertsUrl:      '',
    digestEnabled:  true,
    alertsEnabled:  true,
  });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [saveErr,  setSaveErr]  = useState('');

  const [testingDigest, setTestingDigest] = useState(false);
  const [testingAlert,  setTestingAlert]  = useState(false);
  const [digestTest,    setDigestTest]    = useState(null); // 'ok' | 'fail' | null
  const [alertTest,     setAlertTest]     = useState(null);

  useEffect(() => {
    if (!orgId) return;
    orgApi.slackConfig(orgId)
      .then(d => setConfig({
        digestUrl:     d.digestUrl      || '',
        alertsUrl:     d.alertsUrl      || '',
        digestEnabled: d.digestEnabled  !== false,
        alertsEnabled: d.alertsEnabled  !== false,
      }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  const set = (k, v) => {
    setConfig(c => ({ ...c, [k]: v }));
    setSaved(false);
    setSaveErr('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveErr('');
    try {
      await orgApi.saveSlackConfig(orgId, config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveErr(e?.response?.data?.error || 'Failed to save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestDigest = async () => {
    setTestingDigest(true);
    setDigestTest(null);
    try {
      await orgApi.testDigest(orgId);
      setDigestTest('ok');
    } catch {
      setDigestTest('fail');
    } finally {
      setTestingDigest(false);
    }
  };

  const handleTestAlert = async () => {
    setTestingAlert(true);
    setAlertTest(null);
    try {
      await orgApi.testAlert(orgId);
      setAlertTest('ok');
    } catch {
      setAlertTest('fail');
    } finally {
      setTestingAlert(false);
    }
  };

  if (loading) return (
    <div style={{ padding: 32, color: 'var(--text2)', fontSize: 14 }}>Loading…</div>
  );

  return (
    <div style={{ maxWidth: 680 }}>
      <PageHeader
        title="Slack Integration"
        description="Get daily summaries and real-time guardrail alerts delivered to Slack channels."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 28 }}>

        {/* ── Daily Digest ─────────────────────────────────────── */}
        <SlackSection
          title="Daily Digest"
          description="Sends a morning summary of yesterday's request volume, pass rate, blocked count, and top guardrail triggers."
          icon={<span style={{ fontSize: 18 }}>📊</span>}
        >
          <SetupGuide />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input
              label="Digest webhook URL"
              value={config.digestUrl}
              onChange={e => set('digestUrl', e.target.value)}
              placeholder="https://hooks.slack.com/services/T.../B.../..."
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text1)' }}>Enable daily digest</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Sent every day at 9:00 AM UTC</div>
              </div>
              <Toggle
                checked={config.digestEnabled}
                onChange={() => set('digestEnabled', !config.digestEnabled)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
              <Btn
                variant="ghost"
                size="sm"
                loading={testingDigest}
                disabled={!config.digestUrl || testingDigest}
                onClick={handleTestDigest}
              >
                Send test digest
              </Btn>
              <TestBadge state={digestTest} />
            </div>
          </div>
        </SlackSection>

        {/* ── Real-time Alerts ──────────────────────────────────── */}
        <SlackSection
          title="Real-time Block Alerts"
          description="Fires an instant notification every time a request is blocked by a guardrail, including the prompt preview and triggered flags."
          icon={<span style={{ fontSize: 18 }}>🚨</span>}
        >
          <SetupGuide />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input
              label="Alerts webhook URL"
              value={config.alertsUrl}
              onChange={e => set('alertsUrl', e.target.value)}
              placeholder="https://hooks.slack.com/services/T.../B.../..."
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text1)' }}>Enable block alerts</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Fires immediately on every blocked request</div>
              </div>
              <Toggle
                checked={config.alertsEnabled}
                onChange={() => set('alertsEnabled', !config.alertsEnabled)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
              <Btn
                variant="ghost"
                size="sm"
                loading={testingAlert}
                disabled={!config.alertsUrl || testingAlert}
                onClick={handleTestAlert}
              >
                Send test alert
              </Btn>
              <TestBadge state={alertTest} />
            </div>
          </div>
        </SlackSection>

        {/* ── Save bar ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Btn onClick={handleSave} loading={saving} disabled={saving}>
            Save Slack settings
          </Btn>
          {saved && (
            <span style={{ fontSize: 13, color: '#4ade80', fontWeight: 500 }}>
              ✓ Settings saved
            </span>
          )}
          <Alert type="error" message={saveErr} />
        </div>

      </div>
    </div>
  );
}
