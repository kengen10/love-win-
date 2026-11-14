// Pesapal API v3 client (MTN, Airtel, card and bank). Secrets come from
// environment variables only — never from the website.
const BASE = process.env.PESAPAL_ENV === 'live'
  ? 'https://pay.pesapal.com/v3'
  : 'https://cybqa.pesapal.com/pesapalv3';

// This app serves both the website and the API, so one URL covers the payment
// callback and the IPN endpoint Pesapal calls.
const siteUrl = () => (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

const enabled = () => !!(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET);

let token = null;
let tokenExpiresAt = 0;
let ipnId = process.env.PESAPAL_IPN_ID || null;

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (auth) headers.Authorization = 'Bearer ' + (await getToken());
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Pesapal ${path} failed (${res.status}): ${JSON.stringify(data.error || data)}`);
  }
  return data;
}

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 30000) return token;
  const data = await call('/api/Auth/RequestToken', {
    method: 'POST',
    auth: false,
    body: {
      consumer_key: process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET,
    },
  });
  token = data.token;
  const exp = new Date(data.expiryDate).getTime();
  tokenExpiresAt = Number.isFinite(exp) ? exp : Date.now() + 4 * 60 * 1000;
  return token;
}

async function getIpnId() {
  if (ipnId) return ipnId;
  const data = await call('/api/URLSetup/RegisterIPN', {
    method: 'POST',
    body: { url: `${siteUrl()}/api/pesapal/ipn`, ipn_notification_type: 'GET' },
  });
  ipnId = data.ipn_id;
  return ipnId;
}

async function submitOrder({ reference, amount, currency, description, name, email }) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const data = await call('/api/Transactions/SubmitOrderRequest', {
    method: 'POST',
    body: {
      id: reference,
      currency,
      amount,
      description: description.slice(0, 100),
      callback_url: `${siteUrl()}/thank-you.html`,
      notification_id: await getIpnId(),
      billing_address: { email_address: email, first_name: first, last_name: rest.join(' ') },
    },
  });
  return { orderTrackingId: data.order_tracking_id, redirectUrl: data.redirect_url };
}

function getStatus(orderTrackingId) {
  return call(`/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`);
}

module.exports = { enabled, submitOrder, getStatus };
