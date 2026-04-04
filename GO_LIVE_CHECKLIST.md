# PromptSense — Go-Live Checklist
> Complete every item in order. Estimated total time: **2–3 days** for a solo founder.

---

## 🏗️ PHASE 1 — Infrastructure (Day 1 morning)

### 1.1 AWS Account Setup
- [ ] Create a dedicated AWS account for PromptSense (don't use a personal account)
- [ ] Enable MFA on the root account and lock it away
- [ ] Create an IAM user with AdministratorAccess for your CLI work
- [ ] Run `aws configure` with that IAM user's credentials
- [ ] Set your billing alert: AWS Console → Billing → Budgets → Create budget ($200/month threshold)

### 1.2 Domain & DNS
- [ ] Purchase your domain (e.g. `promptsense.io`) via Route 53, Namecheap, or Cloudflare
- [ ] If purchased outside AWS: create a Route 53 hosted zone and point your registrar's NS records to it
- [ ] Verify Route 53 has the hosted zone before running Terraform (`aws route53 list-hosted-zones`)

### 1.3 Terraform Bootstrap
- [ ] Create the S3 state bucket and DynamoDB lock table (commands in `infrastructure/DEPLOY.md` Step 1)
- [ ] Copy `infrastructure/terraform/terraform.tfvars.example` → `terraform.tfvars`
- [ ] Fill in `domain_name`, `aws_region`, `environment = "production"`
- [ ] Generate `jwt_secret`: `openssl rand -base64 48 | head -c 64`
- [ ] Generate `encryption_key` (must be **exactly 32 chars**): `openssl rand -base64 24 | head -c 32`
- [ ] Fill in `stripe_secret_key` and `stripe_webhook_secret` (see Phase 2)
- [ ] Run `terraform init && terraform plan && terraform apply` — takes ~15 min
- [ ] Save all Terraform outputs (`terraform output`) — you'll need them for GitHub secrets

### 1.4 GitHub Actions Secrets
Set these in: **GitHub repo → Settings → Secrets and variables → Actions**

- [ ] `AWS_ROLE_ARN` — from `terraform output github_actions_role_arn`
- [ ] `AWS_REGION` — e.g. `us-east-1`
- [ ] `ECS_CLUSTER` — from `terraform output ecs_cluster_name`
- [ ] `ECS_SERVICE` — from `terraform output ecs_service_name`
- [ ] `ECR_BACKEND` — from `terraform output ecr_backend_url`
- [ ] `FRONTEND_BUCKET` — from `terraform output frontend_bucket_name`
- [ ] `CLOUDFRONT_ID` — from `terraform output cloudfront_distribution_id`
- [ ] `DOMAIN_NAME` — e.g. `promptsense.io`
- [ ] `APP_SUBDOMAIN` — `app`
- [ ] `API_SUBDOMAIN` — `api`
- [ ] `PRIVATE_SUBNET_IDS` — comma-separated private subnet IDs (AWS VPC console)
- [ ] `ECS_SECURITY_GROUP` — ECS security group ID (AWS EC2 → Security Groups)

### 1.5 IAM — Wire GitHub OIDC to Your Repo
- [ ] Open `infrastructure/terraform/iam.tf`
- [ ] Replace `YOUR_GITHUB_ORG/promptsense` with your actual GitHub username/org and repo name
- [ ] Run `terraform apply` again to update the trust policy

### 1.6 First Deployment
- [ ] Push to `main` branch (or trigger `workflow_dispatch` in GitHub Actions)
- [ ] Watch the Actions run complete all 5 jobs: test → build → deploy-backend → deploy-frontend → smoke-test
- [ ] Confirm: `curl https://api.YOUR_DOMAIN/health` returns `{"status":"ok"}`
- [ ] Confirm: `https://app.YOUR_DOMAIN` loads the PromptSense login page

### 1.7 Run Database Migrations
- [ ] Run migrations via one-off ECS task (command in `infrastructure/DEPLOY.md` Step 6)
- [ ] Or: push to `main` — the deploy pipeline runs migrations automatically on every deploy

---

## 💳 PHASE 2 — Payments (Day 1 afternoon)

### 2.1 Stripe Account
- [ ] Sign up at stripe.com with your business email
- [ ] Complete Stripe identity verification (required to receive payouts)
- [ ] Add your bank account for payouts

### 2.2 Create Stripe Products & Prices
In Stripe Dashboard → Products → Add product:

- [ ] **Starter** — $49/month (or your chosen price), recurring monthly
  - Copy the Price ID: `price_xxxx` → add to your `.env` / Secrets Manager
- [ ] **Pro** — $199/month, recurring monthly
  - Copy the Price ID
- [ ] **Enterprise** — contact sales (no Stripe price needed — manual invoicing)
- [ ] Update `backend/src/controllers/billing.controller.js` with your actual Stripe Price IDs

### 2.3 Stripe Webhook
- [ ] Stripe Dashboard → Developers → Webhooks → Add endpoint
- [ ] Endpoint URL: `https://api.YOUR_DOMAIN/webhooks/stripe`
- [ ] Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Copy the webhook signing secret → update `STRIPE_WEBHOOK_SECRET` in Secrets Manager
- [ ] Force-redeploy ECS to pick up the new secret: `aws ecs update-service --cluster ... --service ... --force-new-deployment`

### 2.4 Test Payments End-to-End
- [ ] Create a test account in your app
- [ ] Click Upgrade → go through Stripe Checkout with card `4242 4242 4242 4242`
- [ ] Verify plan upgrades correctly in your database
- [ ] Test failed payment with card `4000 0000 0000 0002`
- [ ] Switch Stripe to **live mode** when ready (update `STRIPE_SECRET_KEY` in Secrets Manager)

---

## 📧 PHASE 3 — Email (Day 1 afternoon)

### 3.1 Transactional Email Provider
Pick one — all have generous free tiers:
- [ ] **AWS SES** (cheapest at scale, requires domain verification) — recommended
- [ ] **Resend** (developer-friendly, 3,000 free/month)
- [ ] **Postmark** (excellent deliverability)
- [ ] **SendGrid** (100/day free)

### 3.2 Configure Email
- [ ] Verify your sending domain with your chosen provider (add DNS records)
- [ ] Add SMTP credentials or API key to Secrets Manager as `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- [ ] Update `backend/src/utils/mailer.js` (or wherever email is sent) with your provider's settings
- [ ] Test: register a new account and confirm the verification email arrives
- [ ] Test: trigger a password reset email

### 3.3 Email Addresses to Set Up
- [ ] `support@YOUR_DOMAIN` — customer support (forward to your inbox)
- [ ] `security@YOUR_DOMAIN` — already referenced in `public/security.txt`
- [ ] `billing@YOUR_DOMAIN` — payment questions
- [ ] `hello@YOUR_DOMAIN` — sales inquiries from the landing page "Talk to sales" button

---

## 🔐 PHASE 4 — Security & Compliance (Day 2 morning)

### 4.1 Update security.txt
- [ ] Open `frontend/public/security.txt`
- [ ] Set `Expires` to 1 year from today (ISO 8601 format)
- [ ] Replace the placeholder contact and policy URLs with your real domain
- [ ] Optionally add a PGP key if you want encrypted disclosures

### 4.2 Privacy Policy & Terms of Service
- [ ] Draft or generate a **Privacy Policy** covering: what data you collect, how it's used, GDPR/CCPA rights, data retention
  - Free tools: [Termly](https://termly.io), [iubenda](https://iubenda.com), [GetTerms](https://getterms.io)
- [ ] Draft or generate **Terms of Service** covering: acceptable use, payment terms, refund policy, SLA commitments, liability limits
- [ ] Host them at `https://YOUR_DOMAIN/privacy` and `https://YOUR_DOMAIN/terms`
- [ ] Add links to both in the footer of your landing page (already has a footer — just fill in the hrefs)
- [ ] Add acceptance checkbox to the registration flow

### 4.3 Cookie Banner (GDPR)
- [ ] Add a cookie consent banner if you plan to use any analytics that set cookies
- [ ] Options: [CookieYes](https://cookieyes.com), [Osano](https://osano.com) (both have free tiers)

### 4.4 GDPR / Data Processing
- [ ] Identify what personal data you store: names, emails, prompt content, IP addresses
- [ ] Update your Privacy Policy to reflect data retention periods
- [ ] Add a "Delete my account" feature or document how users can request deletion (GDPR Article 17)
- [ ] If selling to EU companies: prepare a Data Processing Agreement (DPA) template
  - Standard Contractual Clauses (SCCs) template: [commission.europa.eu](https://commission.europa.eu)

### 4.5 SSL / Security Verification
- [ ] Check your SSL rating: [ssllabs.com/ssltest](https://ssllabs.com/ssltest) — should be A+
- [ ] Check your headers: [securityheaders.com](https://securityheaders.com) — should be A
- [ ] Confirm your API rejects HTTP (redirects to HTTPS) — the ALB does this automatically

---

## 📊 PHASE 5 — Monitoring & Observability (Day 2 morning)

### 5.1 Error Tracking
- [ ] Sign up for [Sentry](https://sentry.io) (free tier: 5,000 errors/month)
- [ ] Install Sentry SDK in backend: `npm install @sentry/node`
- [ ] Initialize Sentry at the top of `backend/src/index.js` with your DSN
- [ ] Install Sentry in frontend: `npm install @sentry/react`
- [ ] Initialize in `frontend/src/main.jsx`
- [ ] Add `SENTRY_DSN` to Secrets Manager and your ECS task definition environment

### 5.2 Uptime Monitoring
- [ ] Sign up for [BetterUptime](https://betteruptime.com) or [UptimeRobot](https://uptimerobot.com) (both free)
- [ ] Add monitor: `https://api.YOUR_DOMAIN/health` — check every 1 min
- [ ] Add monitor: `https://app.YOUR_DOMAIN` — check every 5 min
- [ ] Set up alert to your phone/email on downtime

### 5.3 Status Page
- [ ] Create a public status page on BetterUptime or [Instatus](https://instatus.com)
- [ ] Host at `status.YOUR_DOMAIN` (add CNAME in Route 53)
- [ ] Link it from your landing page footer

### 5.4 Product Analytics (optional but valuable)
- [ ] Sign up for [PostHog](https://posthog.com) (free up to 1M events/month) or [Mixpanel](https://mixpanel.com)
- [ ] Add the JS snippet to your frontend
- [ ] Track key events: `signed_up`, `provider_connected`, `first_prompt`, `plan_upgraded`, `gauntlet_run_started`

### 5.5 CloudWatch Alarms
- [ ] Create alarm: ECS CPU > 80% for 5 min → SNS email notification
- [ ] Create alarm: RDS CPU > 75% → SNS email notification
- [ ] Create alarm: ALB 5xx error rate > 1% → SNS email notification
- [ ] Create alarm: RDS storage < 5 GB remaining

---

## 🌐 PHASE 6 — Landing Page & Branding (Day 2 afternoon)

### 6.1 Branding
- [ ] Finalize your logo (use [Canva](https://canva.com) or hire a designer on [99designs](https://99designs.com))
- [ ] Choose brand colors and update Tailwind/CSS variables in the frontend
- [ ] Update the favicon (`frontend/public/favicon.ico`)
- [ ] Update `<title>` and meta tags in `frontend/index.html`

### 6.2 Landing Page Copy
- [ ] Replace all placeholder copy with real, specific value propositions
- [ ] Update the testimonials section with real customer quotes (or remove until you have them)
- [ ] Add your actual company name and location to the footer
- [ ] Update the stats bar numbers to real/realistic figures or remove until you have data
- [ ] Add Open Graph meta tags (`og:title`, `og:description`, `og:image`) for link previews
- [ ] Create an OG image (1200×630px) for social sharing

### 6.3 Pricing
- [ ] Confirm your pricing tiers match what's in Stripe (Starter / Pro / Enterprise)
- [ ] Update the pricing page limits to match what your plan enforcement actually allows
- [ ] Add your real support email to the Enterprise "Talk to sales" button

### 6.4 SEO Basics
- [ ] Add `frontend/public/robots.txt` (allow all, point to sitemap)
- [ ] Generate a `sitemap.xml` with your marketing pages
- [ ] Submit sitemap to Google Search Console
- [ ] Add your site to [Bing Webmaster Tools](https://bing.com/webmasters)

---

## 🚀 PHASE 7 — Pre-Launch Testing (Day 2 afternoon)

### 7.1 End-to-End User Flow
Walk through the full journey as a new customer:

- [ ] Land on homepage → read value prop → click "Start free trial"
- [ ] Register account → receive verification email → verify
- [ ] Complete onboarding: connect OpenAI provider → set a guardrail → run a prompt → generate API key
- [ ] Upgrade to Pro via Stripe Checkout → confirm plan changes in dashboard
- [ ] Test the Gauntlet: create a run → watch probes fire → review results
- [ ] View analytics with sample data
- [ ] Test API key auth: make a `curl` call to `/api/orgs/ORG_ID/proxy` with `X-Api-Key` header
- [ ] Test guardrail blocking: send a prompt that matches a pattern → confirm it's blocked

### 7.2 Multi-Provider Testing
- [ ] Test each provider integration: OpenAI, Anthropic, Gemini, Mistral
- [ ] Confirm error messages are helpful when a bad API key is entered
- [ ] Confirm fallback to provider works when downstream system fails

### 7.3 Load & Performance
- [ ] Run a quick load test with [k6](https://k6.io) or [Artillery](https://artillery.io): 50 concurrent users, 2 min
- [ ] Confirm ECS auto-scaling kicks in if CPU spikes
- [ ] Check that the Redis rate limiter correctly throttles at plan limits

### 7.4 Mobile Responsiveness
- [ ] Check landing page on mobile (iPhone SE and iPhone 15 sizes)
- [ ] Check dashboard on tablet
- [ ] Fix any layout issues

---

## 💬 PHASE 8 — Sales & Growth (Day 3)

### 8.1 Customer Acquisition Channels
Pick 1–2 to start — don't spread thin:

- [ ] **Product Hunt launch** — schedule for a Tuesday or Wednesday
  - Create hunter account, write your tagline and description, prepare screenshots/GIF
- [ ] **Hacker News** — post "Show HN: PromptSense – LLM guardrails and compliance for enterprises"
- [ ] **LinkedIn** — post about the problem you're solving and link to the product
- [ ] **Cold outreach** — identify 50 target companies (AI-forward teams) on LinkedIn Sales Navigator
- [ ] **Y Combinator Startup Directory** — list your product

### 8.2 Demo Environment
- [ ] Create a demo organization with pre-loaded sample data (prompts, guardrails, analytics)
- [ ] Set up a "Try the demo" button on the landing page with read-only credentials
- [ ] Record a 2-minute Loom demo video — embed it on the landing page

### 8.3 CRM & Sales Tracking
- [ ] Sign up for [HubSpot CRM](https://hubspot.com) (free forever) or [Notion CRM template](https://notion.so)
- [ ] Add every lead, trial signup, and conversation to the CRM
- [ ] Set up a simple pipeline: Lead → Demo Scheduled → Proposal Sent → Closed Won/Lost

### 8.4 Onboarding Emails
Set up a 3-email drip sequence for new trial users:

- [ ] **Day 0** — Welcome + "Here's how to connect your first LLM provider" (link to docs/video)
- [ ] **Day 2** — "Did you set up your first guardrail?" + tip on common patterns
- [ ] **Day 5** — "Your trial ends in X days — here's what Pro unlocks" + upgrade CTA

Use [Loops](https://loops.so), [Customer.io](https://customer.io), or [Mailchimp](https://mailchimp.com).

### 8.5 Documentation
- [ ] Create a basic docs site (use [Mintlify](https://mintlify.com) — free, beautiful, fast to set up)
- [ ] Write the "Getting started" guide (5 min to first API call)
- [ ] Document the proxy API endpoint with request/response examples
- [ ] Document guardrail configuration
- [ ] Document Gauntlet red teaming
- [ ] Add "Docs" link to your navigation

---

## ✅ FINAL PRE-LAUNCH CHECKLIST

Run through this the morning you launch:

- [ ] `curl https://api.YOUR_DOMAIN/health` → `{"status":"ok"}`
- [ ] SSL A+ rating confirmed on ssllabs.com
- [ ] Stripe in **live mode** (not test mode)
- [ ] At least one real payment tested end-to-end
- [ ] Verification email actually arrives in <60 seconds
- [ ] Uptime monitor armed and alerting to your phone
- [ ] Sentry error tracking live (throw a test error to confirm)
- [ ] Privacy Policy and Terms of Service linked in footer
- [ ] Support email is monitored (you'll see signups come in fast on launch day)
- [ ] You have a runbook for common incidents (DB connection spike, ECS task crash, Stripe outage)

---

## 💰 REVENUE MILESTONES TO AIM FOR

| Milestone | Target | Key action |
|---|---|---|
| First paying customer | Week 1–2 | Direct outreach to 10 warm contacts |
| $1,000 MRR | Month 1–2 | Product Hunt + HN launch |
| $5,000 MRR | Month 2–3 | 1 Enterprise deal or 25 Pro plans |
| $10,000 MRR | Month 3–6 | Content marketing + LinkedIn thought leadership |

---

*Last updated: April 2026. Estimated go-live time from scratch: 2–3 days.*
