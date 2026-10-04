// Admin panel: the three queues an administrator works through.
// Decisions are made by database functions, so this page never changes
// a role or a verification status by itself.

const errorBox = document.getElementById('page-error');

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function sellerLabel(profile) {
  if (!profile) return '';
  const person = profile.display_name || '';
  const farm = profile.business_name || '';
  return farm && farm !== person ? `${person} (${farm})` : person;
}

// Evidence and payment slips live in private buckets.
async function signedUrl(bucket, path) {
  const { data } = await db.storage.from(bucket).createSignedUrl(path, 3600);
  return data ? data.signedUrl : '';
}

function openLightbox(url) {
  const box = document.getElementById('lightbox');
  document.getElementById('lightbox-image').src = url;
  box.hidden = false;
  document.body.classList.add('no-scroll');
}

document.getElementById('lightbox-close').addEventListener('click', () => {
  document.getElementById('lightbox').hidden = true;
  document.body.classList.remove('no-scroll');
});
document.getElementById('lightbox').addEventListener('click', (event) => {
  if (event.target.id === 'lightbox') {
    event.currentTarget.hidden = true;
    document.body.classList.remove('no-scroll');
  }
});

function thumbRow(items) {
  if (!items.length) return `<p class="muted">${t('adm.noFiles')}</p>`;
  return `<div class="evidence-row">${items.map((item) => `
    <button type="button" class="evidence-tile" data-url="${esc(item.url)}">
      <img src="${esc(item.url)}" alt="" loading="lazy" onerror="${FALLBACK_IMAGE}">
      <span>${t('adm.kind.' + item.kind)}</span>
    </button>`).join('')}</div>`;
}

function wireThumbs(root) {
  root.querySelectorAll('.evidence-tile').forEach((button) => {
    button.addEventListener('click', () => openLightbox(button.dataset.url));
  });
}

// Verification applications
async function loadApplications() {
  const pane = document.getElementById('pane-applications');
  pane.innerHTML = `<p class="muted">${t('adm.loading')}</p>`;

  const { data, error } = await db
    .from('verification_applications')
    .select(`id, requested_role, legal_name, business_or_farm_name, phone_number,
             address_summary, about_business, status, submitted_at,
             region:regions(name_en, name_km),
             applicant:profiles!applicant_id(id, display_name, business_name, avatar_path),
             verification_evidence(id, evidence_type, storage_path)`)
    .in('status', ['PENDING', 'NEEDS_MORE_INFO'])
    .order('submitted_at');

  if (error) { pane.innerHTML = emptyMessage('error.load'); return; }

  const rows = data || [];
  document.getElementById('count-applications').textContent = rows.length;

  if (!rows.length) { pane.innerHTML = emptyMessage('adm.noApplications'); return; }

  const cards = [];
  for (const row of rows) {
    const files = [];
    for (const item of row.verification_evidence || []) {
      files.push({ kind: item.evidence_type, url: await signedUrl('verification-evidence', item.storage_path) });
    }

    cards.push(`
      <article class="admin-card" data-id="${esc(row.id)}">
        <header class="admin-card-head">
          <div>
            <h2>${esc(row.business_or_farm_name)}</h2>
            <p class="muted">${esc(row.legal_name)} &#183; ${t('apply.' + (row.requested_role === 'BUSINESS' ? 'business' : 'producer'))}</p>
          </div>
          <span class="status-tag status-${esc(row.status)}">${esc(row.status)}</span>
        </header>

        <dl class="admin-facts">
          <div><dt>${t('apply.phone')}</dt><dd>${esc(row.phone_number)}</dd></div>
          <div><dt>${t('form.province')}</dt><dd>${esc(localName(row.region) || '')}</dd></div>
          <div><dt>${t('adm.submitted')}</dt><dd>${formatDate(row.submitted_at)}</dd></div>
          <div><dt>${t('adm.account')}</dt><dd><a href="producer.html?id=${esc(row.applicant.id)}" target="_blank">${esc(sellerLabel(row.applicant))}</a></dd></div>
        </dl>

        <p class="admin-text"><strong>${t('apply.address')}</strong><br>${esc(row.address_summary)}</p>
        <p class="admin-text"><strong>${t('apply.about')}</strong><br>${esc(row.about_business)}</p>

        ${thumbRow(files)}

        <div class="admin-actions">
          <button type="button" class="btn btn-green btn-sm" data-act="APPROVED">${t('adm.approve')}</button>
          <button type="button" class="btn btn-outline btn-sm" data-act="NEEDS_MORE_INFO">${t('adm.needInfo')}</button>
          <button type="button" class="btn btn-outline btn-sm danger" data-act="REJECTED">${t('adm.reject')}</button>
        </div>
      </article>`);
  }

  pane.innerHTML = cards.join('');
  wireThumbs(pane);

  pane.querySelectorAll('.admin-actions button').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('.admin-card');
      const decision = button.dataset.act;
      let note = null;

      if (decision !== 'APPROVED') {
        note = prompt(t(decision === 'REJECTED' ? 'adm.rejectReason' : 'adm.infoNeeded'));
        if (note === null) return;
      } else if (!confirm(t('adm.confirmApprove'))) {
        return;
      }

      card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const { error } = await db.rpc('review_application', {
        p_application_id: card.dataset.id,
        p_decision: decision,
        p_note: note || null,
      });
      if (error) { showError(error.message); card.querySelectorAll('button').forEach((b) => { b.disabled = false; }); return; }
      loadApplications();
    });
  });
}

// Content reports
const TARGET_PAGES = {
  PRODUCT: (id) => `product.html?id=${id}`,
  REVIEW: () => '',
  SOURCING_REQUEST: (id) => `requests.html?id=${id}`,
  PROFILE: (id) => `producer.html?id=${id}`,
};

async function loadReports() {
  const pane = document.getElementById('pane-reports');
  pane.innerHTML = `<p class="muted">${t('adm.loading')}</p>`;

  const { data, error } = await db
    .from('content_reports')
    .select('id, target_type, target_id, reason, status, created_at, reporter:profiles!reporter_id(display_name)')
    .eq('status', 'OPEN')
    .order('created_at');

  if (error) { pane.innerHTML = emptyMessage('error.load'); return; }

  const rows = data || [];
  document.getElementById('count-reports').textContent = rows.length;
  if (!rows.length) { pane.innerHTML = emptyMessage('adm.noReports'); return; }

  pane.innerHTML = rows.map((row) => {
    const link = (TARGET_PAGES[row.target_type] || (() => ''))(row.target_id);
    return `
      <article class="admin-card" data-id="${esc(row.id)}"
               data-target-type="${esc(row.target_type)}" data-target-id="${esc(row.target_id)}">
        <header class="admin-card-head">
          <div>
            <h2>${t('adm.target.' + row.target_type)}</h2>
            <p class="muted">${t('adm.reportedBy')} ${esc((row.reporter || {}).display_name || '')} &#183; ${formatDate(row.created_at)}</p>
          </div>
          ${link ? `<a class="btn btn-outline btn-sm" href="${esc(link)}" target="_blank">${t('adm.view')}</a>` : ''}
        </header>

        <p class="admin-text"><strong>${t('adm.reason')}</strong><br>${esc(row.reason)}</p>

        <div class="admin-actions">
          <button type="button" class="btn btn-outline btn-sm danger" data-act="hide">${t('adm.hideContent')}</button>
          <button type="button" class="btn btn-green btn-sm" data-act="resolve">${t('adm.resolve')}</button>
          <button type="button" class="btn btn-outline btn-sm" data-act="dismiss">${t('adm.dismiss')}</button>
        </div>
      </article>`;
  }).join('');

  pane.querySelectorAll('.admin-actions button').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('.admin-card');
      const act = button.dataset.act;
      card.querySelectorAll('button').forEach((b) => { b.disabled = true; });

      try {
        if (act === 'hide') {
          const type = card.dataset.targetType;
          const id = card.dataset.targetId;
          if (type === 'PRODUCT') {
            const { error } = await db.from('products').update({ status: 'HIDDEN' }).eq('id', id);
            if (error) throw error;
          } else if (type === 'REVIEW') {
            const { error } = await db.from('product_reviews').update({ is_hidden: true }).eq('id', id);
            if (error) throw error;
          } else if (type === 'SOURCING_REQUEST') {
            const { error } = await db.from('sourcing_requests').update({ status: 'HIDDEN' }).eq('id', id);
            if (error) throw error;
          } else {
            const { error } = await db.rpc('set_account_active', { p_user_id: id, p_active: false });
            if (error) throw error;
          }
        }

        const status = act === 'dismiss' ? 'DISMISSED' : 'RESOLVED';
        const { error } = await db.from('content_reports')
          .update({ status, resolved_by: auth.user.id, resolved_at: new Date().toISOString() })
          .eq('id', card.dataset.id);
        if (error) throw error;
        loadReports();
      } catch (error) {
        showError(error.message || t('error.load'));
        card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      }
    });
  });
}

// Promotion payments
async function loadBoosts() {
  const pane = document.getElementById('pane-boosts');
  pane.innerHTML = `<p class="muted">${t('adm.loading')}</p>`;

  const { data, error } = await db
    .from('product_boosts')
    .select(`id, duration_days, amount_usd, payment_proof_path, status, created_at,
             product:products(id, name, name_km),
             seller:profiles!seller_id(id, display_name, business_name)`)
    .eq('status', 'PENDING')
    .order('created_at');

  if (error) { pane.innerHTML = emptyMessage('error.load'); return; }

  const rows = data || [];
  document.getElementById('count-boosts').textContent = rows.length;
  if (!rows.length) { pane.innerHTML = emptyMessage('adm.noBoosts'); return; }

  const cards = [];
  for (const row of rows) {
    const slip = await signedUrl('payment-proofs', row.payment_proof_path);
    cards.push(`
      <article class="admin-card" data-id="${esc(row.id)}">
        <header class="admin-card-head">
          <div>
            <h2>${esc(localName(row.product) || '')}</h2>
            <p class="muted">${esc(sellerLabel(row.seller))}</p>
          </div>
          <a class="btn btn-outline btn-sm" href="product.html?id=${esc(row.product.id)}" target="_blank">${t('adm.view')}</a>
        </header>

        <dl class="admin-facts">
          <div><dt>${t('adm.days')}</dt><dd>${row.duration_days}</dd></div>
          <div><dt>${t('adm.amount')}</dt><dd>${formatMoney(row.amount_usd, 'USD')}</dd></div>
          <div><dt>${t('adm.submitted')}</dt><dd>${formatDate(row.created_at)}</dd></div>
        </dl>

        ${thumbRow(slip ? [{ kind: 'PAYMENT', url: slip }] : [])}

        <div class="admin-actions">
          <button type="button" class="btn btn-green btn-sm" data-act="yes">${t('adm.approvePayment')}</button>
          <button type="button" class="btn btn-outline btn-sm danger" data-act="no">${t('adm.reject')}</button>
        </div>
      </article>`);
  }

  pane.innerHTML = cards.join('');
  wireThumbs(pane);

  pane.querySelectorAll('.admin-actions button').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('.admin-card');
      const approve = button.dataset.act === 'yes';
      let note = null;
      if (!approve) {
        note = prompt(t('adm.rejectReason'));
        if (note === null) return;
      }

      card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const { error } = await db.rpc('review_boost', {
        p_boost_id: card.dataset.id,
        p_approve: approve,
        p_note: note || null,
      });
      if (error) { showError(error.message); card.querySelectorAll('button').forEach((b) => { b.disabled = false; }); return; }
      loadBoosts();
    });
  });
}

// Seller accounts. This queue is not a queue of problems: it lists every
// seller so an administrator can suspend one without waiting for a report.
let sellers = [];

// A suspended account keeps its old verification status in the database,
// so is_active decides which label to show.
function statusKey(profile) {
  return profile.is_active ? profile.verification_status : 'SUSPENDED';
}

function sellerCard(profile) {
  const key = statusKey(profile);
  const role = profile.platform_role === 'BUSINESS' ? t('apply.business') : t('apply.producer');
  const place = localName(profile.region) || '';
  const under = [profile.business_name, role, place].filter(Boolean).join(' · ');

  return `
    <article class="seller-row" data-id="${esc(profile.id)}" data-active="${profile.is_active}">
      <div class="seller-main">
        <h2>${esc(profile.display_name || '')}</h2>
        <p class="muted">${esc(under)}</p>
      </div>
      <span class="status-tag status-${key}">${t('adm.vs.' + key)}</span>
      <div class="seller-buttons">
        <a class="btn btn-outline btn-sm" href="producer.html?id=${esc(profile.id)}"
           target="_blank">${t('adm.view')}</a>
        <button type="button" class="btn btn-outline btn-sm ${profile.is_active ? 'danger' : ''}"
                data-act="${profile.is_active ? 'suspend' : 'restore'}">
          ${t(profile.is_active ? 'adm.suspend' : 'adm.restore')}
        </button>
      </div>
    </article>`;
}

// The seller list is small, so it is filtered here instead of in the database.
function drawSellers() {
  const list = document.getElementById('seller-list');
  const search = document.getElementById('seller-search').value.trim().toLowerCase();

  if (!sellers.length) { list.innerHTML = emptyMessage('adm.noSellers'); return; }

  const shown = search
    ? sellers.filter((p) => `${p.display_name || ''} ${p.business_name || ''}`
        .toLowerCase().includes(search))
    : sellers;

  if (!shown.length) { list.innerHTML = emptyMessage('adm.noMatch'); return; }
  list.innerHTML = shown.map(sellerCard).join('');

  list.querySelectorAll('.seller-buttons button').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('.seller-row');
      const makeActive = button.dataset.act === 'restore';
      if (!confirm(t(makeActive ? 'adm.confirmRestore' : 'adm.confirmSuspend'))) return;

      button.disabled = true;
      const { error } = await db.rpc('set_account_active', {
        p_user_id: row.dataset.id,
        p_active: makeActive,
      });
      if (error) { showError(error.message); button.disabled = false; return; }
      loadSellers();
    });
  });
}

async function loadSellers() {
  const list = document.getElementById('seller-list');
  list.innerHTML = `<p class="muted">${t('adm.loading')}</p>`;

  const { data, error } = await db
    .from('profiles')
    .select(`id, display_name, business_name, platform_role, verification_status,
             is_active, region:regions(name_en, name_km)`)
    .in('platform_role', ['PRODUCER', 'BUSINESS'])
    .order('display_name');

  if (error) { list.innerHTML = emptyMessage('error.load'); return; }

  sellers = data || [];
  document.getElementById('count-sellers').textContent = sellers.length;
  drawSellers();
}

function setUpTabs() {
  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach((t2) => t2.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.admin-pane').forEach((pane) => {
        pane.hidden = pane.id !== 'pane-' + tab.dataset.pane;
      });
    });
  });
}

async function loadAll() {
  await Promise.all([loadApplications(), loadReports(), loadBoosts(), loadSellers()]);
}

async function initAdminPage() {
  if (!(await requireAccount())) return;
  if (!isAdmin()) {
    location.href = 'index.html';
    return;
  }
  setUpTabs();
  document.getElementById('seller-search').addEventListener('input', drawSellers);
  await loadAll();
  applyTranslations();
}

initAdminPage();

window.addEventListener('langchange', loadAll);
