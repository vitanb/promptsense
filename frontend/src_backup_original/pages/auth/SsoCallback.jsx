import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * /auth/sso/callback
 *
 * The backend redirects here after a successful SSO flow with the tokens
 * in query params:  ?at=ACCESS_TOKEN&rt=REFRESH_TOKEN&orgId=...&orgName=...&...
 *
 * This page stores them, updates auth context, then navigates to /dashboard.
 * On error (?error=...) it shows the message and links back to login.
 */
export default function SsoCallback() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { saveSession } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const ssoError = params.get('sso_error') || params.get('error');
    if (ssoError) {
      setError(decodeURIComponent(ssoError));
      return;
    }

    const at       = params.get('at');
    const rt       = params.get('rt');
    const orgId    = params.get('orgId');
    const orgName  = params.get('orgName');
    const orgSlug  = params.get('orgSlug');
    const role     = params.get('role');
    const planName = params.get('planName');

    if (!at || !rt) {
      setError('SSO response is missing tokens. Please try again.');
      return;
    }

    // Store tokens
    localStorage.setItem('ps_access_token',  at);
    localStorage.setItem('ps_refresh_token', rt);
    if (orgId) {
      localStorage.setItem('ps_org_id', orgId);
      const org = { org_id: orgId, org_name: orgName, slug: orgSlug, role, plan_name: planName };
      localStorage.setItem('ps_orgs', JSON.stringify([org]));
    }

    // Trigger auth context refresh (it will call /auth/me)
    if (saveSession) {
      saveSession({ accessToken: at, refreshToken: rt, user: {}, orgs: orgId
        ? [{ org_id: orgId, org_name: orgName, slug: orgSlug, role, plan_name: planName }]
        : []
      });
    }

    navigate('/dashboard', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
                    background:'var(--c-bg2)', padding:'1rem' }}>
        <div style={{ maxWidth:420, background:'var(--c-bg)', borderRadius:'var(--radius-lg)',
                      padding:'2rem', boxShadow:'0 4px 24px rgba(0,0,0,.08)', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
          <h2 style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>SSO sign-in failed</h2>
          <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:20 }}>{error}</p>
          <a href="/auth/login" style={{ fontSize:13, color:'var(--c-purple)', fontWeight:500 }}>
            ← Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
                  background:'var(--c-bg2)', flexDirection:'column', gap:12 }}>
      <div style={{ width:28, height:28, border:'3px solid var(--c-purple)', borderTopColor:'transparent',
                    borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <div style={{ fontSize:13, color:'var(--c-text2)' }}>Completing sign-in…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
