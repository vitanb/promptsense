import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { orgApi, configApi } from '../../services/api';

/**
 * Onboarding checklist shown to new orgs.
 * Checks completion via lightweight API calls.
 */

const STEPS = [
  {
    id: 'provider',
    icon: '⚡',
    title: 'Connect an LLM provider',
    desc: 'Add your Anthropic, OpenAI, or other provider API key. It\'s encrypted at rest immediately.',
    cta: 'Add provider',
    href: '/dashboard/integrations',
  },
  {
    id: 'guardrail',
    icon: '🛡',
    title: 'Set up a guardrail',
    desc: 'Choose from 10 built-in types (PII, injection, toxicity, secrets) or write a custom rule.',
    cta: 'Configure guardrails',
    href: '/dashboard/guardrails',
  },
  {
    id: 'playground',
    icon: '▶',
    title: 'Run your first prompt',
    desc: 'Test a prompt in the Playground to see guardrails in action — and confirm everything is wired up.',
    cta: 'Open Playground',
    href: '/dashboard/playground',
  },
  {
    id: 'api_key',
    icon: '🔑',
    title: 'Generate an API key',
    desc: 'Create an SDK key so your application can call the PromptSense proxy directly.',
    cta: 'Create API key',
    href: '/dashboard/api-keys',
  },
];

export default function Onboarding() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();

  const [completed, setCompleted] = useState({
    provider:   false,
    guardrail:  false,
    playground: false,
    api_key:    false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg?.org_id) return;
    checkCompletion();
  }, [currentOrg]);

  async function checkCompletion() {
    setLoading(true);
    try {
      const [providers, guardrails, keys] = await Promise.allSettled([
        orgApi.providers(currentOrg.org_id),
        configApi.guardrails(currentOrg.org_id),
        orgApi.apiKeys(currentOrg.org_id),
      ]);

      setCompleted({
        provider:   providers.status === 'fulfilled' && providers.value?.length > 0,
        guardrail:  guardrails.status === 'fulfilled' && guardrails.value?.length > 0,
        playground: Boolean(localStorage.getItem(`ps_playground_${currentOrg.org_id}`)),
        api_key:    keys.status === 'fulfilled' && keys.value?.length > 0,
      });
    } catch (_) {
      // silent — graceful fallback
    } finally {
      setLoading(false);
    }
  }

  const doneCount = Object.values(completed).filter(Boolean).length;
  const allDone   = doneCount === STEPS.length;
  const pct       = Math.round((doneCount / STEPS.length) * 100);

  if (allDone) {
    return (
      <div style={{ maxWidth:640, margin:'0 auto', paddingTop:'3rem', textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:'1rem' }}>🎉</div>
        <h1 style={{ fontSize:24, fontWeight:700, marginBottom:'0.5rem' }}>You're all set!</h1>
        <p style={{ fontSize:14, color:'var(--c-text2)', marginBottom:'2rem', lineHeight:1.7 }}>
          Your guardrails are live, your provider is connected, and your API key is ready. Head to Analytics to monitor your pipeline in real time.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
          <Link to="/dashboard/analytics" style={{ fontSize:13, fontWeight:500, padding:'10px 22px', background:'var(--c-purple)', color:'#fff', borderRadius:'var(--radius)', textDecoration:'none' }}>
            Open Analytics
          </Link>
          <Link to="/dashboard/playground" style={{ fontSize:13, fontWeight:500, padding:'10px 22px', background:'transparent', color:'var(--c-text)', border:'0.5px solid var(--c-border2)', borderRadius:'var(--radius)', textDecoration:'none' }}>
            Go to Playground
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth:680, margin:'0 auto', paddingTop:'2rem' }}>
      {/* Header */}
      <div style={{ marginBottom:'2rem' }}>
        <h1 style={{ fontSize:22, fontWeight:700, marginBottom:'0.25rem' }}>
          Welcome to PromptSense 👋
        </h1>
        <p style={{ fontSize:14, color:'var(--c-text2)', marginBottom:'1.25rem' }}>
          Complete these {STEPS.length} steps to start protecting your LLM pipeline. Takes about 10 minutes.
        </p>
        {/* Progress bar */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1, height:6, background:'var(--c-bg2)', borderRadius:3, border:'0.5px solid var(--c-border)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${pct}%`, background:'var(--c-purple)', borderRadius:3, transition:'width 0.4s ease' }} />
          </div>
          <span style={{ fontSize:12, color:'var(--c-text2)', fontWeight:500, flexShrink:0 }}>{doneCount} / {STEPS.length}</span>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
        {STEPS.map((step, i) => {
          const done = completed[step.id];
          const isNext = !done && Object.values(completed).slice(0, i).every(Boolean) ;
          return (
            <div
              key={step.id}
              style={{
                display:'flex', alignItems:'flex-start', gap:'1rem',
                background:'var(--c-bg)', border:`0.5px solid ${done ? 'var(--c-green)' : isNext ? 'var(--c-purple)44' : 'var(--c-border)'}`,
                borderRadius:'var(--radius-lg)', padding:'1.25rem',
                opacity: done ? 0.75 : 1,
                transition:'border-color 0.2s',
              }}
            >
              {/* Step indicator */}
              <div style={{
                width:36, height:36, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                background: done ? 'var(--c-green)' : isNext ? 'var(--c-purple)' : 'var(--c-bg2)',
                border: done || isNext ? 'none' : '0.5px solid var(--c-border)',
                fontSize: done ? 16 : 18,
                color: done || isNext ? '#fff' : 'var(--c-text2)',
                transition:'background 0.2s',
              }}>
                {done ? '✓' : step.icon}
              </div>

              {/* Content */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:14, fontWeight:600 }}>{step.title}</span>
                  {done && <span style={{ fontSize:11, background:'var(--c-green)18', color:'var(--c-green)', padding:'1px 8px', borderRadius:10, fontWeight:500 }}>Done</span>}
                </div>
                <p style={{ fontSize:13, color:'var(--c-text2)', lineHeight:1.6, marginBottom: done ? 0 : '0.875rem', margin: done ? 0 : undefined }}>{step.desc}</p>
                {!done && (
                  <Link
                    to={step.href}
                    style={{ fontSize:12, fontWeight:500, color: isNext ? '#fff' : 'var(--c-purple)', background: isNext ? 'var(--c-purple)' : 'transparent', border:`0.5px solid ${isNext ? 'var(--c-purple)' : 'var(--c-purple)44'}`, borderRadius:'var(--radius)', padding:'6px 14px', textDecoration:'none', display:'inline-block', marginTop:'0.75rem' }}>
                    {step.cta} →
                  </Link>
                )}
              </div>

              {/* Step number */}
              <div style={{ fontSize:11, color:'var(--c-text3)', flexShrink:0, paddingTop:2 }}>
                {String(i + 1).padStart(2, '0')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Skip */}
      <div style={{ marginTop:'1.5rem', textAlign:'center' }}>
        <button
          onClick={() => {
            if (currentOrg?.org_id) localStorage.setItem(`ps_onboarding_skip_${currentOrg.org_id}`, '1');
            navigate('/dashboard/playground');
          }}
          style={{ fontSize:12, color:'var(--c-text3)', background:'none', border:'none', cursor:'pointer' }}>
          Skip setup — I'll explore on my own
        </button>
      </div>
    </div>
  );
}

/**
 * Exported helper: returns true if org should see onboarding.
 * Call this after login/register.
 */
export function shouldShowOnboarding(orgId) {
  return !localStorage.getItem(`ps_onboarding_skip_${orgId}`);
}
