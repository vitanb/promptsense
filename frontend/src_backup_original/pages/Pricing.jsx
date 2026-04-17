import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { billingApi } from '../services/api';

const FALLBACK_PLANS = [
  { name:'starter',    display_name:'Starter',    price_monthly:0,     requests_per_month:5000,  members_limit:3,  features:['5,000 requests/mo','3 team members','10 guardrails','Email support'] },
  { name:'pro',        display_name:'Pro',        price_monthly:4900,  requests_per_month:50000, members_limit:15, features:['50,000 requests/mo','15 team members','50 guardrails','Priority support','Analytics export','Custom policies'] },
  { name:'enterprise', display_name:'Enterprise', price_monthly:19900, requests_per_month:-1,    members_limit:-1, features:['Unlimited requests','Unlimited members','Unlimited guardrails','SLA','SSO/SAML','Dedicated support','Custom contracts'] },
];

const COLORS = { starter:'#378ADD', pro:'#7F77DD', enterprise:'#1D9E75' };

const COMPARE_ROWS = [
  { category: 'Usage',        rows: [
    { feature: 'Requests / month',    starter: '5,000',      pro: '50,000',      enterprise: 'Unlimited' },
    { feature: 'Team members',        starter: '3',          pro: '15',          enterprise: 'Unlimited' },
    { feature: 'Organizations',       starter: '1',          pro: '1',           enterprise: 'Unlimited' },
    { feature: 'Guardrail rules',     starter: '10',         pro: '50',          enterprise: 'Unlimited' },
    { feature: 'Prompt templates',    starter: '10',         pro: '100',         enterprise: 'Unlimited' },
  ]},
  { category: 'LLM Providers', rows: [
    { feature: 'Anthropic / OpenAI / Azure', starter: true, pro: true, enterprise: true },
    { feature: 'Gemini / Mistral / Cohere',  starter: true, pro: true, enterprise: true },
    { feature: 'Custom / self-hosted LLMs',  starter: false, pro: true, enterprise: true },
  ]},
  { category: 'Guardrails & Compliance', rows: [
    { feature: 'Built-in guardrails (PII, injection, etc.)', starter: true, pro: true, enterprise: true },
    { feature: 'Custom regex guardrails',   starter: false, pro: true, enterprise: true },
    { feature: 'Policy sets',              starter: false, pro: true, enterprise: true },
    { feature: 'Immutable audit log',      starter: true,  pro: true, enterprise: true },
    { feature: 'CSV audit export',         starter: false, pro: true, enterprise: true },
    { feature: 'SOC 2 Type II package',    starter: false, pro: false, enterprise: true },
    { feature: 'Data Processing Agreement (DPA)', starter: false, pro: false, enterprise: true },
  ]},
  { category: 'Security & Access', rows: [
    { feature: 'AES-256-GCM key encryption', starter: true, pro: true, enterprise: true },
    { feature: 'RBAC (User / Dev / Admin)',  starter: true, pro: true, enterprise: true },
    { feature: 'SSO / SAML 2.0',            starter: false, pro: false, enterprise: true },
    { feature: 'API keys (SDK auth)',        starter: true, pro: true, enterprise: true },
    { feature: 'IP allowlist',              starter: false, pro: false, enterprise: true },
  ]},
  { category: 'Alerting & Integrations', rows: [
    { feature: 'Webhook alerts',            starter: false, pro: true, enterprise: true },
    { feature: 'Slack integration',         starter: false, pro: true, enterprise: true },
    { feature: 'PagerDuty integration',     starter: false, pro: true, enterprise: true },
    { feature: 'Downstream system routing', starter: false, pro: true, enterprise: true },
  ]},
  { category: 'Deployment & Support', rows: [
    { feature: 'Cloud-hosted (SaaS)',       starter: true,  pro: true,  enterprise: true },
    { feature: 'Self-hosted (Docker / K8s)',starter: false, pro: false, enterprise: true },
    { feature: 'Uptime SLA',               starter: false, pro: '99.5%', enterprise: '99.9%' },
    { feature: 'Support',                  starter: 'Email', pro: 'Priority email', enterprise: 'Dedicated' },
    { feature: 'Custom contracts',         starter: false, pro: false, enterprise: true },
  ]},
];

const FAQS = [
  ['What counts as a request?', 'Any prompt sent through the PromptSense proxy — whether it passes guardrails or is blocked — counts as one request against your monthly quota.'],
  ['Can I change plans anytime?', 'Yes. Upgrades take effect immediately with prorated billing. Downgrades apply at the next billing cycle. You can also cancel anytime.'],
  ['How are provider API keys stored?', 'Keys are encrypted at rest using AES-256-GCM. They are never logged, exposed in responses, or accessible in plaintext — even to PromptSense employees.'],
  ['Is there a self-hosted option?', 'Enterprise plans include a Docker-based self-hosted deployment with full source access, Helm chart, and migration tooling. Contact sales for details.'],
  ['Do you support SSO?', 'Yes — SAML 2.0 and OIDC (OpenID Connect) are available on Enterprise. We can integrate with Okta, Azure AD, Google Workspace, and any standards-compliant IdP.'],
  ['Can I sign a DPA or custom contract?', 'Absolutely. Enterprise customers receive a standard Data Processing Agreement, and our team will work with your legal and procurement teams on custom contracts, BAAs, or SLAs.'],
  ['What happens if I exceed my request limit?', 'We send email alerts at 80% and 100% of your quota. Requests are not hard-blocked — you have a 10% overage buffer and we\'ll reach out to discuss upgrading before we apply overage charges.'],
  ['Do you offer a free trial for Pro?', 'Yes. All paid plans start with a 14-day free trial. No credit card required. You\'ll only be charged if you explicitly upgrade after the trial.'],
];

function CheckIcon({ color = '#1D9E75' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink:0 }}>
      <circle cx="7" cy="7" r="7" fill={color} fillOpacity="0.12"/>
      <path d="M4 7l2 2 4-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink:0 }}>
      <circle cx="7" cy="7" r="7" fill="#E5E7EB" fillOpacity="0.5"/>
      <path d="M5 5l4 4M9 5l-4 4" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function Cell({ val, color }) {
  if (val === true)  return <span style={{ display:'flex', justifyContent:'center' }}><CheckIcon color={color} /></span>;
  if (val === false) return <span style={{ display:'flex', justifyContent:'center' }}><XIcon /></span>;
  return <span style={{ fontSize:12, color:'var(--c-text)', textAlign:'center', display:'block' }}>{val}</span>;
}

export default function Pricing() {
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [yearly, setYearly] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => { billingApi.plans().then(setPlans).catch(() => {}); }, []);

  return (
    <div style={{ minHeight:'100vh' }}>
      {/* Nav */}
      <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem 2rem', borderBottom:'0.5px solid var(--c-border)', background:'var(--c-bg)' }}>
        <Link to="/" style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none' }}>
          <div style={{ width:26, height:26, background:'var(--c-purple)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L12.5 7L7 12.5L1.5 7L7 1.5Z" stroke="#fff" strokeWidth="1.5" fill="none"/><circle cx="7" cy="7" r="2" fill="#fff"/></svg>
          </div>
          <span style={{ fontWeight:600, fontSize:14, color:'var(--c-purple)' }}>PromptSense</span>
        </Link>
        <div style={{ display:'flex', gap:8 }}>
          <Link to="/auth/login" style={{ fontSize:13, color:'var(--c-text2)', padding:'6px 12px', textDecoration:'none' }}>Sign in</Link>
          <Link to="/auth/register" style={{ fontSize:13, fontWeight:500, padding:'7px 14px', background:'var(--c-purple)', color:'#fff', borderRadius:'var(--radius)', textDecoration:'none' }}>Start free</Link>
        </div>
      </nav>

      <div style={{ maxWidth:960, margin:'0 auto', padding:'4rem 2rem' }}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:'3rem' }}>
          <h1 style={{ fontSize:36, fontWeight:700, marginBottom:'0.75rem', letterSpacing:'-0.02em' }}>Simple, transparent pricing</h1>
          <p style={{ fontSize:15, color:'var(--c-text2)', marginBottom:'1.5rem' }}>Start free, scale as you grow. No hidden fees. Cancel anytime.</p>
          {/* Billing toggle */}
          <div style={{ display:'inline-flex', alignItems:'center', gap:10, background:'var(--c-bg2)', borderRadius:24, padding:'4px 8px', border:'0.5px solid var(--c-border)' }}>
            <button onClick={() => setYearly(false)} style={{ padding:'5px 14px', borderRadius:20, border:'none', background: !yearly ? 'var(--c-bg)' : 'transparent', fontWeight: !yearly ? 500 : 400, fontSize:13, cursor:'pointer', color:'var(--c-text)' }}>Monthly</button>
            <button onClick={() => setYearly(true)}  style={{ padding:'5px 14px', borderRadius:20, border:'none', background:  yearly ? 'var(--c-bg)' : 'transparent', fontWeight:  yearly ? 500 : 400, fontSize:13, cursor:'pointer', color:'var(--c-text)', display:'flex', alignItems:'center', gap:6 }}>
              Yearly
              <span style={{ fontSize:10, background:'var(--c-green)', color:'#fff', padding:'1px 6px', borderRadius:10 }}>-17%</span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:'1.25rem', alignItems:'start', marginBottom:'3rem' }}>
          {plans.map(plan => {
            const color = COLORS[plan.name] || '#7F77DD';
            const price = yearly ? Math.round((plan.price_yearly || plan.price_monthly * 10) / 100) : Math.round(plan.price_monthly / 100);
            const isPro = plan.name === 'pro';
            const features = Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features || '[]');

            return (
              <div key={plan.name} style={{ background:'var(--c-bg)', border: isPro ? `2px solid ${color}` : '0.5px solid var(--c-border)', borderRadius:'var(--radius-lg)', padding:'1.75rem', position:'relative' }}>
                {isPro && (
                  <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:color, color:'#fff', fontSize:11, fontWeight:500, padding:'2px 12px', borderRadius:10, whiteSpace:'nowrap' }}>Most popular</div>
                )}
                <div style={{ fontSize:11, fontWeight:600, color, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>{plan.display_name}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:'1.25rem' }}>
                  {plan.price_monthly === 0 ? (
                    <span style={{ fontSize:32, fontWeight:700 }}>Free</span>
                  ) : plan.name === 'enterprise' ? (
                    <span style={{ fontSize:26, fontWeight:700 }}>Custom</span>
                  ) : (
                    <>
                      <span style={{ fontSize:32, fontWeight:700 }}>${price}</span>
                      <span style={{ fontSize:13, color:'var(--c-text2)' }}>/{yearly ? 'yr' : 'mo'}</span>
                    </>
                  )}
                </div>
                <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:9, marginBottom:'1.5rem' }}>
                  {features.map(f => (
                    <li key={f} style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:13 }}>
                      <span style={{ color:'var(--c-green)', fontWeight:600, fontSize:14, lineHeight:'1.2', flexShrink:0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                {plan.name === 'enterprise' ? (
                  <a href="mailto:sales@promptsense.io"
                    style={{ display:'block', textAlign:'center', padding:'10px', borderRadius:'var(--radius)', fontSize:13, fontWeight:500, background:'transparent', color, border:`0.5px solid ${color}`, textDecoration:'none' }}>
                    Contact sales
                  </a>
                ) : (
                  <Link to="/auth/register"
                    style={{ display:'block', textAlign:'center', padding:'10px', borderRadius:'var(--radius)', fontSize:13, fontWeight:500, background: isPro ? color : 'transparent', color: isPro ? '#fff' : color, border:`0.5px solid ${color}`, textDecoration:'none' }}>
                    {plan.price_monthly === 0 ? 'Start free' : 'Start trial'}
                  </Link>
                )}
                {plan.name !== 'enterprise' && (
                  <p style={{ fontSize:11, color:'var(--c-text3)', textAlign:'center', marginTop:8 }}>
                    {plan.price_monthly === 0 ? 'No credit card required' : '14-day free trial · No credit card'}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Compare toggle */}
        <div style={{ textAlign:'center', marginBottom: showCompare ? '2rem' : '4rem' }}>
          <button onClick={() => setShowCompare(v => !v)}
            style={{ fontSize:13, fontWeight:500, color:'var(--c-purple)', background:'none', border:'0.5px solid var(--c-purple)44', borderRadius:'var(--radius)', padding:'8px 20px', cursor:'pointer' }}>
            {showCompare ? '▲ Hide' : '▼ Compare all features'}
          </button>
        </div>

        {/* Feature comparison table */}
        {showCompare && (
          <div style={{ overflowX:'auto', marginBottom:'4rem' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign:'left', padding:'10px 12px', fontSize:12, color:'var(--c-text3)', fontWeight:500, borderBottom:'0.5px solid var(--c-border)', width:'40%' }}>Feature</th>
                  {['Starter', 'Pro', 'Enterprise'].map((h, i) => (
                    <th key={h} style={{ textAlign:'center', padding:'10px 12px', fontSize:12, fontWeight:600, color: Object.values(COLORS)[i], borderBottom:'0.5px solid var(--c-border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map(section => (
                  <>
                    <tr key={section.category}>
                      <td colSpan={4} style={{ padding:'14px 12px 6px', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--c-text3)', background:'var(--c-bg2)', borderTop:'0.5px solid var(--c-border)' }}>
                        {section.category}
                      </td>
                    </tr>
                    {section.rows.map((row, ri) => (
                      <tr key={row.feature} style={{ background: ri % 2 === 0 ? 'var(--c-bg)' : 'var(--c-bg2)' }}>
                        <td style={{ padding:'10px 12px', color:'var(--c-text)', borderBottom:'0.5px solid var(--c-border)' }}>{row.feature}</td>
                        {['starter', 'pro', 'enterprise'].map((plan, pi) => (
                          <td key={plan} style={{ padding:'10px 12px', borderBottom:'0.5px solid var(--c-border)', textAlign:'center' }}>
                            <Cell val={row[plan]} color={Object.values(COLORS)[pi]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Enterprise CTA */}
        <div style={{ background:'var(--c-bg2)', border:'0.5px solid var(--c-border)', borderRadius:'var(--radius-lg)', padding:'2rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1.5rem', flexWrap:'wrap', marginBottom:'4rem' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Need a custom plan or procurement support?</div>
            <div style={{ fontSize:13, color:'var(--c-text2)' }}>Custom contracts, DPA, SSO, self-hosted deployments — our team handles it.</div>
          </div>
          <a href="mailto:sales@promptsense.io"
            style={{ fontSize:13, fontWeight:500, padding:'10px 22px', background:'var(--c-purple)', color:'#fff', borderRadius:'var(--radius)', textDecoration:'none', whiteSpace:'nowrap' }}>
            Talk to sales →
          </a>
        </div>

        {/* FAQ */}
        <div>
          <h2 style={{ fontSize:24, fontWeight:700, textAlign:'center', marginBottom:'2.5rem' }}>Frequently asked questions</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(360px, 1fr))', gap:'1.25rem' }}>
            {FAQS.map(([q, a]) => (
              <div key={q} style={{ padding:'1.25rem', background:'var(--c-bg2)', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border)' }}>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>{q}</div>
                <div style={{ fontSize:13, color:'var(--c-text2)', lineHeight:1.65 }}>{a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
