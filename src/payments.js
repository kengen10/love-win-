// Flutterwave Standard (hosted checkout). Supports Uganda mobile money + cards.
const BASE = 'https://api.flutterwave.com/v3';
const enabled = () => !!process.env.FLW_SECRET_KEY;

async function flw(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Flutterwave error ${r.status}`);
  return j;
}

// Flutterwave's hosted page groups Ugandan mobile money under one option; the
// donor's chosen method decides what the checkout offers first.
const OPTIONS = { airtel: 'mobilemoneyuganda', mtn: 'mobilemoneyuganda', card: 'card' };

async function createPayment(d, siteUrl) {
  const j = await flw('/payments', {
    method: 'POST',
    body: JSON.stringify({
      tx_ref: d.tx_ref,
      amount: d.amount,
      currency: d.currency,
      redirect_url: `${siteUrl}/api/donations/callback`,
      payment_options: OPTIONS[d.method] || (d.region === 'uganda' ? 'mobilemoneyuganda,card' : 'card'),
      customer: { email: d.email, name: d.name },
      customizations: { title: 'Rukundo Nesinga Initiative', description: 'Donation' },
    }),
  });
  return j.data.link;
}

// Always confirm with Flutterwave server-side; never trust the browser redirect.
async function verifyByRef(ref) {
  const j = await flw('/transactions/verify_by_reference?tx_ref=' + encodeURIComponent(ref));
  return j.data;
}

module.exports = { enabled, createPayment, verifyByRef };
