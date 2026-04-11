import { Link } from 'react-router-dom';

const FEATURES = [
  { icon:'🛡', title:'10 built-in guardrails', desc:'PII, injection, toxicity, secrets, hallucination checks — active the moment you connect.' },
  { icon:'⚡', title:'6 LLM providers', desc:'Anthropic, OpenAI, Azure, Gemini, Mistral, Cohere — or bring your own via custom endpoint.' },
  { icon:'📊', title:'Real-time analytics', desc:'Pass rates, flag distribution, provider latency, cost tracking — all in one live dashboard.' },
  { icon:'🔔', title:'Webhook alerts', desc:'Fire to Slack, PagerDuty, or any HTTP endpoint the instant a prompt is blocked or flagged.' },
  { icon:'👥', title:'Team RBAC', desc:'User, Developer, Administrator roles. Granular permission gating so the right people have the right access.' },
  { icon:'📜', title:'Immutable audit log', desc:'Every prompt, response, and guardrail decision captured — exportable to CSV for compliance review.' },
];

const LOGOS = ['Anthropic', 'OpenAI', 'Azure OpenAI', 'Gemini', 'Mistral', 'Cohere'];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Connect your LLM provider',
    desc: 'Paste your existing API key for Anthropic, OpenAI, Azure, or any of our supported providers. Encrypted at rest with AES-256-GCM.',
  },
  {
    step: '02',
    title: 'Configure your guardrails',
    desc: 'Pick from 10 pre-built rules — PII detection, prompt injection, toxicity, secret leakage — or write custom regex patterns for your domain.',
  },
  {
    step: '03',
    title: 'Replace your API endpoint',
    desc: 'Point your app at the PromptSense proxy URL and drop in your API key. All prompts flow through your guardrails automatically — zero code changes.',
  },
];

const ENTERPRISE = [
  { icon:'🔒', label:'SOC 2 Type II ready', desc:'Audit-ready from day one. Every event logged, exportable, tamper-evident.' },
  { icon:'🏢', label:'SSO / SAML', desc:'Enterprise plan includes SAML 2.0 and OIDC for single sign-on with your IdP.' },
  { icon:'📋', label:'Custom contracts & DPA', desc:"We'll sign your DPA, BAA, or custom SLA. Enterprise procurement friendly." },
  { icon:'🖥', label:'Self-hosted option', desc:'Run entirely in your own VPC. Docker images, Helm chart, and deployment support included.' },
];

const TESTIMONIALS = [
  {
    quote: "We had a compliance review coming up. PromptSense gave us an audit trail and PII guardrails in less than a day. The review passed without a single finding on our LLM stack.",
    name: 'Head of Security',
    org: 'Series B HealthTech',
  },
  {
    quote: "We evaluated three guardrail platforms. PromptSense was the only one with real multi-tenant RBAC out of the box. Integration took two hours.",
    name: 'Staff Engineer',
    org: 'Enterprise SaaS, 300+ employees',
  },
  {
    quote: "The webhook → PagerDuty integration alone justified the cost. We catch prompt injection attempts in real time now, instead of finding out in a post-mortem.",
    name: 'VP of Engineering',
    org: 'AI-native startup',
  },
];

export default function Landing() {
  return (
    <div style={{ minHeight:'100vh', fontFamily:'inherit' }}>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem 2rem', borderBottom:'0.5px solid var(--c-border)', background:'var(--c-bg)', position:'sticky', top:0, zIndex:10, backdropFilter:'blur(8px)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, background:'var(--c-purple)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L12.5 7L7 12.5L1.5 7L7 1.5Z" stroke="#fff" strokeWidth="1.5" fill="none"/><circle cx="7" cy="7" r="2" fill="#fff"/></svg>
          </div>
          <span style={{ fontWeight:600, fontSize:15, color:'var(--c-purple)' }}>PromptSense</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Link to="/pricing" style={{ fontSize:13, color:'var(--c-text2)', padding:'6px 12px', textDecoration:'none' }}>Pricing</Link>
          <a href="/docs" style={{ fontSize:13, color:'var(--c-text2)', padding:'6px 12px', textDecoration:'none' }}>Docs</a>
          <Link to="/auth/login" style={{ fontSize:13, color:'var(--c-text2)', padding:'6px 12px', textDecoration:'none' }}>Sign in</Link>
          <Link to="/auth/register" style={{ fontSize:13, fontWeight:500, padding:'7px 16px', background:'var(--c-purple)', color:'#fff', borderRadius:'var(--radius)', textDecoration:'none' }}>Start free</Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section style={{ maxWidth:800, margin:'0 auto', padding:'6rem 2rem 4rem', textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11, fontWeight:500, padding:'4px 12px', borderRadius:20, background:'var(--c-purple)18', color:'var(--c-purple)', border:'0.5px solid var(--c-purple)44', marginBottom:'1.5rem', letterSpacing:'0.04em', textTransform:'uppercase' }}>
          <span>🛡</span> Enterprise LLM Guardrails Platform
        </div>
        <h1 style={{ fontSize:52, fontWeight:700, lineHeight:1.12, marginBottom:'1.25rem', letterSpacing:'-0.025em' }}>
          Ship LLMs safely.<br />
          <span style={{ color:'var(--c-purple)' }}>At any scale.</span>
        </h1>
        <p style={{ fontSize:19, color:'var(--c-text2)', lineHeight:1.65, maxWidth:580, margin:'0 auto 2rem' }}>
          PromptSense wraps any LLM provider with real-time input/output guardrails, compliance audit logging, and team-level access control — in minutes, not months.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <Link to="/auth/register" style={{ fontSize:14, fontWeight:600, padding:'13px 30px', background:'var(--c-purple)', color:'#fff', borderRadius:'var(--radius)', display:'inline-block', textDecoration:'none', letterSpacing:'-0.01em' }}>
            Start free — no card required
          </Link>
          <Link to="/pricing" style={{ fontSize:14, fontWeight:500, padding:'13px 30px', background:'transparent', color:'var(--c-text)', border:'0.5px solid var(--c-border2)', borderRadius:'var(--radius)', display:'inline-block', textDecoration:'none' }}>
            View pricing →
          </Link>
        </div>
        <p style={{ marginTop:'1rem', fontSize:12, color:'var(--c-text3)' }}>14-day free trial · No credit card · Cancel anytime</p>
      </section>

      {/* ── Social proof bar ─────────────────────────────────────────── */}
      <section style={{ borderTop:'0.5px solid var(--c-border)', borderBottom:'0.5px solid var(--c-border)', background:'var(--c-bg2)', padding:'1.5rem 2rem' }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'center', gap:'2.5rem', flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:'var(--c-text3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Works with</span>
          {LOGOS.map(l => (
            <span key={l} style={{ fontSize:13, fontWeight:500, color:'var(--c-text2)' }}>{l}</span>
          ))}
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────── */}
      <section style={{ borderBottom:'0.5px solid var(--c-border)', background:'var(--c-bg)', padding:'2.5rem 2rem' }}>
        <div style={{ maxWidth:800, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'1rem', textAlign:'center' }}>
          {[
            { num:'< 5 ms', label:'Guardrail overhead' },
            { num:'10', label:'Built-in guardrail types' },
            { num:'6', label:'LLM providers' },
            { num:'99.9%', label:'Uptime SLA (Enterprise)' },
          ].map(s => (
            <div key={s.label} style={{ padding:'1rem' }}>
              <div style={{ fontSize:30, fontWeight:700, color:'var(--c-purple)', letterSpacing:'-0.02em' }}>{s.num}</div>
              <div style={{ fontSize:12, color:'var(--c-text2)', marginTop:4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section style={{ maxWidth:900, margin:'0 auto', padding:'5rem 2rem' }}>
        <div style={{ textAlign:'center', marginBottom:'3.5rem' }}>
          <h2 style={{ fontSize:30, fontWeight:700, marginBottom:'0.5rem' }}>Up and running in 15 minutes</h2>
          <p style={{ fontSize:15, color:'var(--c-text2)' }}>Three steps. No SDKs to install. No infrastructure to manage.</p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'2rem' }}>
          {HOW_IT_WORKS.map((s, i) => (
            <div key={s.step} style={{ position:'relative' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--c-purple)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, marginBottom:'1rem' }}>{s.step}</div>
              {i < HOW_IT_WORKS.length - 1 && (
                <div style={{ display:'none' }} />
              )}
              <div style={{ fontSize:15, fontWeight:600, marginBottom:'0.5rem' }}>{s.title}</div>
              <div style={{ fontSize:13, color:'var(--c-text2)', lineHeight:1.65 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features grid ────────────────────────────────────────────── */}
      <section style={{ background:'var(--c-bg2)', borderTop:'0.5px solid var(--c-border)', borderBottom:'0.5px solid var(--c-border)', padding:'5rem 2rem' }}>
        <div style={{ maxWidth:940, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:'3rem' }}>
            <h2 style={{ fontSize:30, fontWeight:700, marginBottom:'0.5rem' }}>Everything for production LLMs</h2>
            <p style={{ fontSize:15, color:'var(--c-text2)' }}>One platform. Every provider. Complete control.</p>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:'1.25rem' }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background:'var(--c-bg)', border:'0.5px solid var(--c-border)', borderRadius:'var(--radius-lg)', padding:'1.5rem' }}>
                <div style={{ fontSize:28, marginBottom:'0.75rem' }}>{f.icon}</div>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>{f.title}</div>
                <div style={{ fontSize:13, color:'var(--c-text2)', lineHeight:1.65 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <section style={{ maxWidth:940, margin:'0 auto', padding:'5rem 2rem' }}>
        <div style={{ textAlign:'center', marginBottom:'3rem' }}>
          <h2 style={{ fontSize:30, fontWeight:700, marginBottom:'0.5rem' }}>Trusted by engineering teams</h2>
          <p style={{ fontSize:15, color:'var(--c-text2)' }}>From Series A startups to enterprise compliance teams.</p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))', gap:'1.25rem' }}>
          {TESTIMONIALS.map(t => (
            <div key={t.name} style={{ background:'var(--c-bg)', border:'0.5px solid var(--c-border)', borderRadius:'var(--radius-lg)', padding:'1.75rem' }}>
              <div style={{ fontSize:22, color:'var(--c-purple)', marginBottom:'0.75rem', lineHeight:1 }}>"</div>
              <p style={{ fontSize:13, color:'var(--c-text)', lineHeight:1.7, marginBottom:'1.25rem', fontStyle:'italic' }}>{t.quote}</p>
              <div style={{ fontSize:12, fontWeight:600 }}>{t.name}</div>
              <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:2 }}>{t.org}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Enterprise section ───────────────────────────────────────── */}
      <section style={{ background:'var(--c-bg2)', borderTop:'0.5px solid var(--c-border)', borderBottom:'0.5px solid var(--c-border)', padding:'5rem 2rem' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4rem', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--c-purple)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.75rem' }}>Built for enterprise</div>
              <h2 style={{ fontSize:28, fontWeight:700, lineHeight:1.25, marginBottom:'1rem' }}>Security and compliance your team can actually point to</h2>
              <p style={{ fontSize:14, color:'var(--c-text2)', lineHeight:1.7, marginBottom:'1.5rem' }}>
                Enterprise security teams have a checklist. PromptSense was designed with that checklist in mind — from encrypted key storage to per-team audit logs to self-hosted deployments.
              </p>
              <Link to="/pricing" style={{ fontSize:13, fontWeight:500, color:'var(--c-purple)', textDecoration:'none' }}>
                See enterprise plan →
              </Link>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              {ENTERPRISE.map(e => (
                <div key={e.label} style={{ background:'var(--c-bg)', border:'0.5px solid var(--c-border)', borderRadius:'var(--radius)', padding:'1.25rem' }}>
                  <div style={{ fontSize:22, marginBottom:'0.5rem' }}>{e.icon}</div>
                  <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>{e.label}</div>
                  <div style={{ fontSize:12, color:'var(--c-text2)', lineHeight:1.6 }}>{e.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section style={{ background:'var(--c-purple)', padding:'5.5rem 2rem', textAlign:'center' }}>
        <h2 style={{ fontSize:32, fontWeight:700, color:'#fff', marginBottom:'0.75rem', letterSpacing:'-0.02em' }}>
          Add guardrails to your LLM stack today.
        </h2>
        <p style={{ fontSize:15, color:'rgba(255,255,255,0.72)', marginBottom:'2.5rem', maxWidth:480, margin:'0 auto 2rem' }}>
          Join teams shipping AI products with confidence. 14-day free trial, no credit card required.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <Link to="/auth/register" style={{ fontSize:14, fontWeight:600, padding:'13px 28px', background:'#fff', color:'var(--c-purple)', borderRadius:'var(--radius)', display:'inline-block', textDecoration:'none' }}>
            Start free trial
          </Link>
          <a href="mailto:sales@promptsense.io" style={{ fontSize:14, fontWeight:500, padding:'13px 28px', background:'rgba(255,255,255,0.12)', color:'#fff', borderRadius:'var(--radius)', display:'inline-block', textDecoration:'none', border:'0.5px solid rgba(255,255,255,0.3)' }}>
            Talk to sales
          </a>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer style={{ borderTop:'0.5px solid var(--c-border)', background:'var(--c-bg2)', padding:'3rem 2rem 2rem' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:'2rem', marginBottom:'2.5rem' }}>
            {/* Brand */}
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:'0.75rem' }}>
                <div style={{ width:24, height:24, background:'var(--c-purple)', borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L12.5 7L7 12.5L1.5 7L7 1.5Z" stroke="#fff" strokeWidth="1.5" fill="none"/><circle cx="7" cy="7" r="2" fill="#fff"/></svg>
                </div>
                <span style={{ fontWeight:600, fontSize:14, color:'var(--c-purple)' }}>PromptSense</span>
              </div>
              <p style={{ fontSize:12, color:'var(--c-text3)', lineHeight:1.7, maxWidth:240 }}>
                Enterprise LLM guardrails. Ship AI products with confidence, compliance, and control.
              </p>
              <p style={{ fontSize:11, color:'var(--c-text3)', marginTop:'0.75rem' }}>
                <a href="mailto:sales@promptsense.io" style={{ color:'var(--c-text2)', textDecoration:'none' }}>sales@promptsense.io</a>
              </p>
            </div>
            {/* Product */}
            <div>
              <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--c-text3)', marginBottom:'0.75rem' }}>Product</div>
              {['Features', 'Pricing', 'Changelog', 'Status'].map(l => (
                <div key={l} style={{ marginBottom:6 }}>
                  <Link to={l === 'Pricing' ? '/pricing' : '#'} style={{ fontSize:13, color:'var(--c-text2)', textDecoration:'none' }}>{l}</Link>
                </div>
              ))}
            </div>
            {/* Developers */}
            <div>
              <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--c-text3)', marginBottom:'0.75rem' }}>Developers</div>
              {['Docs', 'API Reference', 'SDKs', 'Quickstart'].map(l => (
                <div key={l} style={{ marginBottom:6 }}>
                  <a href="/docs" style={{ fontSize:13, color:'var(--c-text2)', textDecoration:'none' }}>{l}</a>
                </div>
              ))}
            </div>
            {/* Company */}
            <div>
              <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--c-text3)', marginBottom:'0.75rem' }}>Company</div>
              {['About', 'Blog', 'Security', 'Contact'].map(l => (
                <div key={l} style={{ marginBottom:6 }}>
                  <a href={l === 'Contact' ? 'mailto:hello@promptsense.io' : '#'} style={{ fontSize:13, color:'var(--c-text2)', textDecoration:'none' }}>{l}</a>
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop:'0.5px solid var(--c-border)', paddingTop:'1.5rem', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--c-text3)' }}>© 2025 PromptSense, Inc. All rights reserved.</span>
            <div style={{ display:'flex', gap:20 }}>
              {['Privacy Policy', 'Terms of Service', 'Security', 'DPA'].map(l => (
                <a key={l} href="#" style={{ fontSize:12, color:'var(--c-text3)', textDecoration:'none' }}>{l}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
