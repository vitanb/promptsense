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

  // Permission helper
  const ROLE_RANK = { user: 0, developer: 1, administrator: 2 };
  const can = (minRole) => (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[minRole] ?? 99);

  return (
    <OrgContext.Provider value={{ currentOrg, orgDetail, role, loading, switchOrg, can, setOrgDetail }}>
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);
