import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { orgApi } from '../services/api';

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const { orgs, user } = useAuth();
  const [currentOrg, setCurrentOrg] = useState(null);
  const [orgDetail, setOrgDetail]   = useState(null);
  const [role, setRole]             = useState(null);
  const [loading, setLoading]       = useState(false);

  const isSuperuser = user?.isSuperuser === true;

  // Pick active org from localStorage or first in list
  useEffect(() => {
    if (!orgs.length) { setCurrentOrg(null); setOrgDetail(null); setRole(null); return; }
    const savedId = localStorage.getItem('ps_org_id');
    const match = orgs.find(o => o.org_id === savedId) || orgs[0];
    setCurrentOrg(match);
    setRole(match.role);
    localStorage.setItem('ps_org_id', match.org_id);
  }, [orgs]);

  // Fetch full org detail when currentOrg changes
  useEffect(() => {
    if (!currentOrg?.org_id) return;
    setLoading(true);
    orgApi.get(currentOrg.org_id)
      .then(setOrgDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentOrg?.org_id]);

  const switchOrg = (org) => {
    setCurrentOrg(org);
    setRole(org.role);
    localStorage.setItem('ps_org_id', org.org_id);
  };

  // Permission helper — superusers pass all role checks unconditionally
  const ROLE_RANK = { user: 0, developer: 1, administrator: 2 };
  const can = (minRole) => {
    if (isSuperuser) return true;
    return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[minRole] ?? 99);
  };

  // ── Trial / plan state ──────────────────────────────────────────────────────
  // Free plan = starter plan with no active paid subscription
  const isFreePlan = !isSuperuser
    && !!orgDetail
    && orgDetail.plan_name === 'starter'
    && orgDetail.is_paid !== true;

  // Compute trial window from trial_ends_at returned by the API
  const trialEndsAt    = orgDetail?.trial_ends_at ? new Date(orgDetail.trial_ends_at) : null;
  const now            = new Date();
  const trialMsLeft    = trialEndsAt ? trialEndsAt - now : 0;
  const trialDaysLeft  = trialMsLeft > 0 ? Math.ceil(trialMsLeft / (1000 * 60 * 60 * 24)) : 0;
  const isTrialActive  = isFreePlan && trialMsLeft > 0;
  const isTrialExpired = isFreePlan && trialMsLeft <= 0;

  // DEBUG — remove after confirming banner works
  if (orgDetail) console.log('[Trial]', { isSuperuser, plan: orgDetail.plan_name, is_paid: orgDetail.is_paid, trial_ends_at: orgDetail.trial_ends_at, isFreePlan, isTrialActive, isTrialExpired, trialDaysLeft });

  return (
    <OrgContext.Provider value={{
      currentOrg, orgDetail, role, loading, switchOrg, can, setOrgDetail, isSuperuser,
      isFreePlan, isTrialActive, isTrialExpired, trialDaysLeft, trialEndsAt,
    }}>
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);
