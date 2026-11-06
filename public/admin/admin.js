const $ = s => document.querySelector(s);
const el = (t, a = {}, ...c) => { const e = document.createElement(t);
  for (const [k, v] of Object.entries(a)) { if (k.startsWith('on')) e[k] = v; else if (v !== false && v != null) e.setAttribute(k, v); }
  c.flat().forEach(x => e.append(x && x.nodeType ? x : document.createTextNode(x ?? ''))); return e; };
async function api(p, o = {}) {
  const r = await fetch('/api/admin' + p, { method: o.method || 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined });
  if (r.status === 401 && p !== '/login') { showLogin(); throw new Error('auth'); }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Error'); return j;
}
const money = n => 'UGX ' + Number(n).toLocaleString();
const TABS = { overview: 'Overview', donations: 'Donations', messages: 'Messages', subscribers: 'Subscribers', stories: 'Stories', reports: 'Reports', payments: 'Payments' };
let tab = 'overview';

function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
function showApp() { $('#login').hidden = true; $('#app').hidden = false; nav(); render(); }
function nav() {
  const t = $('#tabs'); t.textContent = '';
  for (const [k, v] of Object.entries(TABS)) t.append(el('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; nav(); render(); } }, v));
}
function table(cols, rows) {
  return el('div', { class: 'wrapx' }, el('table', {},
    el('thead', {}, el('tr', {}, cols.map(c => el('th', {}, c[0])))),
    el('tbody', {}, rows.length ? rows.map(r => el('tr', {}, cols.map(c => el('td', {}, c[1](r))))) : el('tr', {}, el('td', { colspan: cols.length }, 'Nothing here yet.')))));
}
const badge = s => el('span', { class: 'badge ' + s }, s);

async function render() {
  const v = $('#view'); v.textContent = '';
  try {
    if (tab === 'overview') {
      const s = await api('/summary');
      v.append(el('div', { class: 'stats' },
        [['Confirmed donations', money(s.paidTotal)], ['Paid gifts', s.paidCount], ['Pending payments', s.pendingCount], ['Unhandled messages', s.newMessages], ['Subscribers', s.subscribers]]
          .map(([l, n]) => el('div', { class: 'stat' }, el('b', {}, n), l))));
    } else if (tab === 'donations') {
      const d = await api('/donations');
      v.append(el('div', { class: 'row' }, el('a', { href: '/api/admin/export/donations.csv' }, 'Download CSV')),
        table([['Date', r => r.created_at], ['Donor', r => r.name], ['Email', r => r.email], ['Amount', r => money(r.amount)], ['Type', r => r.frequency], ['Method', r => r.method || '—'], ['From', r => r.region], ['Status', r => badge(r.status)]], d));
    } else if (tab === 'messages') {
      const d = await api('/messages');
      v.append(table([['Date', r => r.created_at], ['From', r => r.name + ' <' + r.email + '>'], ['Topic', r => r.topic], ['Message', r => r.message],
        ['', r => el('button', { class: 'sm ghost', onclick: async () => { await api('/messages/' + r.id, { method: 'PATCH', body: { handled: !r.handled } }); render(); } }, r.handled ? 'Reopen' : 'Mark handled')]], d));
    } else if (tab === 'subscribers') {
      const d = await api('/subscribers');
      v.append(el('div', { class: 'row' }, el('a', { href: '/api/admin/export/subscribers.csv' }, 'Download CSV')), table([['Joined', r => r.created_at], ['Email', r => r.email]], d));
    } else if (tab === 'stories') await cms(v, 'stories', [['title', 'Title'], ['tag', 'Tag (e.g. School life)'], ['image_url', 'Image URL (https://…)']], 'summary');
    else if (tab === 'reports') await cms(v, 'reports', [['title', 'Report title'], ['year', 'Year'], ['url', 'Link to PDF (https://…)']], null);
    else if (tab === 'payments') await paymentMethods(v);
  } catch (e) { if (e.message !== 'auth') v.append(el('p', { class: 'msg' }, e.message)); }
}

async function paymentMethods(v) {
  const methods = await api('/payment-methods');
  v.append(el('p', { class: 'msg' }, 'These are the ways donors can give. Edit the wording and the bank details, or switch a method off to hide it from the donate page.'));
  methods.forEach(m => {
    const msg = el('p', { class: 'msg' });
    const label = el('input', { value: m.label });
    const blurb = el('input', { value: m.blurb });
    const instructions = el('input', { value: m.instructions });
    const details = el('textarea', { rows: 4 }); details.value = m.details || '';
    const on = el('input', { type: 'checkbox', style: 'width:auto' }); on.checked = !!m.enabled;
    const kids = [
      el('h2', {}, m.label),
      el('label', {}, 'Name', label),
      el('label', {}, 'Short description', blurb),
      el('label', {}, 'What the donor should do', instructions),
      m.type === 'bank' ? el('label', {}, 'Bank / account details (one per line)', details) : null,
      el('label', { class: 'row' }, on, 'Show on the donate page'),
      el('button', { type: 'submit' }, 'Save'), msg,
    ].filter(Boolean);
    v.append(el('form', { class: 'panel', onsubmit: async e => {
      e.preventDefault();
      try {
        await api('/payment-methods/' + m.id, { method: 'PATCH', body: { label: label.value, blurb: blurb.value, instructions: instructions.value, details: details.value, enabled: on.checked } });
        msg.textContent = 'Saved.'; render();
      } catch (err) { msg.textContent = err.message; }
    } }, kids));
  });
}

async function cms(v, name, fields, longField) {
  const msg = el('p', { class: 'msg' });
  const inputs = fields.map(([k, l]) => el('label', {}, l, el('input', { name: k })));
  const area = longField ? el('label', {}, 'Summary', el('textarea', { name: 'summary', rows: 3 })) : null;
  const pub = el('input', { type: 'checkbox', style: 'width:auto' });
  const form = el('form', { class: 'panel', onsubmit: async e => {
    e.preventDefault(); const body = { published: pub.checked };
    form.querySelectorAll('input[name],textarea').forEach(i => body[i.name] = i.value);
    try { await api('/' + name, { method: 'POST', body }); render(); } catch (err) { msg.textContent = err.message; }
  } }, el('h2', {}, 'Add new'), el('div', { class: 'grid2' }, inputs, area), el('label', { class: 'row' }, pub, 'Publish immediately'), el('button', { type: 'submit' }, 'Save'), msg);
  const rows = await api('/' + name);
  const cols = [['Title', r => r.title], [name === 'stories' ? 'Tag' : 'Year', r => r.tag || r.year || ''],
    ['Live', r => badge(r.published ? 'paid' : 'draft')],
    ['', r => el('div', { class: 'row' },
      el('button', { class: 'sm ghost', onclick: async () => { await api(`/${name}/${r.id}`, { method: 'PATCH', body: { published: !r.published } }); render(); } }, r.published ? 'Unpublish' : 'Publish'),
      el('button', { class: 'sm danger', onclick: async () => { if (confirm('Delete permanently?')) { await api(`/${name}/${r.id}`, { method: 'DELETE' }); render(); } } }, 'Delete'))]];
  v.append(form, table(cols, rows));
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/login', { method: 'POST', body: { username: $('#u').value, password: $('#p').value } }); $('#p').value = ''; $('#loginErr').textContent = ''; showApp(); }
  catch (err) { $('#loginErr').textContent = err.message; }
});
$('#logout').onclick = async () => { await api('/logout', { method: 'POST' }).catch(() => {}); showLogin(); };
api('/me').then(showApp).catch(showLogin);
