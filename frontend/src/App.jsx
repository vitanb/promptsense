import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Component } from 'react';
import { useAuth } from './context/AuthContext';
import { useOrg } from './context/OrgContext';
import { Spinner } from './components/UI';

// Auth pages
import Login          from './pages/auth/Login';
import Register, { CheckEmail } from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword  from './pages/auth/ResetPassword';
import VerifyEmail    from './pages/auth/VerifyEmail';

// Marketing
import Landing  from './pages/Landing';
import Pricing  from './pages/Pricing';

// Dashboard shell + pages
import DashboardShell  from './pages/dashboard/Shell';
import Onboarding      from './pages/dashboard/Onboarding';
import Playground      from './pages/dashboard/Playground';
import Integrations    from './pages/dashboard/Integrations';
import Guardrails      from './pages/dashboard/Guardrails';
import Policies        from './pages/dashboard/Policies';
import Templates       from './pages/dashboard/Templates';
import Webhooks        from './pages/dashboard/Webhooks';
import Analytics       from './pages/dashboard/Analytics';
import AuditLog        from './pages/dashboard/AuditLog';
import Members         from './pages/dashboard/Members';
import Billing         from './pages/dashboard/Billing';
import Settings        from './pages/dashboard/Settings';
import ApiKeys         from './pages/dashboard/ApiKeys';
import Gauntlet        from './pages/dashboard/Gauntlet';
import Downstream      from './pages/dashboard/Downstream';
import SSO             from './pages/dashboard/SSO';
import Slack           from './pages/dashboard/Slack';
import SuperAdmin      from './pages/dashboard/SuperAdmin';
import SsoCallback     from './pages/auth/SsoCallback';

// ─────────────────────────────────────────────────────────────────────────────
// Error Boundary — catches render-time errors in production and shows a message
// instead of a blank white page
// ─────────────────────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err) {
    return { error: err };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#09090b', padding: '2rem', flexDirection: 'column', gap: 16, textAlign: 'center',
      }}>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#f4f4f5' }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: '#71717a', maxWidth: 380, lineHeight: 1.6 }}>
          {this.state.error?.message || 'An unexpected error occurred. Please refresh the page.'}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500,
            background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Reload page
        </button>
        <details style={{ fontSize: 11, color: '#52525b', maxWidth: 440 }}>
          <summary style={{ cursor: 'pointer' }}>Technical details</summary>
          <pre style={{ marginTop: 8, textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error?.stack}
          </pre>
        </details>
      </div>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth guards
// ─────────────────────────────────────────────────────────────────────────────
function FullScreenSpinner() {
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      height: '100vh', background: '#09090b',
    }}>
      <Spinner size={28} />
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  return children;
}

function RequireGuest({ children }) {
  const { user, loading } = useAuth();
  // Show spinner instead of null — prevents blank-page flash during auth check
  if (loading) return <FullScreenSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trial gate
// ─────────────────────────────────────────────────────────────────────────────
const TRIAL_ALLOWED   = new Set(['playground', 'integrations', 'onboarding', 'billing', 'api-keys']);
const EXPIRED_ALLOWED = new Set(['billing']);

function TrialGate({ slug, children }) {
  const { user } = useAuth();
  const { isTrialActive, isTrialExpired, orgDetail } = useOrg();
  const isSuperuser = user?.isSuperuser === true;

  if (isSuperuser) return children;
  if (!orgDetail)  return children;
  if (orgDetail.is_paid || orgDetail.subscription_status === 'active') return children;
  if (orgDetail.plan_name !== 'starter') return children;

  if (isTrialExpired && !EXPIRED_ALLOWED.has(slug)) return <Navigate to="/dashboard/billing" replace />;
  if (isTrialActive  && !TRIAL_ALLOWED.has(slug))   return <Navigate to="/dashboard/billing" replace />;
  return children;
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public */}
        <Route path="/"        element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />

        {/* Auth */}
        <Route path="/auth/login"           element={<RequireGuest><Login /></RequireGuest>} />
        <Route path="/auth/register"        element={<RequireGuest><Register /></RequireGuest>} />
        <Route path="/auth/check-email"     element={<CheckEmail />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/reset-password"  element={<ResetPassword />} />
        <Route path="/auth/verify-email"    element={<VerifyEmail />} />
        <Route path="/auth/sso/callback"    element={<SsoCallback />} />

        {/* Dashboard — all children protected */}
        <Route path="/dashboard/*" element={<RequireAuth><DashboardShell /></RequireAuth>}>
          <Route index element={<Navigate to="onboarding" replace />} />
          <Route path="onboarding"   element={<Onboarding />} />
          <Route path="playground"   element={<Playground />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="billing"      element={<Billing />} />
          <Route path="api-keys"     element={<ApiKeys />} />
          <Route path="guardrails"   element={<TrialGate slug="guardrails"><Guardrails /></TrialGate>} />
          <Route path="policies"     element={<TrialGate slug="policies"><Policies /></TrialGate>} />
          <Route path="templates"    element={<TrialGate slug="templates"><Templates /></TrialGate>} />
          <Route path="webhooks"     element={<TrialGate slug="webhooks"><Webhooks /></TrialGate>} />
          <Route path="analytics"    element={<TrialGate slug="analytics"><Analytics /></TrialGate>} />
          <Route path="audit"        element={<TrialGate slug="audit"><AuditLog /></TrialGate>} />
          <Route path="members"      element={<TrialGate slug="members"><Members /></TrialGate>} />
          <Route path="settings"     element={<TrialGate slug="settings"><Settings /></TrialGate>} />
          <Route path="gauntlet"     element={<TrialGate slug="gauntlet"><Gauntlet /></TrialGate>} />
          <Route path="downstream"   element={<TrialGate slug="downstream"><Downstream /></TrialGate>} />
          <Route path="sso"          element={<TrialGate slug="sso"><SSO /></TrialGate>} />
          <Route path="slack"        element={<TrialGate slug="slack"><Slack /></TrialGate>} />
          <Route path="super-admin"  element={<SuperAdmin />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
