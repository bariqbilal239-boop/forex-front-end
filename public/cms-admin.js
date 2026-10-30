// Connects admin.html to the CMS API (server.js). Loaded after the admin's own script.
(() => {
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function call(method, url, data) {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'aurum' }, body: data ? JSON.stringify(data) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { showLogin(); throw new Error('Signed out'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
const SITE_URL = 'http://localhost:3000'; // the Next.js website
const fail = e => toast('⚠ ' + e.message);
let D = { posts: [], forms: {}, messages: [], subscribers: [], site: {} }, cur = null;

// ---------- login ----------
document.body.insertAdjacentHTML('beforeend', `<style>#login[hidden]{display:none!important}
#login{position:fixed;inset:0;z-index:100;background:radial-gradient(circle at 30% 20%,#1a2233,#05080F 70%);display:grid;place-items:center;padding:16px}
#login form{width:100%;max-width:380px;background:var(--card,#111827);border:1px solid var(--border);border-radius:16px;padding:32px;box-shadow:0 30px 60px -20px #000}
#login h1{font-size:22px;margin:14px 0 4px}#login .lg{width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#F0D77A,#B8921F);display:grid;place-items:center;color:#0B1220;font-weight:800}
#login .err{color:#F87171;font-size:13px;min-height:20px;margin:6px 0}
.msg-it{cursor:pointer}.msg-it.on{background:var(--gsoft);box-shadow:inset 3px 0 0 var(--gold)}</style>
<div id="login" hidden><form><div class="lg">Au</div><h1>Sign in to Aurum Admin</h1><p class="muted" style="font-size:13.5px;margin-bottom:18px">Use the login in <b>data/first-login.txt</b> the first time.</p>
<div class="field"><label>Email</label><input class="input" name="email" type="email" autocomplete="username" required></div>
<div class="field"><label>Password</label><input class="input" name="password" type="password" autocomplete="current-password" required></div>
<div class="err" id="lerr"></div><button class="btn gold" style="width:100%;justify-content:center;height:44px">Sign in</button></form></div>`);
const L = document.getElementById('login');
function showLogin() { L.hidden = false; }
L.querySelector('form').onsubmit = async e => {
  e.preventDefault(); const f = e.target;
  try { await call('POST', '/api/login', { email: f.email.value, password: f.password.value }); L.hidden = true; f.reset(); load(); }
  catch (er) { document.getElementById('lerr').textContent = er.message; }
};
const sideBar = document.querySelector('.sb');
if (sideBar) sideBar.insertAdjacentHTML('beforeend', '<a class="it" href="#" id="logout" style="margin-top:8px">⎋ Sign out</a>');
document.getElementById('logout')?.addEventListener('click', async e => { e.preventDefault(); await call('POST', '/api/logout').catch(() => {}); showLogin(); });

// ---------- posts ----------
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';
window.renderPosts = function () {
  const q = $('#pq').value.toLowerCase(), c = $('#pcat').value;
  const l = D.posts.filter(p => (!pst || p.status === pst) && (!c || p.category === c) && p.title.toLowerCase().includes(q));
  $('#ptable').innerHTML = l.length ? l.map(p => prow([esc(p.title), p.category, Math.max(0, authors.indexOf(p.author)), p.status, esc((p.label || '').split(' ')[0]), p.views ? p.views.toLocaleString() : '—', fmtDate(p.date)])
    .replace(/href="#editor"/, `href="#editor" data-id="${p.id}"`).replace(/<span>\/blog\/[^<]*<\/span>/, `<span>/blog/${esc(p.slug)}</span>`).replace(/<input type="checkbox" class="chk pc"/, `<input type="checkbox" class="chk pc" value="${p.id}"`)).join('')
    : `<tr><td colspan="9" style="text-align:center;padding:48px" class="muted"><b style="color:var(--text)">No posts found</b><br>Try changing the filters, or create a new post.</td></tr>`;
};
function counts() {
  const n = s => D.posts.filter(p => !s || p.status === s).length;
  $$('#ptabs button').forEach(b => { const em = b.querySelector('em'); if (em) em.textContent = n(b.dataset.s); });
}
// Bulk actions
const bulk = [...document.querySelectorAll('#v-posts select')].find(s => s.options[0].text === 'Bulk actions'), applyBtn = bulk?.nextElementSibling;
if (applyBtn) applyBtn.onclick = async () => {
  const ids = $$('.pc:checked').map(x => x.value), a = bulk.value;
  if (!ids.length || a === 'Bulk actions') return toast('Select posts and an action');
  if (a === 'Change category') return toast('Open a post to change its category');
  try {
    for (const i of ids) {
      if (a === 'Move to trash') { if (!confirm('Delete ' + ids.length + ' post(s) permanently?')) return; await call('DELETE', '/api/posts/' + i); }
      else await call('PUT', '/api/posts/' + i, { status: a === 'Publish' ? 'Published' : 'Draft' });
    }
    toast('Updated ' + ids.length + ' post(s)'); load();
  } catch (e) { fail(e); }
};

// ---------- editor ----------
const E = $('#v-editor');
const fld = (root, label) => [...root.querySelectorAll('.field')].find(f => f.querySelector('label')?.textContent.trim().toLowerCase().startsWith(label.toLowerCase()))?.querySelector('input,select,textarea');
const ef = {
  title: E.querySelector('.tin'), sub: E.querySelector('.sub'), body: E.querySelector('.ebody [contenteditable="true"]'),
  status: fld(E, 'Status'), date: fld(E, 'Publish date'), vis: fld(E, 'Visibility'), cat: fld(E, 'Category'), label: fld(E, 'Content label'),
  author: fld(E, 'Author'), slug: fld(E, 'URL slug'), mt: fld(E, 'Meta title'), md: fld(E, 'Meta description'), rt: fld(E, 'Reading time'),
  tagIn: E.querySelector('input[placeholder="Add tag"]'), alt: fld(E, 'Alt text')
};
const tw = [...E.querySelectorAll('.card .row')].filter(r => r.querySelector('.sw input')).map(r => r.querySelector('.sw input')); // feature, newsletter, breaking
const head = E.querySelector('.ph p'), h1 = E.querySelector('.ph h1');
let tags = [];
function drawTags() {
  const row = ef.tagIn.parentElement; row.querySelectorAll('.badge').forEach(b => b.remove());
  ef.tagIn.insertAdjacentHTML('beforebegin', tags.map((t, i) => `<span class="badge plain gold" data-i="${i}" style="cursor:pointer" title="Remove">${esc(t)} ✕</span>`).join(''));
}
ef.tagIn.parentElement.addEventListener('click', e => { const b = e.target.closest('.badge'); if (b) { tags.splice(+b.dataset.i, 1); drawTags(); } });
ef.tagIn.addEventListener('keydown', e => { if (e.key === 'Enter' && ef.tagIn.value.trim()) { e.preventDefault(); tags.push(ef.tagIn.value.trim()); ef.tagIn.value = ''; drawTags(); } });
const badge = s => `<span class="badge ${sb[s] || 'draft'}">${esc(s)}</span>`;
function fillEditor(p) {
  cur = p || null; p = p || { title: '', subtitle: '', body: '<p>Start writing…</p>', status: 'Draft', category: cats[0][0], label: 'Analysis / Opinion', author: authors[0], tags: [] };
  ef.title.value = p.title; ef.sub.value = p.subtitle || ''; ef.body.innerHTML = p.body || '';
  ef.status.value = p.status; ef.date.value = p.date ? String(p.date).slice(0, 16) : ''; ef.vis.value = p.visibility || 'Public';
  ef.cat.value = p.category; ef.label.value = p.label; ef.author.value = p.author;
  ef.slug.value = p.slug || ''; ef.mt.value = p.metaTitle || ''; ef.md.value = p.metaDesc || ''; if (ef.alt) ef.alt.value = p.imageAlt || '';
  ef.rt.value = p.mins ? p.mins + ' min (auto)' : 'auto';
  [p.featured, p.newsletter, p.breaking].forEach((v, i) => tw[i] && (tw[i].checked = !!v));
  tags = [...(p.tags || [])]; drawTags();
  h1.textContent = cur ? 'Edit Post' : 'New Post';
  head.innerHTML = `${badge(p.status)} &nbsp;${cur ? 'Last saved ' + new Date(p.updated).toLocaleString() : 'Not saved yet'}`;
  const pv = E.querySelector('a[href*="aurum-markets.html"], a[href^="http://localhost:3000"]'); if (pv) pv.href = cur && p.status === 'Published' ? SITE_URL + '/blog/' + p.slug : 'javascript:void 0';
  serp();
}
function serp() {
  const s = E.querySelector('.serp'); if (!s) return;
  s.innerHTML = `<span class="u">aurummarkets.com › blog › ${esc(ef.slug.value || 'new-post')}</span><b>${esc(ef.mt.value || ef.title.value || 'Post title')}</b><span class="muted">${esc((ef.md.value || ef.sub.value).slice(0, 160))}</span>`;
}
[ef.slug, ef.mt, ef.md, ef.title].forEach(i => i.addEventListener('input', serp));
async function savePost(status) {
  if (!ef.title.value.trim()) return toast('Add a title first');
  const b = { title: ef.title.value.trim(), subtitle: ef.sub.value, body: ef.body.innerHTML, status: status || ef.status.value, date: ef.date.value || new Date().toISOString().slice(0, 16),
    visibility: ef.vis.value, category: ef.cat.value, label: ef.label.value, author: ef.author.value, slug: ef.slug.value, metaTitle: ef.mt.value, metaDesc: ef.md.value,
    imageAlt: ef.alt?.value, tags, featured: tw[0]?.checked, newsletter: tw[1]?.checked, breaking: tw[2]?.checked };
  try {
    const p = cur ? await call('PUT', '/api/posts/' + cur.id, b) : await call('POST', '/api/posts', b);
    const i = D.posts.findIndex(x => x.id === p.id); i < 0 ? D.posts.unshift(p) : (D.posts[i] = p);
    fillEditor(p); renderPosts(); counts();
    toast(p.status === 'Published' ? 'Published — live on the website' : 'Saved as ' + p.status);
  } catch (e) { fail(e); }
}
const acts = E.querySelector('.ph .acts');
acts.querySelectorAll('button').forEach(b => {
  b.removeAttribute('onclick');
  if (/draft/i.test(b.textContent)) b.onclick = () => savePost('Draft');
  else if (/publish/i.test(b.textContent)) b.onclick = () => savePost(ef.status.value === 'Scheduled' ? 'Scheduled' : 'Published');
});
acts.insertAdjacentHTML('afterbegin', '<button class="btn danger" id="delPost">Delete</button>');
$('#delPost').onclick = async () => {
  if (!cur) return fillEditor(null);
  if (!confirm('Delete “' + cur.title + '” permanently?')) return;
  try { await call('DELETE', '/api/posts/' + cur.id); toast('Post deleted'); location.hash = '#posts'; load(); } catch (e) { fail(e); }
};
// Add-block buttons insert real content
const blocks = { Paragraph: '<p>New paragraph…</p>', Heading: '<h2>New heading</h2>', Quote: '<blockquote>“Quote”</blockquote>', Callout: '<div class="callout"><b>Key takeaways</b><br>• Point one<br>• Point two</div>',
  'Key levels': '<table><thead><tr><th>Level</th><th>Price</th></tr></thead><tbody><tr><td>Resistance</td><td>0.00</td></tr><tr><td>Support</td><td>0.00</td></tr></tbody></table>',
  'Scenario table': '<table><thead><tr><th>Scenario</th><th>Trigger</th><th>Target</th></tr></thead><tbody><tr><td class="up"><b>Bullish</b></td><td>…</td><td>…</td></tr><tr><td class="down"><b>Bearish</b></td><td>…</td><td>…</td></tr></tbody></table>',
  Disclaimer: '<div class="callout">This article is educational market commentary and is not investment advice.</div>' };
E.querySelectorAll('.addblk button').forEach(b => b.onclick = () => {
  const t = b.textContent.trim();
  if (t === 'Image') { const u = prompt('Image URL (https://…)'); if (u && /^https:\/\//.test(u)) ef.body.insertAdjacentHTML('beforeend', `<p><img src="${esc(u)}" alt="" style="max-width:100%;border-radius:10px"></p>`); return; }
  ef.body.insertAdjacentHTML('beforeend', blocks[t] || `<p>${esc(t)} block</p>`);
});
// Remove fake sample blocks that can't render on the site
document.addEventListener('click', e => { const a = e.target.closest('a[href="#editor"]'); if (a) fillEditor(D.posts.find(p => p.id === a.dataset.id)); }, true);

// ---------- forms: pages, menus, markets, settings ----------
const FORM_VIEWS = ['pages', 'menus', 'markets', 'settings'];
const inputs = v => [...document.querySelectorAll(`#v-${v} input, #v-${v} select, #v-${v} textarea`)].filter(i => i.type !== 'password' && !i.disabled);
const val = i => (i.type === 'checkbox' || i.type === 'radio') ? i.checked : i.value;
function siteFrom(v) {
  const V = $('#v-' + v), g = l => fld(V, l)?.value;
  if (v === 'pages') return { hero: { eyebrow: g('Eyebrow'), headline: g('Headline'), highlight: g('Highlighted'), text: g('Supporting'), button: g('Primary button'), link: g('Link'), stats: $$('#v-pages .field input.num').map(i => i.value) } };
  if (v === 'menus') { const ta = [...V.querySelectorAll('textarea')].pop(); return { cta: { label: g('Label'), link: g('Link') }, social: { x: g('X'), linkedin: g('LinkedIn'), youtube: g('YouTube'), telegram: g('Telegram') }, disclaimer: ta?.value } };
  if (v === 'settings') return { siteName: g('Site name'), tagline: g('Tagline'), email: g('Contact email') };
  return {};
}
FORM_VIEWS.forEach(v => $$(`#v-${v} .btn.gold`).forEach(b => {
  const msg = (b.getAttribute('onclick') || '').match(/toast\('([^']+)'\)/)?.[1] || 'Saved';
  b.removeAttribute('onclick');
  b.onclick = async () => {
    try { await call('PUT', '/api/forms/' + v, { values: inputs(v).map(val), site: siteFrom(v) }); toast(msg + ' — website updated'); } catch (e) { fail(e); }
  };
}));
function fillForms() {
  FORM_VIEWS.forEach(v => { const saved = D.forms[v]; if (!saved) return; inputs(v).forEach((i, n) => { if (n >= saved.length) return; if (i.type === 'checkbox' || i.type === 'radio') i.checked = !!saved[n]; else i.value = saved[n]; }); });
}

// ---------- inbox ----------
const box = $('#v-inbox .inbox'); let curMsg = null;
function renderInbox() {
  const ms = D.messages;
  if (!ms.length) { box.innerHTML = '<div class="cp" style="padding:48px;text-align:center;grid-column:1/-1" class="muted"><b>No messages yet</b><br><span class="muted">Messages sent from the website contact form appear here.</span></div>'; return; }
  curMsg = ms.find(m => m.id === curMsg?.id) || ms[0];
  box.innerHTML = `<div style="border-right:1px solid var(--border)">${ms.map(m => `<div class="list-it msg-it ${m === curMsg ? 'on' : ''}" data-id="${m.id}"><div style="flex:1;min-width:0"><div class="row" style="justify-content:space-between"><b>${esc(m.name)}</b><span class="muted" style="font-size:12px">${new Date(m.at).toLocaleDateString()}</span></div><div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.subject)}</div><span class="badge ${m.status === 'Resolved' ? 'pub' : 'sch'}" style="margin-top:4px">${esc(m.status)}</span></div></div>`).join('')}</div>
  <div class="cp" style="padding:28px"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><div><span class="badge gold plain">${esc(curMsg.category)}</span><h2 style="font-size:20px;margin:10px 0 4px">${esc(curMsg.subject)}</h2><span class="muted">${esc(curMsg.name)} · ${esc(curMsg.email)} · ${new Date(curMsg.at).toLocaleString()}</span></div>
  <div class="row"><button class="btn sm" id="mres">${curMsg.status === 'Resolved' ? 'Reopen' : 'Mark resolved'}</button><button class="btn sm danger" id="mdel">Delete</button></div></div>
  <p style="margin:22px 0;line-height:1.75;color:#CBD5E1;white-space:pre-wrap">${esc(curMsg.message)}</p>
  ${(Array.isArray(curMsg.replies) ? curMsg.replies : JSON.parse(curMsg.replies || '[]')).map(r => `<div style="margin:0 0 14px;padding:14px 16px;border-left:3px solid var(--gold);background:var(--mid);border-radius:0 10px 10px 0"><div class="muted" style="font-size:12px;margin-bottom:6px">Reply by ${esc(r.by)} · ${new Date(r.at).toLocaleString()}</div><div style="white-space:pre-wrap">${esc(r.text)}</div></div>`).join('')}
  <textarea class="input" rows="5" id="mreply" placeholder="Write a reply to ${esc(curMsg.name)}… (sent by email)"></textarea><div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn gold" id="msend">Send reply</button></div>
  <details style="margin-top:18px"><summary class="muted" style="cursor:pointer;font-size:13px">Internal note</summary><textarea class="input" rows="3" id="mnote" style="margin-top:8px" placeholder="Only visible to the team…">${esc(curMsg.note || '')}</textarea><div class="row" style="margin-top:8px;justify-content:flex-end"><button class="btn sm" id="mnotes">Save note</button></div></details></div>`;
  box.querySelectorAll('.msg-it').forEach(el => el.onclick = () => { curMsg = ms.find(m => m.id === el.dataset.id); renderInbox(); });
  $('#mres').onclick = () => upd({ status: curMsg.status === 'Resolved' ? 'New' : 'Resolved' });
  $('#mnotes').onclick = () => upd({ note: $('#mnote').value });
  $('#msend').onclick = async () => {
    const reply = $('#mreply').value.trim(); if (!reply) return toast('Write a reply first');
    const b = $('#msend'); b.disabled = true; b.textContent = 'Sending…';
    try { Object.assign(curMsg, await call('POST', '/api/messages/' + curMsg.id + '/reply', { reply })); renderInbox(); toast(D.integrations?.email ? 'Reply sent to ' + curMsg.email : 'Reply saved — email not configured, see data/outbox'); }
    catch (e) { fail(e); b.disabled = false; b.textContent = 'Send reply'; }
  };
  $('#mdel').onclick = async () => { if (!confirm('Delete this message permanently?')) return; try { await call('DELETE', '/api/messages/' + curMsg.id); D.messages = D.messages.filter(m => m !== curMsg); renderInbox(); toast('Message deleted'); } catch (e) { fail(e); } };
}
async function upd(b) { try { Object.assign(curMsg, await call('PUT', '/api/messages/' + curMsg.id, b)); renderInbox(); toast('Saved'); } catch (e) { fail(e); } }

// ---------- subscribers ----------
const SV = $('#v-subscribers');
SV.querySelector('.kpi b').textContent = '0';
SV.querySelector('.grid.g4').insertAdjacentHTML('afterend', `<div class="card cp" id="camp" style="margin-bottom:20px" hidden><h3 style="margin-bottom:14px">New campaign</h3>
  <div class="field"><label>Subject</label><input class="input" id="cSub" placeholder="Daily Gold Brief — …"></div>
  <div class="field"><label>Message <span class="muted">(plain text — leave a blank line between paragraphs)</span></label><textarea class="input" id="cBody" rows="8"></textarea></div>
  <div class="row" style="justify-content:flex-end;flex-wrap:wrap"><button class="btn" id="cCancel">Cancel</button><button class="btn" id="cTest">Send test to me</button><button class="btn gold" id="cSend">Send to subscribers</button></div></div>
<div class="card" style="margin-bottom:20px"><div class="ch"><h3>Subscribers</h3></div><div class="tw"><table><thead><tr><th>Email</th><th>Status</th><th>Joined</th><th>Source</th><th></th></tr></thead><tbody id="subT"></tbody></table></div></div>
<div class="card cp" style="margin-bottom:20px"><h3 style="margin-bottom:6px">Email templates</h3><p class="muted" style="font-size:13px;margin-bottom:12px">Preview the emails your readers and team receive.</p><div class="row" style="flex-wrap:wrap;gap:8px">${['confirm-subscription','welcome','campaign','contact-auto-reply','contact-notification','contact-reply','password-changed'].map(n => `<a class="btn sm" target="_blank" href="/api/emails/preview/${n}">${n.replace(/-/g, ' ')} ↗</a>`).join('')}</div></div>`);
function renderSubs() {
  const confirmed = D.subscribers.filter(s => s.status === 'Confirmed');
  SV.querySelector('.kpi b').textContent = confirmed.length.toLocaleString();
  $('#cSend').textContent = `Send to ${confirmed.length} subscriber${confirmed.length === 1 ? '' : 's'}`;
  $('#subT').innerHTML = D.subscribers.length ? D.subscribers.map(s => `<tr><td><b>${esc(s.email)}</b></td><td><span class="badge ${s.status === 'Confirmed' ? 'pub' : s.status === 'Pending' ? 'sch' : 'draft'}">${esc(s.status || 'Confirmed')}</span></td><td class="num muted">${new Date(s.at).toLocaleString()}</td><td class="muted">${esc(s.source || 'website')}</td><td style="text-align:right"><button class="btn sm danger" data-e="${esc(s.email)}">Remove</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:32px">No subscribers yet — sign-ups from the website appear here.</td></tr>';
}
SV.addEventListener('click', async e => { const b = e.target.closest('[data-e]'); if (!b || !confirm('Remove ' + b.dataset.e + '?')) return; try { await call('DELETE', '/api/subscribers/' + encodeURIComponent(b.dataset.e)); D.subscribers = D.subscribers.filter(s => s.email !== b.dataset.e); renderSubs(); } catch (er) { fail(er); } });
const exp = [...SV.querySelectorAll('.ph .btn')].find(b => b.textContent === 'Export');
if (exp) exp.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['email,status,joined\n' + D.subscribers.map(s => `${s.email},${s.status},${new Date(s.at).toISOString()}`).join('\n')], { type: 'text/csv' })); a.download = 'subscribers.csv'; a.click(); };

const newCamp = [...SV.querySelectorAll('.ph .btn')].find(b => /campaign/i.test(b.textContent));
if (newCamp) newCamp.onclick = () => { $('#camp').hidden = false; $('#cSub').focus(); };
$('#cCancel').onclick = () => { $('#camp').hidden = true; };
async function sendCampaign(test) {
  const subject = $('#cSub').value.trim(), body = $('#cBody').value.trim();
  if (!subject || !body) return toast('Add a subject and message');
  const n = D.subscribers.filter(s => s.status === 'Confirmed').length;
  if (!test && !confirm(`Send "${subject}" to ${n} subscriber(s)? This can't be undone.`)) return;
  try { const r = await call('POST', '/api/campaigns', { subject, body, test }); toast(test ? 'Test sent to your email' : `Sent to ${r.sent} subscriber(s)${r.failed ? ', ' + r.failed + ' failed' : ''}`); if (!test) $('#camp').hidden = true; }
  catch (e) { fail(e); }
}
$('#cTest').onclick = () => sendCampaign(true);
$('#cSend').onclick = () => sendCampaign(false);

// ---------- integrations status ----------
function renderIntegrations() {
  const m = D.integrations?.markets; if (!m) return;
  $('#mkProvider').textContent = m.configured ? (m.error ? 'Twelve Data · error' : 'Twelve Data · connected') : 'Not connected';
  if (m.configured) $('#mkProviderNote').textContent = m.error ? 'Last refresh failed: ' + m.error : 'Last update: ' + (m.updated ? new Date(m.updated).toLocaleString() : 'pending…');
  $('#mkMode').textContent = m.mode === 'delayed' ? 'Delayed data' : 'Illustrative sample';
}

// ---------- load ----------
async function load() {
  try { D = await call('GET', '/api/admin'); } catch { return; }
  renderPosts(); counts(); fillForms(); renderInbox(); renderSubs(); renderIntegrations();
  if (location.hash === '#editor' && !cur) fillEditor(null);
  const unread = D.messages.filter(m => m.status === 'New').length, ib = document.querySelector('.sb a[href="#inbox"]');
  if (ib) { ib.querySelector('.cnt')?.remove(); if (unread) ib.insertAdjacentHTML('beforeend', `<span class="cnt" style="margin-left:auto;background:var(--gold);color:#0B1220;border-radius:999px;padding:0 7px;font-size:11px;font-weight:700">${unread}</span>`); }
}
fetch('/api/me', { credentials: 'same-origin' }).then(r => r.ok ? load() : showLogin()).catch(() => { showLogin(); document.getElementById('lerr').textContent = 'Server not running. Start it with: node server.js'; });
})();
