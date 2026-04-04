import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Input, Btn, Alert } from '../../components/UI';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

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

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--c-bg2)', padding:'1rem' }}>
      <div style={{ width:'100%', maxWidth:400, background:'var(--c-bg)', borderRadius:'var(--radius-lg)', padding:'2rem', boxShadow:'0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:'1.5rem' }}>
          <div style={{ width:30, height:30, background:'var(--c-purple)', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L12.5 7L7 12.5L1.5 7L7 1.5Z" stroke="#fff" strokeWidth="1.5" fill="none"/><circle cx="7" cy="7" r="2" fill="#fff"/></svg>
          </div>
          <div><div style={{ fontSize:15, fontWeight:600, color:'var(--c-purple)' }}>PromptSense</div></div>
        </div>
        <h1 style={{ fontSize:20, fontWeight:500, marginBottom:6 }}>Sign in</h1>
        <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:'1.5rem' }}>Welcome back to PromptSense.</p>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Alert type="error" message={error} />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="you@company.com" required />
          <Input label="Password" type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="••••••••" required />
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <Link to="/auth/forgot-password" style={{ fontSize:12, color:'var(--c-purple)' }}>Forgot password?</Link>
          </div>
          <Btn type="submit" loading={loading} style={{ width:'100%', justifyContent:'center' }}>Sign in</Btn>
        </form>
        <p style={{ marginTop:'1.5rem', fontSize:13, color:'var(--c-text2)', textAlign:'center' }}>
          Don't have an account? <Link to="/auth/register" style={{ color:'var(--c-purple)', fontWeight:500 }}>Sign up free</Link>
        </p>
      </div>
    </div>
  );
}
