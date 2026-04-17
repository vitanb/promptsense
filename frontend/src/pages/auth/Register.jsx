import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api';
import { Input, Btn, Alert } from '../../components/UI';
import { AuthLayout, AuthLogo } from './Login';

// ── Register ──────────────────────────────────────────────────────────────
export function Register() {
  const [form, setForm] = useState({ email: '', password: '', fullName: '', orgName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await register(form); navigate('/dashboard/onboarding'); }
    catch (err) { setError(err.response?.data?.error || 'Registration failed'); }
    finally { setLoading(false); }
  };

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) });

  return (
    <AuthLayout wide>
      <AuthLogo subtitle="Enterprise AI Guardrails" />

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Create your account
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          7-day free trial. No credit card required.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <Alert type="error" message={error} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="Full name"     type="text"     {...f('fullName')} placeholder="Jane Smith"       required />
          <Input label="Organization"  type="text"     {...f('orgName')}  placeholder="Acme Corp"         required />
        </div>
        <Input label="Work email"    type="email"    {...f('email')}    placeholder="jane@company.com"  required />
        <Input label="Password"      type="password" {...f('password')} placeholder="8+ characters"     required
          hint="Use at least 8 characters with a mix of letters and numbers."
        />

        <Btn type="submit" loading={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
          Create account →
        </Btn>

        <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.5 }}>
          By signing up you agree to our{' '}
          <span style={{ color: 'var(--accent-light)' }}>Terms of Service</span> and{' '}
          <span style={{ color: 'var(--accent-light)' }}>Privacy Policy</span>.
        </p>
      </form>

      <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          Already have an account?{' '}
          <Link to="/auth/login" style={{ color: 'var(--accent-light)', fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

// ── Forgot password ────────────────────────────────────────────────────────
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    await authApi.forgotPassword(email).catch(() => {});
    setSent(true); setLoading(false);
  };

  return (
    <AuthLayout>
      <AuthLogo />

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Reset password
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          Enter your email and we'll send a reset link.
        </p>
      </div>

      {sent ? (
        <div>
          <Alert type="success" message="Check your inbox — a reset link is on its way. It expires in 1 hour." />
          <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>
            <Link to="/auth/login" style={{ color: 'var(--accent-light)' }}>← Back to sign in</Link>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input
            label="Email address"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
          <Btn type="submit" loading={loading} style={{ width: '100%', justifyContent: 'center' }}>
            Send reset link
          </Btn>
          <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>
            <Link to="/auth/login" style={{ color: 'var(--accent-light)' }}>← Back to sign in</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}

// ── Reset password ─────────────────────────────────────────────────────────
export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await authApi.resetPassword(searchParams.get('token'), password);
      setDone(true);
      setTimeout(() => navigate('/auth/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed. The link may be expired.');
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout>
      <AuthLogo />

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Set new password
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          Choose a strong password for your account.
        </p>
      </div>

      {done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Alert type="success" message="Password updated! Redirecting you to sign in…" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Alert type="error" message={error} />
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="8+ characters"
            required
            hint="Use at least 8 characters."
          />
          <Btn type="submit" loading={loading} style={{ width: '100%', justifyContent: 'center' }}>
            Set password
          </Btn>
        </form>
      )}
    </AuthLayout>
  );
}

// ── Verify email ───────────────────────────────────────────────────────────
export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying');

  useState(() => {
    authApi.verifyEmail(searchParams.get('token'))
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  });

  const cfg = {
    verifying: { type: 'info',    msg: 'Verifying your email address…' },
    success:   { type: 'success', msg: 'Email verified! You can now sign in.' },
    error:     { type: 'error',   msg: 'Verification link is invalid or has expired.' },
  };

  return (
    <AuthLayout>
      <AuthLogo />
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Email verification
        </h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Alert type={cfg[status].type} message={cfg[status].msg} />
        <Link to="/auth/login" style={{ fontSize: 13, color: 'var(--accent-light)' }}>
          → Go to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}

export default Register;
