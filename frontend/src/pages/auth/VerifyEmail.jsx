import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../services/api';
import { Alert, Spinner } from '../../components/UI';

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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--c-bg2)', padding:'1rem' }}>
      <div style={{ width:'100%', maxWidth:420, background:'var(--c-bg)', borderRadius:'var(--radius-lg)', padding:'2rem', boxShadow:'0 4px 24px rgba(0,0,0,0.08)', display:'flex', flexDirection:'column', gap:16 }}>
        <h1 style={{ fontSize:20, fontWeight:500 }}>Email verification</h1>
        {status === 'verifying' && (
          <div style={{ display:'flex', alignItems:'center', gap:10, color:'var(--c-text2)', fontSize:13 }}>
            <Spinner size={16} /> Verifying your email address…
          </div>
        )}
        {status === 'success' && (
          <>
            <Alert type="success" message="Your email has been verified successfully!" />
            <p style={{ fontSize:13, color:'var(--c-text2)' }}>You can now sign in to your PromptSense account.</p>
            <Link to="/auth/login" style={{ fontSize:13, fontWeight:500, color:'var(--c-purple)' }}>→ Go to login</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <Alert type="error" message="Verification link is invalid or has expired." />
            <p style={{ fontSize:13, color:'var(--c-text2)' }}>Request a new verification email by logging in and visiting your settings.</p>
            <Link to="/auth/login" style={{ fontSize:13, color:'var(--c-purple)' }}>← Back to login</Link>
          </>
        )}
      </div>
    </div>
  );
}
