import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', withCredentials: true });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ps_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const orgId = localStorage.getItem('ps_org_id');
  // Only attach org header if it's a real UUID — prevents "undefined"/"null" strings leaking in
  if (orgId && UUID_RE.test(orgId)) config.headers['X-Org-Id'] = orgId;
  return config;
});

// Auto-refresh on 401
let refreshing = false;
let queue = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && err.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      if (refreshing) {
        return new Promise((resolve, reject) => queue.push({ resolve, reject }))
          .then(() => api(original));
      }
      original._retry = true;
      refreshing = true;
      try {
        const refresh = localStorage.getItem('ps_refresh_token');
        const { data } = await axios.post('/api/auth/refresh', { refreshToken: refresh });
        localStorage.setItem('ps_access_token', data.accessToken);
        localStorage.setItem('ps_refresh_token', data.refreshToken);
        queue.forEach(({ resolve }) => resolve());
        queue = [];
        return api(original);
      } catch (e) {
        queue.forEach(({ reject }) => reject(e));
        queue = [];
        localStorage.clear();
        window.location.href = '/auth/login';
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post('/auth/register', data).then(r => r.data),
  login:    (data) => api.post('/auth/login', data).then(r => r.data),
  logout:   ()     => api.post('/auth/logout', { refreshToken: localStorage.getItem('ps_refresh_token') }),
  me:       ()     => api.get('/auth/me').then(r => r.data),
  verifyEmail:    (token)            => api.post('/auth/verify-email', { token }).then(r => r.data),
  forgotPassword: (email)            => api.post('/auth/forgot-password', { email }).then(r => r.data),
  resetPassword:  (token, password)  => api.post('/auth/reset-password', { token, password }).then(r => r.data),
  deleteAccount:  (password)         => api.delete('/auth/account', { data: { password } }).then(r => r.data),
};

// ── Org ───────────────────────────────────────────────────────────────────────
const o = (orgId) => `/orgs/${orgId}`;

export const orgApi = {
  get:           (orgId)       => api.get(o(orgId)).then(r => r.data),
  update:        (orgId, data) => api.patch(o(orgId), data).then(r => r.data),
  updateBranding:(orgId, data) => api.patch(`${o(orgId)}/branding`, data).then(r => r.data),

  // Members
  members:          (orgId)                   => api.get(`${o(orgId)}/members`).then(r => r.data),
  invite:           (orgId, data)             => api.post(`${o(orgId)}/members/invite`, data).then(r => r.data),
  updateRole:       (orgId, memberId, role)   => api.patch(`${o(orgId)}/members/${memberId}/role`, { role }).then(r => r.data),
  updateDepartment: (orgId, memberId, department) => api.patch(`${o(orgId)}/members/${memberId}/department`, { department }).then(r => r.data),
  removeMember:     (orgId, memberId)         => api.delete(`${o(orgId)}/members/${memberId}`).then(r => r.data),

  // Providers
  providers:      (orgId)        => api.get(`${o(orgId)}/providers`).then(r => r.data),
  upsertProvider: (orgId, data)  => api.put(`${o(orgId)}/providers`, data).then(r => r.data),
  deleteProvider: (orgId, prov)  => api.delete(`${o(orgId)}/providers/${prov}`).then(r => r.data),

  // API Keys
  apiKeys:      (orgId)      => api.get(`${o(orgId)}/api-keys`).then(r => r.data),
  createApiKey: (orgId, data)=> api.post(`${o(orgId)}/api-keys`, data).then(r => r.data),
  revokeApiKey: (orgId, id)  => api.delete(`${o(orgId)}/api-keys/${id}`).then(r => r.data),
};

// ── Config ────────────────────────────────────────────────────────────────────
export const configApi = {
  // Guardrails
  guardrails:      (orgId)       => api.get(`${o(orgId)}/guardrails`).then(r => r.data),
  createGuardrail: (orgId, data) => api.post(`${o(orgId)}/guardrails`, data).then(r => r.data),
  updateGuardrail: (orgId, id, data) => api.patch(`${o(orgId)}/guardrails/${id}`, data).then(r => r.data),
  deleteGuardrail: (orgId, id)   => api.delete(`${o(orgId)}/guardrails/${id}`).then(r => r.data),

  // Policies
  policies:      (orgId)         => api.get(`${o(orgId)}/policies`).then(r => r.data),
  createPolicy:  (orgId, data)   => api.post(`${o(orgId)}/policies`, data).then(r => r.data),
  updatePolicy:  (orgId, id, data) => api.patch(`${o(orgId)}/policies/${id}`, data).then(r => r.data),
  deletePolicy:  (orgId, id)     => api.delete(`${o(orgId)}/policies/${id}`).then(r => r.data),

  // Templates
  templates:       (orgId)       => api.get(`${o(orgId)}/templates`).then(r => r.data),
  createTemplate:  (orgId, data) => api.post(`${o(orgId)}/templates`, data).then(r => r.data),
  updateTemplate:  (orgId, id, data) => api.patch(`${o(orgId)}/templates/${id}`, data).then(r => r.data),
  deleteTemplate:  (orgId, id)   => api.delete(`${o(orgId)}/templates/${id}`).then(r => r.data),

  // Webhooks
  webhooks:       (orgId)        => api.get(`${o(orgId)}/webhooks`).then(r => r.data),
  createWebhook:  (orgId, data)  => api.post(`${o(orgId)}/webhooks`, data).then(r => r.data),
  updateWebhook:  (orgId, id, data) => api.patch(`${o(orgId)}/webhooks/${id}`, data).then(r => r.data),
  deleteWebhook:  (orgId, id)    => api.delete(`${o(orgId)}/webhooks/${id}`).then(r => r.data),

  // Downstream
  downstream:       (orgId)      => api.get(`${o(orgId)}/downstream`).then(r => r.data),
  upsertDownstream: (orgId, data)=> api.put(`${o(orgId)}/downstream`, data).then(r => r.data),
};

// ── Proxy / Analytics ─────────────────────────────────────────────────────────
export const promptApi = {
  run:      (orgId, data)   => api.post(`${o(orgId)}/proxy`, data).then(r => r.data),
  audit:    (orgId, params) => api.get(`${o(orgId)}/audit`, { params }).then(r => r.data),
  exportCsv:(orgId)         => window.open(`/api${o(orgId)}/audit/export`, '_blank'),
  analytics:(orgId, params) => api.get(`${o(orgId)}/analytics`, { params }).then(r => r.data),
};

// ── Gauntlet ──────────────────────────────────────────────────────────────────
export const gauntletApi = {
  categories: (orgId)              => api.get(`${o(orgId)}/gauntlet/categories`).then(r => r.data),
  runs:       (orgId, params)      => api.get(`${o(orgId)}/gauntlet/runs`, { params }).then(r => r.data),
  createRun:  (orgId, data)        => api.post(`${o(orgId)}/gauntlet/runs`, data).then(r => r.data),
  getRun:     (orgId, runId)       => api.get(`${o(orgId)}/gauntlet/runs/${runId}`).then(r => r.data),
  results:    (orgId, runId, params) => api.get(`${o(orgId)}/gauntlet/runs/${runId}/results`, { params }).then(r => r.data),
  deleteRun:  (orgId, runId)       => api.delete(`${o(orgId)}/gauntlet/runs/${runId}`).then(r => r.data),
};

// ── Super Admin ───────────────────────────────────────────────────────────────
export const adminApi = {
  stats:              ()                    => api.get('/admin/stats').then(r => r.data),
  // Users
  listUsers:          (params)              => api.get('/admin/users', { params }).then(r => r.data),
  getUser:            (userId)              => api.get(`/admin/users/${userId}`).then(r => r.data),
  deleteUser:         (userId)              => api.delete(`/admin/users/${userId}`).then(r => r.data),
  toggleSuperuser:    (userId)              => api.patch(`/admin/users/${userId}/superuser`).then(r => r.data),
  resetPassword:      (userId, newPassword) => api.post(`/admin/users/${userId}/reset-password`, { newPassword }).then(r => r.data),
  // Tenants (orgs)
  listOrgs:           (params)              => api.get('/admin/orgs', { params }).then(r => r.data),
  getOrg:             (orgId)              => api.get(`/admin/orgs/${orgId}`).then(r => r.data),
  createOrg:          (data)               => api.post('/admin/orgs', data).then(r => r.data),
  updateOrgPlan:      (orgId, planName)     => api.patch(`/admin/orgs/${orgId}/plan`, { planName }).then(r => r.data),
  suspendOrg:         (orgId, reason)       => api.post(`/admin/orgs/${orgId}/suspend`, { reason }).then(r => r.data),
  activateOrg:        (orgId)              => api.post(`/admin/orgs/${orgId}/activate`).then(r => r.data),
  deleteOrg:          (orgId)              => api.delete(`/admin/orgs/${orgId}`).then(r => r.data),
};

// ── Billing ───────────────────────────────────────────────────────────────────
export const billingApi = {
  get:      (orgId)      => api.get(`${o(orgId)}/billing`).then(r => r.data),
  checkout: (orgId, data)=> api.post(`${o(orgId)}/billing/checkout`, data).then(r => r.data),
  portal:   (orgId)      => api.post(`${o(orgId)}/billing/portal`).then(r => r.data),
  plans:    ()           => api.get('/plans').then(r => r.data),
};

export default api;
