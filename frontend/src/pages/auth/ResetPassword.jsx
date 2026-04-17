import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../services/api';
import { Input, Btn, Alert } from '../../components/UI';
import { AuthLayout, AuthLogo } from './Login';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return; }
    setError(''); setLoading(true);
    try {
      await authApi.resetPassword(searchParams.get('token'), password);
      setDone(true);
      setTimeout(() => navigate('/auth/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed — the link may have expired');
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout>
      <AuthLogo />

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Set new password
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>Choose a strong password for your account.</p>
      </div>

      {done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Alert type="success" message="Password updated successfully. Redirecting to sign in…" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Alert type="error" message={error} />
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
          />
          <Input
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat password"
            required
          />
          <Btn type="submit" loading={loading} style={{ width: '100%', justifyContent: 'center' }}>
            Update password
          </Btn>
        </form>
      )}

      <p style={{ marginTop: '1.25rem', fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>
        <Link to="/auth/login" style={{ color: 'var(--accent-light)' }}>← Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}
