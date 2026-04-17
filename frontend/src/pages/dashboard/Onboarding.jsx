import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { orgApi } from '../../services/api';

const MILESTONES = [
  {
    id: 'providerConnected',
    icon: '⚡',
    title: 'Connect an LLM provider',
    desc: 'Add your Anthropic, OpenAI, or any of 32 provider API keys. Encrypted at rest immediately.',
    cta: 'Add provider',
    href: '/dashboard/integrations',
  },
  {
    id: 'firstRequestSent',
    icon: '▶',
    title: 'Send your first proxied request',
    desc: 'Open the Playground and send a prompt through the PromptSense proxy to confirm everything is wired up.',
    cta: 'Open Playground',
    href: '/dashboard/playground',
  },
  {
    id: 'guardrailFired',
    icon: '🛡',
    title: 'Trigger a guardrail',
    desc: 'Send a prompt that contains PII, a prompt injection, or some toxic content — watch the guardrail block it in real time.',
    cta: 'Test guardrails',
    href: '/dashboard/playground',
  },
];

export default function Onboarding() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [status, setStatus] = useState({ providerConnected: false, firstRequestSent: false, guardrailFired: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg?.org_id) return;
    orgApi.activation(currentOrg.org_id)
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentOrg?.org_id]);

  const doneCount = Object.values(status).filter(Boolean).length;
  const allDone = doneCount === MILESTONES.length;
  const pct = Math.round((doneCount / MILESTONES.length) * 100);

  if (allDone) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', paddingTop: '4rem', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: '1rem' }}>🎉</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text)' }}>
          Your guardrails are live
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: '2rem', lineHeight: 1.7, maxWidth: 420, margin: '0 auto 2rem' }}>
          PromptSense is protecting your LLM pipeline. Head to Analytics to monitor pass rates, flag distributions, and latency in real time.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link to="/dashboard/analytics" style={{ fontSize: 13, fontWeight: 600, padding: '11px 24px', background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius)', textDecoration: 'none' }}>
            Open Analytics →
          </Link>
          <Link to="/dashboard/audit" style={{ fontSize: 13, fontWeight: 500, padding: '11px 24px', background: 'var(--bg4)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', textDecoration: 'none' }}>
            View Audit Log
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 660, margin: '0 auto', paddingTop: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text)' }}>
          Welcome to PromptSense 👋
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
          3 steps to get your first guardrail protecting real LLM traffic. Takes about 5 minutes.
        </p>

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 3, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent-light) 100%)', borderRadius: 3, transition: 'width 0.5s ease' }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, flexShrink: 0 }}>{doneCount} / {MILESTONES.length}</span>
        </div>
      </div>

      {/* Milestones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MILESTONES.map((m, i) => {
          const done = status[m.id];
          const isNext = !done && MILESTONES.slice(0, i).every(prev => status[prev.id]);

          return (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: '1rem',
              background: 'var(--bg4)', border: `1px solid ${done ? 'rgba(34,197,94,0.4)' : isNext ? 'rgba(139,92,246,0.4)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: '1.25rem',
              opacity: done ? 0.7 : 1,
              transition: 'border-color 0.2s, opacity 0.2s',
            }}>
              {/* Icon */}
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: done ? 16 : 20,
                background: done ? 'rgba(34,197,94,0.15)' : isNext ? 'var(--accent-dim)' : 'var(--bg3)',
                border: `1px solid ${done ? 'rgba(34,197,94,0.3)' : isNext ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`,
                color: done ? '#22c55e' : isNext ? 'var(--accent-light)' : 'var(--text3)',
              }}>
                {done ? '✓' : m.icon}
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{m.title}</span>
                  {done && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
                      Complete
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>{m.desc}</p>
                {!done && (
                  <Link to={m.href} style={{
                    display: 'inline-block', marginTop: '0.75rem',
                    fontSize: 12, fontWeight: 600, padding: '7px 16px',
                    background: isNext ? 'var(--accent)' : 'transparent',
                    color: isNext ? '#fff' : 'var(--accent-light)',
                    border: `1px solid ${isNext ? 'var(--accent)' : 'rgba(139,92,246,0.4)'}`,
                    borderRadius: 'var(--radius)', textDecoration: 'none',
                  }}>
                    {m.cta} →
                  </Link>
                )}
              </div>

              <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0, paddingTop: 2 }}>
                {String(i + 1).padStart(2, '0')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Skip */}
      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <button onClick={() => navigate('/dashboard/analytics')}
          style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Skip — I'll explore on my own
        </button>
      </div>
    </div>
  );
}

/**
 * Lightweight hook — returns activation status for the current org.
 * Used by Shell to show the activation banner.
 */
export function useActivation(orgId) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!orgId) return;
    orgApi.activation(orgId).then(setStatus).catch(() => {});
  }, [orgId]);
  return status;
}

export function shouldShowOnboarding() { return true; }
