# PromptSense — Free Launch Checklist
> Run the full production stack at $0/month to validate before committing to AWS (~$163/mo).
> Estimated time: **3–4 hours** to go live.

---

## Free Stack (replaces AWS)

| AWS Service | Free Alternative | Free Limit |
|---|---|---|
| ECS Fargate | **Render** (web service) | 750 hrs/month |
| RDS PostgreSQL | **Neon** (serverless Postgres) | 0.5 GB, 1 project |
| ElastiCache Redis | **Upstash** (serverless Redis) | 10,000 cmds/day |
| CloudFront + S3 | **Vercel** (frontend hosting) | 100 GB bandwidth |
| ALB + ACM | Included in Render + Vercel | HTTPS automatic |
| Route 53 | **Cloudflare DNS** | Free forever |
| Secrets Manager | Environment variables in dashboards | — |
| GitHub Actions | GitHub Actions | 2,000 min/month |
| **Total** | | **$0/month** |

---

## STEP 1 — Database: Neon (PostgreSQL)
*Time: 10 min*

- [ ] Go to [neon.tech](https://neon.tech) → Sign up free
- [ ] Create a new project → name it `promptsense`
- [ ] Copy the **connection string** — looks like:
  ```
  postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
  ```
- [ ] Save it — this is your `DATABASE_URL`
- [ ] In Neon dashboard → SQL Editor → run your migrations manually:
  ```sql
  -- Paste contents of each file in backend/migrations/ in order:
  -- 001_init.sql
  -- 002_add_department.sql
  -- 003_gauntlet.sql
  ```

---

## STEP 2 — Redis: Upstash
*Time: 5 min*

- [ ] Go to [upstash.com](https://upstash.com) → Sign up free
- [ ] Create a Redis database → region: US East → name: `promptsense`
- [ ] Go to database details → copy the **Redis URL** — looks like:
  ```
  rediss://:password@us1-xxx.upstash.io:6380
  ```
- [ ] Save it — this is your `REDIS_URL`

> **Note:** The free tier allows 10,000 commands/day. Each API call to the proxy uses ~2 Redis commands (rate limit check). That's 5,000 proxy calls/day — more than enough for testing.

---

## STEP 3 — Backend: Render
*Time: 15 min*

- [ ] Go to [render.com](https://render.com) → Sign up free (use GitHub login)
- [ ] Click **New** → **Web Service**
- [ ] Connect your GitHub repo
- [ ] Configure the service:
  - **Name:** `promptsense-backend`
  - **Root directory:** `backend`
  - **Runtime:** Node
  - **Build command:** `npm install`
  - **Start command:** `npm start`
  - **Instance type:** Free
- [ ] Add these **Environment Variables** (in Render dashboard → Environment tab):

  | Key | Value |
  |-----|-------|
  | `NODE_ENV` | `production` |
  | `PORT` | `4000` |
  | `DATABASE_URL` | *(from Neon — Step 1)* |
  | `REDIS_URL` | *(from Upstash — Step 2)* |
  | `JWT_SECRET` | *(run: `openssl rand -base64 48 \| head -c 64`)* |
  | `ENCRYPTION_KEY` | *(run: `openssl rand -base64 24 \| head -c 32` — must be exactly 32 chars)* |
  | `FRONTEND_URL` | *(your Vercel URL — fill in after Step 4)* |
  | `STRIPE_SECRET_KEY` | `sk_test_...` *(Stripe test key for now)* |
  | `STRIPE_WEBHOOK_SECRET` | *(from Stripe — Step 6)* |

- [ ] Click **Create Web Service** → wait ~3 min for first deploy
- [ ] Copy your Render URL: `https://promptsense-backend.onrender.com`
- [ ] Test it: `curl https://promptsense-backend.onrender.com/health`
  - Should return: `{"status":"ok"}`

> **⚠️ Free tier caveat:** Render free services spin down after 15 min of inactivity and take ~30 sec to wake up on the next request. This is fine for testing. When you go paid, upgrade to Render Starter ($7/month) to eliminate cold starts.

---

## STEP 4 — Frontend: Vercel
*Time: 10 min*

- [ ] Go to [vercel.com](https://vercel.com) → Sign up free (use GitHub login)
- [ ] Click **Add New Project** → Import your GitHub repo
- [ ] Configure:
  - **Framework Preset:** Vite
  - **Root directory:** `frontend`
  - **Build command:** `npm run build`
  - **Output directory:** `dist`
- [ ] Add **Environment Variables**:

  | Key | Value |
  |-----|-------|
  | `VITE_API_URL` | `https://promptsense-backend.onrender.com/api` |

- [ ] Click **Deploy** → wait ~2 min
- [ ] Copy your Vercel URL: `https://promptsense-xxx.vercel.app`
- [ ] Go back to Render → update `FRONTEND_URL` with this Vercel URL → redeploy

---

## STEP 5 — Custom Domain (optional but recommended)
*Time: 15 min — skip if you just want to test*

### Buy a domain (~$10-15/year)
- [ ] Buy from [Cloudflare Registrar](https://cloudflare.com/products/registrar/) (at-cost pricing, no markup)
  or Namecheap, Google Domains (now Squarespace Domains)

### Point domain to Vercel (frontend)
- [ ] Vercel → Project → Settings → Domains → Add `app.yourdomain.com`
- [ ] Add CNAME record in your DNS: `app` → `cname.vercel-dns.com`
- [ ] Vercel issues SSL automatically (Let's Encrypt) — takes ~2 min

### Point domain to Render (backend)
- [ ] Render → Service → Settings → Custom Domains → Add `api.yourdomain.com`
- [ ] Add CNAME record in your DNS: `api` → your Render service's DNS target
- [ ] Render issues SSL automatically
- [ ] Update `VITE_API_URL` in Vercel to `https://api.yourdomain.com/api`
- [ ] Update `FRONTEND_URL` in Render to `https://app.yourdomain.com`
- [ ] Redeploy both

---

## STEP 6 — Stripe (test mode)
*Time: 10 min*

- [ ] Sign up at [stripe.com](https://stripe.com) (free)
- [ ] Stay in **test mode** (toggle in top-left of dashboard)
- [ ] Create your products:
  - Starter: $49/month → copy Price ID (`price_xxx`)
  - Pro: $199/month → copy Price ID
- [ ] Update Price IDs in `backend/src/controllers/billing.controller.js`
- [ ] Stripe Dashboard → Developers → Webhooks → Add endpoint:
  - URL: `https://api.yourdomain.com/webhooks/stripe` (or Render URL)
  - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
  - Copy webhook signing secret → add as `STRIPE_WEBHOOK_SECRET` in Render
- [ ] Test a payment with card `4242 4242 4242 4242` — any future expiry, any CVC

---

## STEP 7 — Email
*Time: 10 min*

- [ ] Sign up at [Resend](https://resend.com) — free (3,000 emails/month)
- [ ] Add and verify your domain (or use their sandbox for testing)
- [ ] Get your API key
- [ ] Add to Render environment variables:
  ```
  SMTP_HOST=smtp.resend.com
  SMTP_PORT=465
  SMTP_USER=resend
  SMTP_PASS=re_xxxxxxxx   ← your Resend API key
  FROM_EMAIL=hello@yourdomain.com
  ```
- [ ] Test: register a new account and confirm the verification email arrives

> **Alternative if you skip email for now:** Comment out email-sending calls in the auth controller and just auto-verify users. You can add email properly before launch.

---

## STEP 8 — Auto-Deploy (CI/CD)
*Time: 5 min — both Render and Vercel do this automatically*

- [ ] Vercel: already auto-deploys frontend on every push to `main` ✅
- [ ] Render: already auto-deploys backend on every push to `main` ✅
- [ ] No GitHub Actions setup needed for the free stack

---

## STEP 9 — Smoke Test Everything
*Time: 20 min*

Walk through the full user journey:

- [ ] Open your Vercel/custom URL → landing page loads
- [ ] Register a new account → verification email arrives
- [ ] Complete onboarding checklist in the dashboard
- [ ] Go to Integrations → connect OpenAI or Anthropic with a real API key
- [ ] Go to Playground → send a test prompt → response comes back
- [ ] Set up a guardrail → send a prompt that triggers it → confirm it's blocked
- [ ] Run a Gauntlet red-team test → watch probes complete
- [ ] Check Analytics → usage data appears
- [ ] Test the Upgrade flow → Stripe Checkout opens → pay with `4242 4242 4242 4242`
- [ ] Confirm plan upgrades in the dashboard
- [ ] Generate an API key → test `curl` call:
  ```bash
  curl -X POST https://api.yourdomain.com/api/orgs/YOUR_ORG_ID/proxy \
    -H "X-Api-Key: ps_your_key" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "Hello world", "provider": "openai"}'
  ```

---

## STEP 10 — Basic Monitoring (free)
*Time: 10 min*

- [ ] [UptimeRobot](https://uptimerobot.com) (free) → add monitor for your `/health` endpoint → alerts to email/phone
- [ ] [Sentry](https://sentry.io) (free — 5,000 errors/month):
  - `npm install @sentry/node` in backend
  - Add `Sentry.init({ dsn: '...' })` at top of `backend/src/index.js`
  - Add `SENTRY_DSN` env var in Render

---

## When to Upgrade to AWS

Move to the full AWS Terraform setup when you hit **any** of these:

| Signal | Action |
|---|---|
| Render cold starts frustrating beta users | Upgrade Render to $7/mo Starter, or move to AWS |
| Neon 0.5 GB storage getting full | Upgrade Neon ($19/mo) or move to RDS |
| You close your first paying customer | Time to make it bulletproof — run `terraform apply` |
| Uptime monitor catches Render sleeping | Move to AWS ECS (always-on) |
| You need Multi-AZ database HA | AWS RDS only |

---

## Cost Summary

| Phase | Monthly Cost | When |
|---|---|---|
| Free stack (Render + Neon + Upstash + Vercel) | **$0** | Testing & early users |
| Render Starter + Neon Launch | **~$26** | First few paying customers |
| Full AWS (Terraform setup) | **~$163** | Scaling, enterprise customers |

---

*The free stack handles up to ~500 daily active users comfortably before you'd feel any pressure to upgrade.*
