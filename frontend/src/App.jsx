import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Spinner } from './components/UI';

// Auth pages
import Login       from './pages/auth/Login';
import Register    from './pages/auth/Register';
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
import SSO            from './pages/dashboard/SSO';
import SuperAdmin      from './pages/dashboard/SuperAdmin';
import SsoCallback     from './pages/auth/SsoCallback';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}><Spinner size={32} /></div>;
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  return children;
}

function RequireGuest({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />

      {/* Auth */}
      <Route path="/auth/login"          element={<RequireGuest><Login /></RequireGuest>} />
      <Route path="/auth/register"       element={<RequireGuest><Register /></RequireGuest>} />
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
        <Route path="guardrails"   element={<Guardrails />} />
        <Route path="policies"     element={<Policies />} />
        <Route path="templates"    element={<Templates />} />
        <Route path="webhooks"     element={<Webhooks />} />
        <Route path="analytics"    element={<Analytics />} />
        <Route path="audit"        element={<AuditLog />} />
        <Route path="members"      element={<Members />} />
        <Route path="billing"      element={<Billing />} />
        <Route path="settings"     element={<Settings />} />
        <Route path="api-keys"     element={<ApiKeys />} />
        <Route path="gauntlet"     element={<Gauntlet />} />
        <Route path="downstream"   element={<Downstream />} />
        <Route path="sso"          element={<SSO />} />
        <Route path="super-admin"  element={<SuperAdmin />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
