import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../services/api';
import { Alert, Spinner } from '../../components/UI';
import { AuthLayout, AuthLogo } from './Login';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying'); // verifying | success | error

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setStatus('error'); return; }
    authApi.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, []);

  return (
    <AuthLayout>
      <AuthLogo />

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Email verification
        </h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {status === 'verifying' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text2)', fontSize: 13, padding: '8px 0' }}>
            <Spinner size={16} />
            Verifying your email address…
          </div>
        )}

        {status === 'success' && (
          <>
            <Alert type="success" message="Your email has been verified successfully!" />
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>
              You can now sign in to your PromptSense account.
            </p>
            <Link to="/auth/login" style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-light)' }}>
              → Go to sign in
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <Alert type="error" message="Verification link is invalid or has expired." />
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>
              Request a new verification email by logging in and visiting your account settings.
            </p>
            <Link to="/auth/login" style={{ fontSize: 13, color: 'var(--accent-light)' }}>
              ← Back to sign in
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
