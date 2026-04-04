#!/usr/bin/env bash
# PromptSense — local dev setup
# Usage: bash scripts/setup.sh
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[setup]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}   PromptSense — Local Development Setup${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Prerequisite checks ───────────────────────────────────────────────────────
info "Checking prerequisites…"

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "$1 is required but not installed. Install it and re-run: $2"
  fi
  success "$1 found ($(command -v "$1"))"
}

check_cmd node     "https://nodejs.org"
check_cmd npm      "https://nodejs.org"
check_cmd docker   "https://docs.docker.com/get-docker/"
check_cmd docker   "https://docs.docker.com/compose/install/"

NODE_VER=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_VER" -lt 18 ]; then
  error "Node.js 18+ is required. Current: $(node --version). Use nvm: https://github.com/nvm-sh/nvm"
fi
success "Node.js version OK ($(node --version))"

# ── Backend env file ──────────────────────────────────────────────────────────
info "Setting up backend environment…"
BACKEND_ENV="$ROOT_DIR/backend/.env"

if [ -f "$BACKEND_ENV" ]; then
  warn ".env already exists — skipping. Delete it and re-run to regenerate."
else
  # Generate cryptographically random secrets
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

  cat > "$BACKEND_ENV" << EOF
# ── Server ────────────────────────────────────────────────────────────────────
PORT=4000
NODE_ENV=development

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://promptsense:password@localhost:5432/promptsense_db

# ── JWT (auto-generated — do not share) ───────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Stripe (replace with your test keys from https://dashboard.stripe.com) ────
STRIPE_SECRET_KEY=sk_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
STRIPE_PRICE_PRO=price_REPLACE_ME
STRIPE_PRICE_PRO_YEARLY=price_REPLACE_ME
STRIPE_PRICE_ENTERPRISE=price_REPLACE_ME

# ── Email (dev mode skips sending — replace for real email) ───────────────────
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=REPLACE_ME
SMTP_PASS=REPLACE_ME
EMAIL_FROM=noreply@promptsense.io

# ── Encryption (auto-generated — required for provider key storage) ────────────
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# ── Frontend ──────────────────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:3000
EOF
  success "backend/.env created with auto-generated secrets"
fi

# ── Install backend dependencies ──────────────────────────────────────────────
info "Installing backend dependencies…"
cd "$ROOT_DIR/backend"
npm ci --prefer-offline 2>/dev/null || npm install
success "Backend dependencies installed"

# ── Install frontend dependencies ────────────────────────────────────────────
info "Installing frontend dependencies…"
cd "$ROOT_DIR/frontend"
npm ci --prefer-offline 2>/dev/null || npm install
success "Frontend dependencies installed"

# ── Start PostgreSQL via Docker ───────────────────────────────────────────────
info "Starting PostgreSQL…"
cd "$ROOT_DIR"

if docker ps --format '{{.Names}}' | grep -q '^ps_postgres$'; then
  success "PostgreSQL container already running"
else
  docker compose up postgres -d
  info "Waiting for PostgreSQL to be ready…"
  TRIES=0
  until docker compose exec postgres pg_isready -U promptsense -d promptsense_db &>/dev/null; do
    TRIES=$((TRIES+1))
    [ $TRIES -ge 20 ] && error "PostgreSQL did not start in time"
    sleep 2
  done
  success "PostgreSQL is ready"
fi

# ── Run migrations ────────────────────────────────────────────────────────────
info "Running database migrations…"
cd "$ROOT_DIR/backend"
DATABASE_URL=postgresql://promptsense:password@localhost:5432/promptsense_db npm run migrate
success "Migrations applied"

# ── Seed database ─────────────────────────────────────────────────────────────
info "Seeding database (plans + system guardrails)…"
DATABASE_URL=postgresql://promptsense:password@localhost:5432/promptsense_db npm run seed
success "Database seeded"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   Setup complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}Next steps:${NC}"
echo ""
echo -e "  1. Edit ${YELLOW}backend/.env${NC} and add your Stripe keys"
echo -e "     (get them free at https://dashboard.stripe.com)"
echo ""
echo -e "  2. Start the backend:"
echo -e "     ${CYAN}cd backend && npm run dev${NC}"
echo ""
echo -e "  3. In a new terminal, start the frontend:"
echo -e "     ${CYAN}cd frontend && npm run dev${NC}"
echo ""
echo -e "  4. Open ${CYAN}http://localhost:3000${NC} in your browser"
echo ""
echo -e "  ${YELLOW}API runs at:${NC}      http://localhost:4000"
echo -e "  ${YELLOW}Health check:${NC}     http://localhost:4000/health"
echo -e "  ${YELLOW}DB (local):${NC}       postgresql://promptsense:password@localhost:5432/promptsense_db"
echo ""
echo -e "  ${CYAN}Tip:${NC} Run everything at once with Docker Compose:"
echo -e "  ${CYAN}docker compose up${NC}"
echo ""
