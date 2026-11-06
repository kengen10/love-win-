const $ = (s, r = document) => r.querySelector(s);
const menuBtn = $('.menu'), navLinks = $('.links');
if (menuBtn && navLinks) {
  menuBtn.addEventListener('click', () => { const open = navLinks.classList.toggle('open'); menuBtn.setAttribute('aria-expanded', String(open)); menuBtn.textContent = open ? '×' : '☰'; });
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { navLinks.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.textContent = '☰'; }));
}
document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

async function post(url, data) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
  return j;
}
function status(el, msg) { el.style.display = 'block'; el.textContent = msg; }
function busy(form, on) { const b = form.querySelector('button[type=submit]'); if (b) b.disabled = on; }

// Donation form
let selectedAmount = '25000', frequency = 'once', method = '';

function showBank(m, on) {
  const box = $('#bankDetails');
  if (!box) return;
  box.hidden = !on;
  if (on) { $('#bankInstructions').textContent = m.instructions || ''; $('#bankAccount').textContent = m.details || ''; }
}

const methodPicker = $('#methodPicker');
if (methodPicker) fetch('/api/payment-methods').then(r => r.json()).then(items => {
  methodPicker.textContent = '';
  items.forEach(m => {
    const b = mk('button', 'method');
    b.type = 'button'; b.dataset.method = m.code;
    b.append(mk('strong', '', m.label), mk('small', '', m.blurb || ''));
    b.addEventListener('click', () => {
      method = m.code;
      methodPicker.querySelectorAll('.method').forEach(x => x.classList.toggle('active', x === b));
      showBank(m, m.type === 'bank');
    });
    methodPicker.append(b);
  });
  if (items.length) { methodPicker.querySelector('.method').classList.add('active'); method = items[0].code; }
  else methodPicker.append(mk('p', 'form-note', 'No payment methods are available yet. Please contact us.'));
}).catch(() => {
  methodPicker.textContent = '';
  methodPicker.append(mk('p', 'form-note', 'Payment options could not be loaded. Please refresh the page.'));
});

document.querySelectorAll('[data-frequency]').forEach(b => b.addEventListener('click', () => {
  frequency = b.dataset.frequency;
  document.querySelectorAll('[data-frequency]').forEach(x => x.classList.toggle('active', x === b));
}));
document.querySelectorAll('[data-amount]').forEach(b => b.addEventListener('click', () => {
  selectedAmount = b.dataset.amount;
  document.querySelectorAll('[data-amount]').forEach(x => x.classList.toggle('active', x === b));
  const c = $('#customField'); if (c) c.hidden = selectedAmount !== 'custom';
}));
const donationForm = $('#donationForm');
if (donationForm) donationForm.addEventListener('submit', async e => {
  e.preventDefault();
  const st = $('#donateStatus');
  const amount = selectedAmount === 'custom' ? Number($('#customAmount').value) : Number(selectedAmount);
  if (!Number.isFinite(amount) || amount < 1000) return status(st, 'Please choose or enter a donation of at least UGX 1,000.');
  if (!method) return status(st, 'Please choose how you would like to give.');
  busy(donationForm, true);
  try {
    const j = await post('/api/donations', { name: $('#donorName').value, email: $('#donorEmail').value, region: $('#region').value, amount, frequency, method });
    if (j.url) { status(st, 'Taking you to our secure payment page…'); window.location.href = j.url; return; }
    if (j.bank) { const box = $('#bankDetails'); if (box) { box.hidden = false; box.scrollIntoView({ block: 'center' }); } }
    status(st, j.message);
  } catch (err) { status(st, err.message); }
  busy(donationForm, false);
});

// Contact form
const contactForm = $('#contactForm');
if (contactForm) contactForm.addEventListener('submit', async e => {
  e.preventDefault(); busy(contactForm, true);
  const st = $('#contactStatus');
  try {
    const j = await post('/api/contact', { name: $('#contactName').value, email: $('#contactEmail').value, topic: $('#topic').value, message: $('#message').value });
    status(st, j.message); contactForm.reset();
  } catch (err) { status(st, err.message); }
  busy(contactForm, false);
});

// Newsletter (footer, every page)
const news = $('#newsletterForm');
if (news) news.addEventListener('submit', async e => {
  e.preventDefault(); busy(news, true);
  const st = $('#newsletterStatus');
  try { const j = await post('/api/newsletter', { email: $('#newsletterEmail').value }); status(st, j.message); news.reset(); }
  catch (err) { status(st, err.message); }
  busy(news, false);
});

// Stories + reports from the database
function mk(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
const storyList = $('#storyList');
if (storyList) fetch('/api/stories').then(r => r.json()).then(items => {
  storyList.textContent = '';
  if (!items.length) { const d = mk('div', 'empty-state'); d.style.gridColumn = '1/-1'; d.append(mk('strong', '', 'Stories are coming soon.'), mk('p', '', 'We will share approved school news and updates here.')); storyList.append(d); return; }
  items.forEach(s => {
    const card = mk('article', 'card');
    if (s.image_url) { const w = mk('div', 'card-image'), i = document.createElement('img'); i.src = s.image_url; i.alt = ''; i.loading = 'lazy'; w.append(i); card.append(w); }
    const b = mk('div', 'card-body');
    if (s.tag) b.append(mk('span', 'tag', s.tag));
    b.append(mk('h3', '', s.title), mk('p', '', s.summary)); card.append(b); storyList.append(card);
  });
}).catch(() => {});
const reportList = $('#reportList');
if (reportList) fetch('/api/reports').then(r => r.json()).then(items => {
  if (!items.length) return;
  reportList.textContent = ''; reportList.className = 'cards';
  items.forEach(x => {
    const card = mk('article', 'card'), b = mk('div', 'card-body'), a = mk('a', 'text-link', 'Open report ↗');
    a.href = x.url; a.target = '_blank'; a.rel = 'noopener';
    b.append(mk('span', 'tag', x.year || 'Report'), mk('h3', '', x.title), a); card.append(b); reportList.append(card);
  });
}).catch(() => {});

// Thank-you page
const tt = $('#thanksTitle');
if (tt) {
  const s = new URLSearchParams(location.search).get('status');
  const m = {
    paid: ['Thank you for your gift!', 'Your donation was received. A receipt will be sent to your email address. You are helping children in Uganda learn and thrive.'],
    pending: ['We are confirming your payment', 'Your payment has not been confirmed yet. If you completed it, there is no need to pay again; we will confirm shortly.'],
    cancelled: ['Payment cancelled', 'No money was taken. You are welcome to try again whenever you are ready.'],
    failed: ['Payment did not go through', 'No money was taken. Please try again or contact us if you need help.']
  }[s] || ['Thank you', 'Thanks for visiting Love Wins.'];
  tt.textContent = m[0]; $('#thanksText').textContent = m[1];
}
