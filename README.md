# PromptSense

**Enterprise LLM guardrail and compliance platform.** Wrap any LLM provider with real-time input/output guardrails, audit logging, webhook alerts, and team-level RBAC — in minutes.

---

## Table of contents

- [Architecture overview](#architecture-overview)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Development workflow](#development-workflow)
- [API reference](#api-reference)
- [Database schema](#database-schema)
- [Deployment](#deployment)
- [CI/CD pipeline](#cicd-pipeline)
- [Stripe billing setup](#stripe-billing-setup)
- [Project structure](#project-structure)

---

## Architecture overview

```
Browser
  │
  ▼
┌─────────────────────────────────────────────────────┐
│  Frontend  (React + Vite, port 3000)                │
│  Landing · Pricing · Auth · Dashboard               │
└───────────────────┬─────────────────────────────────┘
                    │ /api/*  (proxied by Vite dev / nginx prod)
                    ▼
┌─────────────────────────────────────────────────────┐
│  Backend  (Node.js + Express, port 4000)            │
│                                                     │
│  Auth · Orgs · Guardrail engine · Proxy             │
│  Stripe billing · Webhook delivery                  │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
           ▼                      ▼
┌──────────────────┐   ┌──────────────────────────────┐
│  PostgreSQL 16   │   │  External LLM providers       │
│  (port 5432)     │   │  Anthropic · OpenAI · Gemini  │
└──────────────────┘   │  Mistral · Cohere · Azure     │
                       └──────────────────────────────┘
```

Every prompt flows through:

```
Input → [Input guardrails] → [Downstream system?] → [LLM provider] → [Output guardrails] → Response
              ↓                                                               ↓
         Block / warn                                                    Block / warn
              ↓                                                               ↓
         Audit log ←───────────────────────────────────────────────── Audit log
              ↓                                                               ↓
         Webhooks  ←───────────────────────────────────────────────── Webhooks
```

---

## Quick start

### Option A — one-command setup (recommended)

```bash
git clone https://github.com/your-org/promptsense.git
cd promptsense
bash scripts/setup.sh
```

The script will:
1. Check Node.js 18+, Docker prerequisites
2. Generate `backend/.env` with random JWT and encryption secrets
3. Install all `npm` dependencies (backend + frontend)
4. Start PostgreSQL via Docker Compose
5. Run database migrations
6. Seed plans and system guardrails

Then start dev servers:

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open **http://localhost:3000** and register your first account.

---

### Option B — Docker Compose (everything in containers)

```bash
git clone https://github.com/your-org/promptsense.git
cd promptsense

# Copy and edit env (add your Stripe keys at minimum)
cp backend/.env.example backend/.env

# Start all services
docker compose up

# In a separate terminal, run migrations once
docker compose exec backend npm run migrate
docker compose exec backend npm run seed
```

Open **http://localhost:3000**.

---

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in the values.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | 48+ char random string for access tokens |
| `JWT_REFRESH_SECRET` | ✅ | 48+ char random string for refresh tokens |
| `ENCRYPTION_KEY` | ✅ | 32-char hex key for AES-256-GCM (provider API key encryption) |
| `STRIPE_SECRET_KEY` | ✅ (billing) | `sk_test_...` or `sk_live_...` from Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | ✅ (billing) | `whsec_...` from Stripe webhook config |
| `STRIPE_PRICE_PRO` | ✅ (billing) | Stripe Price ID for monthly Pro plan |
| `STRIPE_PRICE_PRO_YEARLY` | ✅ (billing) | Stripe Price ID for yearly Pro plan |
| `STRIPE_PRICE_ENTERPRISE` | ✅ (billing) | Stripe Price ID for Enterprise plan |
| `SMTP_HOST` | ✅ (email) | SMTP server hostname |
| `SMTP_PORT` | ✅ (email) | SMTP port (587 recommended) |
| `SMTP_USER` | ✅ (email) | SMTP username / API key |
| `SMTP_PASS` | ✅ (email) | SMTP password |
| `EMAIL_FROM` | ✅ (email) | From address for transactional emails |
| `FRONTEND_URL` | ✅ | Full URL of frontend (for CORS + email links) |
| `PORT` | ❌ | Backend port (default: `4000`) |
| `NODE_ENV` | ❌ | `development` \| `production` |
| `JWT_EXPIRES_IN` | ❌ | Access token TTL (default: `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | ❌ | Refresh token TTL (default: `7d`) |
| `WEBHOOK_TIMEOUT_MS` | ❌ | Webhook delivery timeout (default: `5000`) |

> **Security note:** In development mode (`NODE_ENV=development`) emails are logged to the console instead of sent. Perfect for local testing without an SMTP server.

---

## Development workflow

### Running migrations

```bash
cd backend

# Apply all pending migrations
npm run migrate

# Seed plans + system guardrails
npm run seed
```

### Adding a migration

Create a new file in `backend/migrations/`:

```bash
touch backend/migrations/002_add_feature.sql
```

The migration runner (`npm run migrate`) applies files in alphabetical order and tracks what's been applied in the `_migrations` table. Each file runs in a transaction — if it fails, it rolls back automatically.

### Adding a new API route

1. Create or edit a controller in `backend/src/controllers/`
2. Add the route to the appropriate router in `backend/src/routes/`
3. Mount the router in `backend/src/index.js` if it's a new file

### Adding a frontend page

1. Create the component in `frontend/src/pages/`
2. Add the route to `frontend/src/App.jsx`
3. Add a nav link in `frontend/src/pages/dashboard/Shell.jsx` if it's a dashboard page

---

## API reference

All API routes are prefixed with `/api`. Authenticated routes require `Authorization: Bearer <access_token>`.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Create user + org, returns tokens |
| `POST` | `/api/auth/login` | — | Returns access + refresh tokens |
| `POST` | `/api/auth/refresh` | — | Rotate refresh token |
| `POST` | `/api/auth/logout` | — | Revoke refresh token |
| `POST` | `/api/auth/verify-email` | — | Verify email with token |
| `POST` | `/api/auth/forgot-password` | — | Send reset email |
| `POST` | `/api/auth/reset-password` | — | Set new password |
| `GET`  | `/api/auth/me` | ✅ | Current user + org memberships |

### Proxy (core)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/orgs/:orgId/proxy` | ✅ JWT or API key | Run prompt through guardrail pipeline |
| `GET`  | `/api/orgs/:orgId/audit` | ✅ | Paginated audit log |
| `GET`  | `/api/orgs/:orgId/audit/export` | ✅ | Download full audit log as CSV |
| `GET`  | `/api/orgs/:orgId/analytics` | ✅ | Aggregated analytics |

**Proxy request body:**
```json
{
  "prompt": "Your prompt text",
  "provider": "anthropic",
  "stream": false
}
```

**Proxy response:**
```json
{
  "output": "Model response text",
  "blocked": false,
  "inputFlags": [],
  "outputFlags": [],
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "route": "anthropic",
  "latency": 412,
  "tokens": 87,
  "auditId": "uuid"
}
```

### Organization

| Method | Path | Role | Description |
|---|---|---|---|
| `GET`    | `/api/orgs/:orgId` | user+ | Org details + plan |
| `PATCH`  | `/api/orgs/:orgId` | admin | Update org name/email |
| `GET`    | `/api/orgs/:orgId/members` | user+ | List members |
| `POST`   | `/api/orgs/:orgId/members/invite` | admin | Invite by email |
| `PATCH`  | `/api/orgs/:orgId/members/:id/role` | admin | Change role |
| `DELETE` | `/api/orgs/:orgId/members/:id` | admin | Remove member |
| `GET`    | `/api/orgs/:orgId/providers` | user+ | List provider connections |
| `PUT`    | `/api/orgs/:orgId/providers` | developer+ | Create or update provider |
| `DELETE` | `/api/orgs/:orgId/providers/:provider` | developer+ | Remove provider |
| `GET`    | `/api/orgs/:orgId/api-keys` | developer+ | List API keys |
| `POST`   | `/api/orgs/:orgId/api-keys` | developer+ | Create API key (returns raw key once) |
| `DELETE` | `/api/orgs/:orgId/api-keys/:id` | developer+ | Revoke API key |

### Config

| Method | Path | Role | Description |
|---|---|---|---|
| `GET/POST/PATCH/DELETE` | `/api/orgs/:orgId/guardrails[/:id]` | developer+ | Manage guardrails |
| `GET/POST/PATCH/DELETE` | `/api/orgs/:orgId/policies[/:id]` | developer+ | Manage policy sets |
| `GET/POST/PATCH/DELETE` | `/api/orgs/:orgId/templates[/:id]` | developer+ | Manage prompt templates |
| `GET/POST/PATCH/DELETE` | `/api/orgs/:orgId/webhooks[/:id]` | developer+ | Manage webhooks |
| `GET/PUT` | `/api/orgs/:orgId/downstream` | developer+ | Downstream system config |

### Billing

| Method | Path | Role | Description |
|---|---|---|---|
| `GET`  | `/api/orgs/:orgId/billing` | admin | Billing info, invoices, usage |
| `POST` | `/api/orgs/:orgId/billing/checkout` | admin | Create Stripe Checkout session |
| `POST` | `/api/orgs/:orgId/billing/portal` | admin | Open Stripe Customer Portal |
| `POST` | `/webhooks/stripe` | — | Stripe webhook receiver |

### SDK / proxy authentication

For server-to-server requests, use an API key instead of a JWT:

```bash
curl -X POST https://api.promptsense.io/api/orgs/YOUR_ORG_ID/proxy \
  -H "X-PromptSense-Key: ps_live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello!", "provider": "anthropic"}'
```

---

## Database schema

The schema lives in `backend/migrations/001_initial_schema.sql`. Tables:

| Table | Purpose |
|---|---|
| `plans` | Starter / Pro / Enterprise plan definitions |
| `organizations` | Tenant orgs with Stripe subscription info |
| `users` | User accounts with hashed passwords + OAuth |
| `memberships` | User ↔ org with role (user / developer / administrator) |
| `refresh_tokens` | Hashed refresh tokens with expiry + revocation |
| `provider_connections` | Per-org LLM provider config with encrypted API keys |
| `guardrails` | Per-org guardrail rules (regex + severity + action) |
| `policies` | Named sets of guardrail IDs |
| `prompt_templates` | Reusable prompt library |
| `downstream_systems` | Forwarding targets before the LLM |
| `webhooks` | HTTP callback endpoints with event filters |
| `webhook_deliveries` | Per-delivery log with status codes |
| `audit_events` | Immutable per-request log (input, output, flags, latency) |
| `usage_records` | Monthly aggregated request/token counts per org |
| `api_keys` | Hashed SDK authentication keys |

---

## Deployment

### Prerequisites on your server

- Ubuntu 22.04+ (or any Linux with Docker)
- Docker + Docker Compose V2
- Domain name pointing to the server IP
- Ports 80 and 443 open

### First-time server setup

```bash
# On the server
mkdir -p /opt/promptsense
cd /opt/promptsense

# Create production env file
nano .env.production
# (fill in all required variables — see table above)

# Pull and start
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# Run migrations once
docker compose -f docker-compose.prod.yml run --rm backend node src/db/migrate.js
docker compose -f docker-compose.prod.yml run --rm backend node src/db/seed.js
```

### SSL / HTTPS with Let's Encrypt

```bash
# Install certbot on the server
sudo apt install certbot

# Stop nginx temporarily
docker compose -f docker-compose.prod.yml stop frontend

# Get certificate
sudo certbot certonly --standalone -d app.promptsense.io

# Start everything back up
docker compose -f docker-compose.prod.yml up -d
```

Update `docker/nginx.conf` to add the SSL server block pointing to `/etc/letsencrypt/live/app.promptsense.io/`.

### Scaling

The backend is stateless — run multiple replicas behind a load balancer. The `docker-compose.prod.yml` already configures `deploy.replicas: 2`. For larger scale, move to Kubernetes or a managed platform (Railway, Render, Fly.io).

```bash
# Scale backend to 3 replicas
docker compose -f docker-compose.prod.yml up -d --scale backend=3
```

---

## CI/CD pipeline

Two GitHub Actions workflows handle the full pipeline.

### `.github/workflows/ci.yml` — runs on every push + PR

| Job | What it does |
|---|---|
| `backend` | Spins up PostgreSQL, runs migrations, starts the server, hits `/health` |
| `frontend` | Runs `npm run build`, uploads `dist/` as artifact |
| `docker` | Builds both Docker images (does not push — confirms Dockerfiles work) |
| `security` | `npm audit` on both packages, TruffleHog secret scan |

### `.github/workflows/deploy.yml` — runs on push to `main`

| Step | What it does |
|---|---|
| Build & push | Builds both images, pushes to GitHub Container Registry (`ghcr.io`) |
| Copy files | SCPs `docker-compose.prod.yml` and `nginx.conf` to the server |
| Migrate | Runs `node src/db/migrate.js` in a throwaway container before swapping |
| Deploy | `docker compose up -d --wait` — zero-downtime rolling update |
| Smoke test | Hits `/health` on the live URL, fails the run if it's not 200 |
| Notify | Posts a comment on the PR if deployment fails |

### Required GitHub secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Description |
|---|---|
| `DEPLOY_HOST` | Server IP or hostname |
| `DEPLOY_USER` | SSH username (e.g. `ubuntu`) |
| `DEPLOY_SSH_KEY` | Private SSH key (the server must have the matching public key in `~/.ssh/authorized_keys`) |
| `DEPLOY_PORT` | SSH port (default `22`) |
| `PRODUCTION_ENV` | Full contents of your `.env.production` file |
| `DATABASE_URL` | Production database URL (used for migration step) |

---

## Stripe billing setup

1. Create a [Stripe account](https://dashboard.stripe.com/register)
2. In **Developers → API keys**, copy your `sk_test_...` key to `STRIPE_SECRET_KEY`
3. Create two products in **Product catalog**:
   - **Pro** — add monthly + yearly prices, copy both Price IDs
   - **Enterprise** — optional, or use "Contact sales" flow
4. In **Developers → Webhooks**, add an endpoint:
   - URL: `https://your-domain.com/webhooks/stripe`
   - Events to listen to: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy the `whsec_...` signing secret to `STRIPE_WEBHOOK_SECRET`
5. For local webhook testing, use the [Stripe CLI](https://stripe.com/docs/stripe-cli):
   ```bash
   stripe listen --forward-to localhost:4000/webhooks/stripe
   ```

---

## Project structure

```
promptsense/
├── backend/
│   ├── migrations/
│   │   └── 001_initial_schema.sql     # Full PostgreSQL schema
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── auth.controller.js     # Register, login, tokens, email
│   │   │   ├── billing.controller.js  # Stripe checkout, portal, webhooks
│   │   │   ├── config.controller.js   # Guardrails, policies, templates, webhooks CRUD
│   │   │   ├── org.controller.js      # Members, providers, API keys
│   │   │   └── proxy.controller.js    # Guardrail engine, LLM proxy, audit log
│   │   ├── db/
│   │   │   ├── migrate.js             # Migration runner
│   │   │   ├── pool.js                # PostgreSQL connection pool
│   │   │   └── seed.js                # Plans + system guardrail seeder
│   │   ├── middleware/
│   │   │   └── auth.js                # JWT verify, org load, role gates
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── billing.routes.js
│   │   │   ├── config.routes.js
│   │   │   ├── org.routes.js
│   │   │   └── proxy.routes.js
│   │   ├── utils/
│   │   │   ├── email.js               # Nodemailer transactional emails
│   │   │   ├── encryption.js          # AES-256-GCM for API key storage
│   │   │   └── logger.js              # Winston structured logging
│   │   └── index.js                   # Express app entry point
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── UI.jsx                 # Shared design system components
│   │   ├── context/
│   │   │   ├── AuthContext.jsx        # User session, login/logout
│   │   │   └── OrgContext.jsx         # Current org, role, plan
│   │   ├── pages/
│   │   │   ├── Landing.jsx            # Public marketing page
│   │   │   ├── Pricing.jsx            # Pricing page with plan cards
│   │   │   ├── auth/                  # Login, Register, Forgot/Reset/Verify
│   │   │   └── dashboard/
│   │   │       ├── Shell.jsx          # Sidebar nav layout
│   │   │       ├── Playground.jsx     # Live prompt testing
│   │   │       ├── Integrations.jsx   # Provider connection manager
│   │   │       ├── Guardrails.jsx     # Guardrail rules editor
│   │   │       ├── Policies.jsx       # Policy set manager
│   │   │       ├── Templates.jsx      # Prompt template library
│   │   │       ├── Webhooks.jsx       # Webhook endpoint manager
│   │   │       ├── Analytics.jsx      # Charts + metrics
│   │   │       ├── AuditLog.jsx       # Paginated event log + CSV export
│   │   │       ├── Members.jsx        # Team management + invites
│   │   │       ├── Billing.jsx        # Stripe plans + invoices
│   │   │       ├── Settings.jsx       # Org settings
│   │   │       └── ApiKeys.jsx        # SDK key management
│   │   ├── services/
│   │   │   └── api.js                 # Axios client + auto token refresh
│   │   ├── App.jsx                    # React Router routes
│   │   └── main.jsx                   # Entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── docker/
│   ├── Dockerfile.backend             # Node 20 Alpine, non-root user
│   ├── Dockerfile.frontend            # Multi-stage: Vite build → nginx
│   └── nginx.conf                     # SPA fallback + API proxy + gzip
│
├── .github/
│   └── workflows/
│       ├── ci.yml                     # Lint, test, build on every PR
│       └── deploy.yml                 # Build images, SSH deploy on main
│
├── scripts/
│   └── setup.sh                       # One-command local dev setup
│
├── docker-compose.yml                 # Local dev (hot reload)
├── docker-compose.prod.yml            # Production (optimised images)
└── README.md
```

---

## License

MIT © 2025 PromptSense
