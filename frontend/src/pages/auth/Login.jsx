import { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Input, Btn, Alert } from '../../components/UI';
import { authApi } from '../../services/api';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/api$/, '');

// ── Shared auth-page wrapper ──────────────────────────────────────────────
export function AuthLayout({ children, wide = false }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', background: 'var(--bg)',
      alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      /* subtle dot grid */
      backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
      backgroundSize: '28px 28px',
    }}>
      {/* Glow blob */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 480, height: 320, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(124,58,237,0.12) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: wide ? 480 : 420,
        background: 'var(--bg3)',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--radius-xl)',
        padding: '2rem',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.05) inset',
        animation: 'scaleIn 0.2s ease',
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Logo mark ─────────────────────────────────────────────────────────────
export function AuthLogo({ subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.75rem' }}>
      <div style={{
        width: 32, height: 32,
        background: 'linear-gradient(135deg, var(--accent-mid), var(--accent))',
        borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 12px var(--accent-glow)',
        flexShrink: 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5L12.5 7L7 12.5L1.5 7L7 1.5Z" stroke="#fff" strokeWidth="1.6" fill="none"/>
          <circle cx="7" cy="7" r="2.1" fill="#fff"/>
        </svg>
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.025em' }}>
          PromptSense
        </div>
        {subtitle && (
          <div style={{ fontSize: 10.5, color: 'var(--text3)', fontWeight: 500 }}>{subtitle}</div>
        )}
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────
export default function Login() {
  const [form, setForm]           = useState({ email: '', password: '' });
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [ssoInfo, setSsoInfo]     = useState(null);
  const [ssoChecking, setSsoChecking] = useState(false);
  const emailCheckTimer = useRef(null);

  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from?.pathname || '/dashboard';

  const ssoError = new URLSearchParams(location.search).get('sso_error');

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
      } catch (_) {}
      finally { setSsoChecking(false); }
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
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally { setLoading(false); }
  };

  const providerLabel = ssoInfo?.provider === 'saml' ? 'SAML SSO' : 'Single Sign-On';

  return (
    <AuthLayout>
      <AuthLogo subtitle="Enterprise AI Guardrails" />

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Welcome back
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>Sign in to your PromptSense account.</p>
      </div>

      {/* SSO error */}
      {ssoError && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 12,
          background: 'var(--red-dim)', border: '1px solid var(--red-border)',
          color: 'var(--red)', marginBottom: 14,
        }}>
          <strong>SSO error:</strong> {decodeURIComponent(ssoError)}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Alert type="error" message={error} />

        <div>
          <Input
            label="Email address"
            type="email"
            value={form.email}
            onChange={handleEmailChange}
            placeholder="you@company.com"
            required
          />
          {ssoChecking && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Checking SSO…</div>
          )}
        </div>

        {/* SSO detected */}
        {ssoInfo && (
          <div style={{
            padding: '14px 16px', borderRadius: 'var(--radius)',
            background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
              Your organization uses <strong style={{ color: 'var(--accent-light)' }}>{providerLabel}</strong>.
            </div>
            <button
              type="button"
              onClick={handleSsoLogin}
              style={{
                width: '100%', height: 36, fontSize: 13, fontWeight: 600,
                borderRadius: 'var(--radius)', background: 'var(--accent-mid)',
                color: '#fff', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: 'inherit',
              }}
            >
              <span>🔐</span> Continue with {providerLabel}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 8 }}>
              or sign in with password below
            </div>
          </div>
        )}

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Password
            </label>
            <Link to="/auth/forgot-password" style={{ fontSize: 11, color: 'var(--accent-light)' }}>
              Forgot password?
            </Link>
          </div>
          <Input
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="••••••••"
            required
          />
        </div>

        <Btn type="submit" loading={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 2 }}>
          Sign in
        </Btn>
      </form>

      {/* SSO manual slug */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <details>
          <summary style={{ fontSize: 12, color: 'var(--text3)', cursor: 'pointer', userSelect: 'none', listStyle: 'none' }}>
            <span>Sign in with SSO using org slug ↓</span>
          </summary>
          <SsoSlugLogin apiBase={API_BASE} />
        </details>
      </div>

      <p style={{ marginTop: '1.25rem', fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>
        Don't have an account?{' '}
        <Link to="/auth/register" style={{ color: 'var(--accent-light)', fontWeight: 500 }}>
          Start free trial
        </Link>
      </p>
    </AuthLayout>
  );
}

function SsoSlugLogin({ apiBase }) {
  const [slug, setSlug] = useState('');
  const go = () => {
    if (!slug.trim()) return;
    window.location.href = `${apiBase}/api/auth/sso/start?org=${slug.trim().toLowerCase()}`;
  };
  return (
    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
      <input
        value={slug}
        onChange={e => setSlug(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && go()}
        placeholder="your-org-slug"
        style={{
          flex: 1, height: 32, padding: '0 10px', fontSize: 12,
          borderRadius: 'var(--radius)', border: '1px solid var(--border2)',
          background: 'var(--bg5)', color: 'var(--text)', outline: 'none',
        }}
      />
      <button
        onClick={go}
        style={{
          padding: '0 14px', height: 32, fontSize: 12, fontWeight: 500,
          borderRadius: 'var(--radius)', background: 'var(--accent)',
          color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Go
      </button>
    </div>
  );
}
