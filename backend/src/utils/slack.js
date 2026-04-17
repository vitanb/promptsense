const axios = require('axios');
const logger = require('./logger');

/**
 * Send a raw payload to a Slack incoming webhook URL.
 * Silently swallows errors so Slack failures never crash the main request flow.
 */
async function sendSlack(webhookUrl, payload) {
  if (!webhookUrl) return;
  try {
    await axios.post(webhookUrl, payload, { timeout: 5000 });
  } catch (err) {
    logger.warn('Slack webhook failed', { error: err.message, url: webhookUrl?.slice(0, 40) });
  }
}

/**
 * Real-time block/flag alert — fired by the proxy on every blocked request.
 */
async function sendBlockAlert(webhookUrl, { orgName, prompt, flags, provider, auditId, appUrl }) {
  if (!webhookUrl) return;
  const flagList = (flags || []).map(f => `\`${f}\``).join(', ');
  await sendSlack(webhookUrl, {
    text: `🚨 *PromptSense blocked a request* in *${orgName}*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚨 *Blocked request* in *${orgName}*\n*Provider:* ${provider || 'unknown'}  |  *Flags:* ${flagList || 'none'}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Prompt preview:*\n> ${String(prompt || '').slice(0, 200)}${(prompt || '').length > 200 ? '…' : ''}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View in Audit Log' },
            url: `${appUrl}/dashboard/audit`,
            style: 'danger',
          },
        ],
      },
      { type: 'divider' },
    ],
  });
}

/**
 * Daily digest — summary of yesterday's activity.
 * Called by the cron job each morning.
 */
async function sendDailyDigest(webhookUrl, { orgName, stats, topFlags, appUrl }) {
  if (!webhookUrl) return;
  const { total = 0, passed = 0, blocked = 0, avgLatency = 0 } = stats;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 100;

  const flagLines = (topFlags || []).slice(0, 5).map(f => `• ${f.flag}: *${f.cnt}*`).join('\n') || '_None_';

  await sendSlack(webhookUrl, {
    text: `📊 PromptSense daily digest for *${orgName}*`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📊 PromptSense — Daily Digest` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${orgName}* · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Total requests*\n${total.toLocaleString()}` },
          { type: 'mrkdwn', text: `*Pass rate*\n${passRate}%` },
          { type: 'mrkdwn', text: `*Blocked*\n${blocked.toLocaleString()}` },
          { type: 'mrkdwn', text: `*Avg latency*\n${avgLatency} ms` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Top guardrail triggers (yesterday)*\n${flagLines}` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open Analytics' },
            url: `${appUrl}/dashboard/analytics`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Audit Log' },
            url: `${appUrl}/dashboard/audit`,
          },
        ],
      },
      { type: 'divider' },
    ],
  });
}

module.exports = { sendSlack, sendBlockAlert, sendDailyDigest };
