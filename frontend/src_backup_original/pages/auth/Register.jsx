import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api';
import { Input, Btn, Alert } from '../../components/UI';

// ── Register ──────────────────────────────────────────────────────────────────
export function Register() {
  const [form, setForm] = useState({ email:'', password:'', fullName:'', orgName:'' });
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

  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({...p, [k]: e.target.value})) });

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--c-bg2)', padding:'1rem' }}>
      <div style={{ width:'100%', maxWidth:440, background:'var(--c-bg)', borderRadius:'var(--radius-lg)', padding:'2rem', boxShadow:'0 4px 24px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize:20, fontWeight:500, marginBottom:4 }}>Create your account</h1>
        <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:'1.5rem' }}>Start with a free 14-day trial. No credit card required.</p>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Alert type="error" message={error} />
          <Input label="Full name"     type="text"     {...f('fullName')} placeholder="Jane Smith"       required />
          <Input label="Work email"    type="email"    {...f('email')}    placeholder="jane@company.com"  required />
          <Input label="Password"      type="password" {...f('password')} placeholder="8+ characters"     required />
          <Input label="Organization"  type="text"     {...f('orgName')}  placeholder="Acme Corp"         required />
          <Btn type="submit" loading={loading} style={{ width:'100%', justifyContent:'center' }}>Create account</Btn>
          <p style={{ fontSize:11, color:'var(--c-text3)', textAlign:'center' }}>By signing up you agree to our Terms of Service and Privacy Policy.</p>
        </form>
        <p style={{ marginTop:'1.25rem', fontSize:13, color:'var(--c-text2)', textAlign:'center' }}>
          Already have an account? <Link to="/auth/login" style={{ color:'var(--c-purple)', fontWeight:500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

// ── Forgot password ───────────────────────────────────────────────────────────
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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--c-bg2)', padding:'1rem' }}>
      <div style={{ width:'100%', maxWidth:400, background:'var(--c-bg)', borderRadius:'var(--radius-lg)', padding:'2rem', boxShadow:'0 4px 24px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize:20, fontWeight:500, marginBottom:6 }}>Reset password</h1>
        {sent ? (
          <Alert type="success" message="Check your email for a reset link. It expires in 1 hour." />
        ) : (
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <p style={{ fontSize:13, color:'var(--c-text2)' }}>Enter your email and we'll send a reset link.</p>
            <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
            <Btn type="submit" loading={loading} style={{ width:'100%', justifyContent:'center' }}>Send reset link</Btn>
          </form>
        )}
        <p style={{ marginTop:'1.25rem', fontSize:13, color:'var(--c-text2)', textAlign:'center' }}>
          <Link to="/auth/login" style={{ color:'var(--c-purple)' }}>← Back to login</Link>
        </p>
      </div>
    </div>
  );
}

// ── Reset password ────────────────────────────────────────────────────────────
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
      setTimeout(() => navigate('/auth/login'), 2000);
    } catch (err) { setError(err.response?.data?.error || 'Reset failed'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--c-bg2)', padding:'1rem' }}>
      <div style={{ width:'100%', maxWidth:400, background:'var(--c-bg)', borderRadius:'var(--radius-lg)', padding:'2rem', boxShadow:'0 4px 24px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize:20, fontWeight:500, marginBottom:'1rem' }}>Set new password</h1>
        {done ? <Alert type="success" message="Password updated! Redirecting to login…" /> : (
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Alert type="error" message={error} />
            <Input label="New password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="8+ characters" required />
            <Btn type="submit" loading={loading} style={{ width:'100%', justifyContent:'center' }}>Set password</Btn>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Verify email ──────────────────────────────────────────────────────────────
export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying');

  useState(() => {
    authApi.verifyEmail(searchParams.get('token'))
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  });

  const msgs = {
    verifying: { type:'info',    msg:'Verifying your email…' },
    success:   { type:'success', msg:'Email verified! You can now sign in.' },
    error:     { type:'error',   msg:'Verification link is invalid or expired.' },
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--c-bg2)', padding:'1rem' }}>
      <div style={{ width:'100%', maxWidth:400, background:'var(--c-bg)', borderRadius:'var(--radius-lg)', padding:'2rem', display:'flex', flexDirection:'column', gap:16 }}>
        <h1 style={{ fontSize:20, fontWeight:500 }}>Email verification</h1>
        <Alert type={msgs[status].type} message={msgs[status].msg} />
        <Link to="/auth/login" style={{ fontSize:13, color:'var(--c-purple)' }}>→ Go to login</Link>
      </div>
    </div>
  );
}

export default Register;
