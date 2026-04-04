require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SYSTEM_GUARDRAILS = [
  { name: 'PII detection',       description: 'Block emails, SSNs, phone numbers, credit cards', type: 'input',  severity: 'critical', action: 'block', pattern: String.raw`\d{3}-\d{2}-\d{4}|[\w.]+@[\w]+\.\w+|\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b`, color: '#D85A30', enabled: true  },
  { name: 'Prompt injection',    description: 'Detect jailbreak and instruction override attempts', type: 'input',  severity: 'critical', action: 'block', pattern: 'ignore.*instructions|system prompt|jailbreak|bypass|pretend you|disregard', color: '#7F77DD', enabled: true  },
  { name: 'Toxicity filter',     description: 'Flag hate speech and harmful content',             type: 'both',   severity: 'high',     action: 'block', pattern: String.raw`\b(hate|violence|kill|toxic|harmful|abuse)\b`, color: '#E24B4A', enabled: true  },
  { name: 'Secrets detection',   description: 'Block API keys, passwords, tokens in output',     type: 'output', severity: 'critical', action: 'block', pattern: String.raw`(sk-|api[_-]?key|password|bearer)[a-zA-Z0-9_\-]{8,}`, color: '#4285F4', enabled: true  },
  { name: 'Hallucination check', description: 'Flag low-confidence factual claims',              type: 'output', severity: 'medium',   action: 'warn',  pattern: '', color: '#1D9E75', enabled: true  },
  { name: 'Output length cap',   description: 'Enforce max token limits on responses',           type: 'output', severity: 'low',      action: 'warn',  pattern: '', color: '#378ADD', enabled: true  },
  { name: 'Copyright guard',     description: 'Detect verbatim copyrighted content',            type: 'output', severity: 'high',     action: 'block', pattern: '', color: '#D4537E', enabled: false },
  { name: 'Sentiment check',     description: 'Flag overly negative or positive bias',          type: 'output', severity: 'low',      action: 'log',   pattern: '', color: '#639922', enabled: false },
];

async function seed() {
  const client = await pool.connect();
  try {
    // Upsert plans
    const plans = [
      { name: 'starter',    display: 'Starter',    price_m: 0,     price_y: 0,      rpm: 5000,  mem: 3,  gr: 10, wh: 2,  features: ['5,000 requests/mo','3 team members','10 guardrails','Email support'] },
      { name: 'pro',        display: 'Pro',        price_m: 4900,  price_y: 49000,  rpm: 50000, mem: 15, gr: 50, wh: 10, features: ['50,000 requests/mo','15 team members','50 guardrails','Priority support','Analytics export','Custom policies'] },
      { name: 'enterprise', display: 'Enterprise', price_m: 19900, price_y: 199000, rpm: -1,    mem: -1, gr: -1, wh: -1, features: ['Unlimited requests','Unlimited members','Unlimited guardrails','SLA','SSO/SAML','Dedicated support'] },
    ];

    for (const p of plans) {
      await client.query(`
        INSERT INTO plans (name, display_name, price_monthly, price_yearly, requests_per_month, members_limit, guardrails_limit, webhooks_limit, features)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (name) DO UPDATE SET display_name=$2, price_monthly=$3, price_yearly=$4, features=$9
      `, [p.name, p.display, p.price_m, p.price_y, p.rpm, p.mem, p.gr, p.wh, JSON.stringify(p.features)]);
    }

    console.log('✅ Plans seeded');

    // Store system guardrail templates in a config table (applied per-org on signup)
    console.log(`✅ ${SYSTEM_GUARDRAILS.length} system guardrail templates ready`);
    console.log('✅ Seed complete');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { SYSTEM_GUARDRAILS };
if (require.main === module) seed();
