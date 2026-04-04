const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { query } = require('../db/pool');
const logger = require('../utils/logger');

// GET /orgs/:orgId/billing
async function getBilling(req, res) {
  const { rows: [org] } = await query(
    `SELECT o.*, p.name as plan_name, p.display_name, p.price_monthly, p.price_yearly,
            p.requests_per_month, p.members_limit, p.features
     FROM organizations o JOIN plans p ON p.id=o.plan_id WHERE o.id=$1`,
    [req.orgId]
  );
  if (!org) return res.status(404).json({ error: 'Org not found' });

  let invoices = [];
  let paymentMethod = null;

  if (org.stripe_customer_id) {
    try {
      const [invList, methods] = await Promise.all([
        stripe.invoices.list({ customer: org.stripe_customer_id, limit: 6 }),
        stripe.paymentMethods.list({ customer: org.stripe_customer_id, type: 'card' }),
      ]);
      invoices = invList.data.map(inv => ({
        id: inv.id, amount: inv.amount_paid, currency: inv.currency,
        status: inv.status, date: inv.created, url: inv.hosted_invoice_url,
      }));
      if (methods.data[0]) {
        const card = methods.data[0].card;
        paymentMethod = { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year };
      }
    } catch (err) {
      logger.warn('Stripe billing fetch error', { error: err.message });
    }
  }

  // Usage this period
  const period = new Date(); period.setDate(1); period.setHours(0,0,0,0);
  const { rows: [usage] } = await query(
    'SELECT requests, blocked, tokens, cost_usd FROM usage_records WHERE org_id=$1 AND period=$2',
    [req.orgId, period]
  );

  res.json({ org, invoices, paymentMethod, usage: usage || { requests: 0, blocked: 0, tokens: 0, cost_usd: 0 } });
}

// POST /orgs/:orgId/billing/checkout
async function createCheckout(req, res) {
  const { planName, interval = 'monthly' } = req.body;
  const { rows: [plan] } = await query('SELECT * FROM plans WHERE name=$1', [planName]);
  if (!plan) return res.status(400).json({ error: 'Invalid plan' });

  const { rows: [org] } = await query('SELECT * FROM organizations WHERE id=$1', [req.orgId]);

  // Create or retrieve Stripe customer
  let customerId = org.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: org.billing_email, name: org.name, metadata: { org_id: req.orgId } });
    customerId = customer.id;
    await query('UPDATE organizations SET stripe_customer_id=$1 WHERE id=$2', [customerId, req.orgId]);
  }

  const priceId = interval === 'yearly'
    ? process.env[`STRIPE_PRICE_${planName.toUpperCase()}_YEARLY`]
    : process.env[`STRIPE_PRICE_${planName.toUpperCase()}`];

  if (!priceId) return res.status(400).json({ error: 'Stripe price not configured for this plan' });

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.FRONTEND_URL}/dashboard/${org.slug}/billing?success=1`,
    cancel_url: `${process.env.FRONTEND_URL}/dashboard/${org.slug}/billing`,
    metadata: { org_id: req.orgId, plan_name: planName },
    subscription_data: { metadata: { org_id: req.orgId } },
    allow_promotion_codes: true,
  });

  res.json({ url: session.url });
}

// POST /orgs/:orgId/billing/portal
async function createPortal(req, res) {
  const { rows: [org] } = await query('SELECT stripe_customer_id, slug FROM organizations WHERE id=$1', [req.orgId]);
  if (!org?.stripe_customer_id) return res.status(400).json({ error: 'No billing account found' });

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${process.env.FRONTEND_URL}/dashboard/${org.slug}/billing`,
  });

  res.json({ url: session.url });
}

// POST /webhooks/stripe  (raw body required)
async function stripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn('Stripe webhook signature mismatch', { error: err.message });
    return res.status(400).send('Webhook signature verification failed');
  }

  const sub = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const orgId = sub.metadata?.org_id;
      const planName = sub.metadata?.plan_name;
      if (orgId && planName) {
        const { rows: [plan] } = await query('SELECT id FROM plans WHERE name=$1', [planName]);
        if (plan) {
          await query(
            'UPDATE organizations SET plan_id=$1, stripe_subscription_id=$2, subscription_status=$3 WHERE id=$4',
            [plan.id, sub.subscription, 'active', orgId]
          );
          logger.info('Subscription activated', { orgId, planName });
        }
      }
      break;
    }
    case 'customer.subscription.updated': {
      const { rows: [org] } = await query('SELECT id FROM organizations WHERE stripe_subscription_id=$1', [sub.id]);
      if (org) {
        await query('UPDATE organizations SET subscription_status=$1 WHERE id=$2', [sub.status, org.id]);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const { rows: [org] } = await query('SELECT id FROM organizations WHERE stripe_subscription_id=$1', [sub.id]);
      if (org) {
        const { rows: [starter] } = await query("SELECT id FROM plans WHERE name='starter'");
        await query('UPDATE organizations SET subscription_status=$1, plan_id=$2 WHERE id=$3', ['canceled', starter.id, org.id]);
        logger.info('Subscription canceled — downgraded to starter', { orgId: org.id });
      }
      break;
    }
    case 'invoice.payment_failed': {
      const { rows: [org] } = await query('SELECT id FROM organizations WHERE stripe_customer_id=$1', [sub.customer]);
      if (org) await query("UPDATE organizations SET subscription_status='past_due' WHERE id=$1", [org.id]);
      break;
    }
  }

  res.json({ received: true });
}

module.exports = { getBilling, createCheckout, createPortal, stripeWebhook };
