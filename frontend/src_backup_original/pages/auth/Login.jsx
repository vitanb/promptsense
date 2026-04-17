import { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Input, Btn, Alert } from '../../components/UI';
import { authApi } from '../../services/api';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/api$/, '');

export default function Login() {
  const [form, setForm]           = useState({ email: '', password: '' });
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [ssoInfo, setSsoInfo]     = useState(null);   // { orgSlug, provider } or null
  const [ssoChecking, setSsoChecking] = useState(false);
  const emailCheckTimer = useRef(null);

  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from?.pathname || '/dashboard';

  // Read ?sso_error from redirect after failed SSO attempt
  const ssoError = new URLSearchParams(location.search).get('sso_error');

  // When user finishes typing their email, check if that domain has SSO configured
  const handleEmailChange = (e) => {
    const email = e.target.value;
    setForm(f => ({ ...f, email }));
    setSsoInfo(null);

    clearTimeout(emailCheckTimer.current);
    if (!email.includes('@') || email.split('@')[1]?.length < 3) return;

    emailCheckTimer.current = setTimeout(async () => {
      setSsoChecking(true);
      try {
        const result = await authApi.checkSso(email);
        if (result.hasSso) setSsoInfo(result);
      } catch (_) {
        // ignore — SSO check is best-effort
      } finally {
        setSsoChecking(false);
      }
    }, 500);
  };

  const handleSsoLogin = () => {
    if (!ssoInfo?.orgSlug) return;
    window.location.href = `${API_BASE}/api/auth/sso/start?org=${ssoInfo.orgSlug}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  const providerLabel = ssoInfo?.provider === 'saml' ? 'SSO (SAML)' : 'SSO';

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--c-bg2)', padding:'1rem' }}>
      <div style={{ width:'100%', maxWidth:400, background:'var(--c-bg)', borderRadius:'var(--radius-lg)', padding:'2rem', boxShadow:'0 4px 24px rgba(0,0,0,0.08)' }}>

        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:'1.5rem' }}>
          <div style={{ width:30, height:30, background:'var(--c-purple)', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L12.5 7L7 12.5L1.5 7L7 1.5Z" stroke="#fff" strokeWidth="1.5" fill="none"/><circle cx="7" cy="7" r="2" fill="#fff"/></svg>
          </div>
          <div><div style={{ fontSize:15, fontWeight:600, color:'var(--c-purple)' }}>PromptSense</div></div>
        </div>

        <h1 style={{ fontSize:20, fontWeight:500, marginBottom:6 }}>Sign in</h1>
        <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:'1.5rem' }}>Welcome back to PromptSense.</p>

        {/* SSO error from redirect */}
        {ssoError && (
          <div style={{ padding:'10px 12px', borderRadius:'var(--radius)', background:'var(--c-red)15',
                        border:'0.5px solid var(--c-red)44', marginBottom:14, fontSize:12, color:'var(--c-red)' }}>
            <strong>SSO error:</strong> {decodeURIComponent(ssoError)}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Alert type="error" message={error} />

          {/* Email — triggers SSO domain check */}
          <div>
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={handleEmailChange}
              placeholder="you@company.com"
              required
            />
            {ssoChecking && (
              <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:4 }}>Checking SSO…</div>
            )}
          </div>

          {/* SSO detected — show prominent SSO button */}
          {ssoInfo && (
            <div style={{ padding:'14px 16px', borderRadius:'var(--radius)',
                          background:'var(--c-purple)08', border:'1px solid var(--c-purple)33' }}>
              <div style={{ fontSize:12, color:'var(--c-text2)', marginBottom:10 }}>
                Your organization uses <strong>{providerLabel}</strong> for authentication.
              </div>
              <button
                type="button"
                onClick={handleSsoLogin}
                style={{ width:'100%', padding:'9px', fontSize:13, fontWeight:500, borderRadius:'var(--radius)',
                         background:'var(--c-purple)', color:'#fff', border:'none', cursor:'pointer',
                         display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <span>🔐</span>
                Continue with {providerLabel}
              </button>
              <div style={{ fontSize:11, color:'var(--c-text3)', textAlign:'center', marginTop:8 }}>
                or sign in with password below
              </div>
            </div>
          )}

          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({...f, password: e.target.value}))}
            placeholder="••••••••"
            required
          />

          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <Link to="/auth/forgot-password" style={{ fontSize:12, color:'var(--c-purple)' }}>Forgot password?</Link>
          </div>

          <Btn type="submit" loading={loading} style={{ width:'100%', justifyContent:'center' }}>Sign in</Btn>
        </form>

        {/* SSO direct login — always visible */}
        <div style={{ marginTop:16, paddingTop:16, borderTop:'0.5px solid var(--c-border)' }}>
          <details>
            <summary style={{ fontSize:12, color:'var(--c-text3)', cursor:'pointer', userSelect:'none' }}>
              Sign in with SSO using organization slug
            </summary>
            <SsoSlugLogin apiBase={API_BASE} />
          </details>
        </div>

        <p style={{ marginTop:'1rem', fontSize:13, color:'var(--c-text2)', textAlign:'center' }}>
          Don't have an account? <Link to="/auth/register" style={{ color:'var(--c-purple)', fontWeight:500 }}>Sign up free</Link>
        </p>
      </div>
    </div>
  );
}

/** Manual SSO login with org slug — for users who know their org slug */
function SsoSlugLogin({ apiBase }) {
  const [slug, setSlug] = useState('');

  const go = () => {
    if (!slug.trim()) return;
    window.location.href = `${apiBase}/api/auth/sso/start?org=${slug.trim().toLowerCase()}`;
  };

  return (
    <div style={{ marginTop:10, display:'flex', gap:8 }}>
      <input
        value={slug}
        onChange={e => setSlug(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && go()}
        placeholder="your-org-slug"
        style={{ flex:1, padding:'7px 10px', fontSize:12, borderRadius:'var(--radius)',
                 border:'0.5px solid var(--c-border2)', background:'var(--c-bg2)', color:'var(--c-text)' }}
      />
      <button
        onClick={go}
        style={{ padding:'7px 14px', fontSize:12, fontWeight:500, borderRadius:'var(--radius)',
                 background:'var(--c-purple)', color:'#fff', border:'none', cursor:'pointer' }}>
        Continue
      </button>
    </div>
  );
}
