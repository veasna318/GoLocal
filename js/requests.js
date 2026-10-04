// Request board: every open sourcing request, with the full brief shown
// in a modal so the visitor never leaves the board.

const board = {
  regions: [],
  requests: [],
  ratings: {},
  region: 'all',
  search: '',
  open: null,       // the request shown in the modal
  photos: [],       // its photo paths
  photoIndex: 0,
};

const MAIN_REGIONS = ['Phnom Penh', 'Kandal', 'Takeo', 'Kampong Speu', 'Battambang', 'Pursat', 'Siem Reap'];

function regionById(id) {
  return board.regions.find((r) => r.id === id);
}

function regionName(id) {
  return localName(regionById(id)) || '';
}

function addStaticIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}

// Filters

function renderRegionChips() {
  const main = MAIN_REGIONS.map((name) => board.regions.find((r) => r.name_en === name)).filter(Boolean);
  const others = board.regions.filter((r) => !main.includes(r));
  const isOther = others.some((r) => r.id === board.region);

  document.getElementById('region-chips').innerHTML = `
    <button class="chip ${board.region === 'all' ? 'active' : ''}" data-region="all">${t('filter.allRegions')}</button>
    ${main.map((r) => `
      <button class="chip ${board.region === r.id ? 'active' : ''}" data-region="${r.id}">${esc(localName(r))}</button>
    `).join('')}
    <select class="chip chip-select ${isOther ? 'active' : ''}" aria-label="${t('filter.more')}">
      <option value="">${t('filter.more')}</option>
      ${others.map((r) => `<option value="${r.id}" ${board.region === r.id ? 'selected' : ''}>${esc(localName(r))}</option>`).join('')}
    </select>`;
}

// A request matches a province when it asks for that province, or when it
// accepts any province, or when the business itself is based there.
function matchesRegion(r) {
  if (board.region === 'all') return true;
  const wanted = r.preferred_region_ids || [];
  if (!wanted.length) return true;
  return wanted.includes(board.region) || (r.business || {}).region_id === board.region;
}

function matchesSearch(r) {
  if (!board.search) return true;
  const business = r.business || {};
  const haystack = [r.title, r.description, business.business_name, business.display_name]
    .filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(board.search);
}

function visibleRequests() {
  return board.requests.filter((r) => matchesRegion(r) && matchesSearch(r));
}

function renderBoard() {
  const grid = document.getElementById('request-grid');
  const rows = visibleRequests();

  document.getElementById('result-count').textContent =
    rows.length === 1 ? t('req.oneResult') : t('req.results').replace('{n}', rows.length);

  grid.innerHTML = rows.length
    ? rows.map((r) => requestCard(r, regionName, board.ratings[r.business?.id])).join('')
    : emptyMessage(board.requests.length ? 'req.noMatch' : 'empty.requests');
  watchReveal(grid);
}

// Loading

async function loadRegions() {
  const { data } = await db.from('regions')
    .select('id, name_en, name_km').eq('is_active', true).order('name_en');
  board.regions = data || [];
}

async function loadRequests() {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await db
    .from('sourcing_requests')
    .select(`id, title, description, quantity_min, quantity_max, quantity_unit,
             budget_min, budget_max, currency, packaging, certification_required,
             quality_requirements, contract_type, urgency, preferred_region_ids,
             image_paths, deadline, status, created_at,
             category:categories(name_en, name_km),
             business:profiles!business_id(id, display_name, business_name, avatar_path,
               verification_status, region_id, contact_phone, contact_telegram,
               contact_facebook, contact_email)`)
    .eq('status', 'OPEN')
    .or(`deadline.is.null,deadline.gte.${today}`)
    .order('urgency', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    document.getElementById('request-grid').innerHTML = emptyMessage('error.load');
    return;
  }

  board.requests = data || [];

  const ids = [...new Set(board.requests.map((r) => r.business?.id).filter(Boolean))];
  if (ids.length) {
    const ratings = await db.from('seller_rating_summary')
      .select('seller_id, average_rating').in('seller_id', ids);
    (ratings.data || []).forEach((row) => { board.ratings[row.seller_id] = row.average_rating; });
  }
}

// Modal

function rangeText(min, max, suffix = '') {
  const low = min == null ? null : Number(min);
  const high = max == null ? null : Number(max);
  if (low == null && high == null) return '';
  if (low != null && high != null && low !== high) {
    return `${formatNumber(low)}${suffix} - ${formatNumber(high)}${suffix}`;
  }
  return `${formatNumber(low ?? high)}${suffix}`;
}

function budgetText(r) {
  if (r.budget_min == null && r.budget_max == null) return t('req.budgetOpen');
  const money = (v) => formatMoney(v, r.currency);
  if (r.budget_min != null && r.budget_max != null && Number(r.budget_min) !== Number(r.budget_max)) {
    return `${money(r.budget_min)} - ${money(r.budget_max)}`;
  }
  return money(r.budget_min ?? r.budget_max);
}

function contactLink(kind, value) {
  const clean = value.trim();
  if (kind === 'phone') return `tel:${clean.replace(/\s/g, '')}`;
  if (kind === 'email') return `mailto:${clean}`;
  if (clean.startsWith('http')) return clean;
  if (kind === 'facebook') return `https://facebook.com/${clean.replace(/^@/, '')}`;
  return `https://t.me/${clean.replace(/^@/, '').replace(/\s/g, '')}`;
}

function contactBlock(business) {
  if (business.verification_status !== 'VERIFIED') {
    return `<p class="no-contact">${t('detail.noContact')}</p>`;
  }
  const kinds = [
    ['facebook', business.contact_facebook],
    ['phone', business.contact_phone],
    ['telegram', business.contact_telegram],
    ['email', business.contact_email],
  ].filter(([, value]) => value);

  if (!kinds.length) return `<p class="no-contact">${t('detail.noContact')}</p>`;

  return `<div class="contact-links">${kinds.map(([kind, value]) => `
    <a class="contact-link contact-${kind}" href="${esc(contactLink(kind, value))}"
       target="_blank" rel="noopener noreferrer">${esc(value)}</a>`).join('')}</div>`;
}

// The photo frame keeps a fixed shape and crops to fill it, so a tall or
// square photo leaves no empty bands. The full picture is one click away.
function galleryHtml() {
  if (!board.photos.length) return '';
  const many = board.photos.length > 1;
  return `
    <div class="req-gallery">
      <img id="req-photo" src="${esc(imageUrl(board.photos[board.photoIndex]))}" alt=""
           onerror="${FALLBACK_IMAGE}">
      ${many ? `
        <button type="button" class="req-photo-step prev" data-step="-1" aria-label="Previous">${icon('left')}</button>
        <button type="button" class="req-photo-step next" data-step="1" aria-label="Next">${icon('right')}</button>
        <span class="req-photo-count" id="req-photo-count">${board.photoIndex + 1} / ${board.photos.length}</span>
      ` : ''}
      <span class="req-photo-zoom">${t('req.viewFull')}</span>
    </div>`;
}

function renderModalLeft(r) {
  const business = r.business || {};
  const name = business.business_name || business.display_name || '';
  const place = regionName(business.region_id);
  const rating = board.ratings[business.id];
  const extras = [[t('req.quality'), r.quality_requirements]].filter(([, value]) => value);

  document.getElementById('req-modal-left').innerHTML = `
    ${galleryHtml()}
    <div class="req-modal-info">
      <h2>${esc(r.title)}</h2>

      <div class="seller-row req-business">
        <img class="avatar" src="${esc(imageUrl(business.avatar_path))}" alt="" onerror="${FALLBACK_IMAGE}">
        <div class="seller-row-text">
          <strong>${esc(name)}</strong>
          <small>${icon('pin')}${esc(place)}</small>
        </div>
        ${rating ? `<div class="seller-row-rating">${icon('star', 'star-on')}${Number(rating).toFixed(1)}</div>` : ''}
        ${business.verification_status === 'VERIFIED' ? verifiedBadge() : ''}
      </div>

      <h3>${t('req.detailsHeading')}</h3>
      <p class="req-description">${esc(r.description)}</p>

      ${extras.map(([label, value]) => `
        <h3>${label}</h3>
        <p class="req-description">${esc(value)}</p>`).join('')}

      <div class="req-modal-foot">
        <a class="visit-link" href="producer.html?id=${esc(business.id)}">${t('req.viewBusiness')}</a>
        <button type="button" class="report-flag" id="report-request">
          ${icon('flag')}${t('req.report')}
        </button>
      </div>
    </div>`;
}

function renderModalSide(r) {
  const business = r.business || {};
  const wanted = (r.preferred_region_ids || []).map(regionName).filter(Boolean);
  const urgent = r.urgency === 'URGENT';

  const rows = [
    [t('req.budget'), budgetText(r), ''],
    [t('req.packaging'), r.packaging || t('req.any'), ''],
    [t('req.contract'), t(r.contract_type === 'LONG_TERM' ? 'req.longTerm' : 'req.oneTime'), ''],
    [t('req.deadline'), r.deadline ? formatDate(r.deadline) : t('req.noDeadline'), ''],
    [t('req.status'), urgent ? t('req.urgent') : t('req.open'), urgent ? 'value-urgent' : 'value-open'],
    [t('req.certification'), r.certification_required || t('req.any'), ''],
  ];

  document.getElementById('req-modal-side').innerHTML = `
    <p class="side-label">${t('req.specifications')}</p>
    <p class="side-quantity">${esc(rangeText(r.quantity_min, r.quantity_max, ' ' + (r.quantity_unit || 'kg')))}</p>

    <dl class="side-rows">
      ${rows.map(([label, value, cls]) => `
        <div><dt>${label}</dt><dd class="${cls}">${esc(value)}</dd></div>`).join('')}
    </dl>

    <p class="side-label">${t('req.supplierLocation')}</p>
    <div class="province-list side-provinces">
      ${wanted.length
        ? wanted.map((p) => `<span>${icon('pin')}${esc(p)}</span>`).join('')
        : `<span>${icon('pin')}${t('req.anyProvince')}</span>`}
    </div>

    <div class="side-contact">
      <p class="side-label">${t('req.contactBusiness')}</p>
      ${contactBlock(business)}
    </div>`;
}

function openRequest(id) {
  const r = board.requests.find((row) => row.id === id);
  if (!r) return;

  board.open = r;
  board.photos = r.image_paths || [];
  board.photoIndex = 0;

  renderModalLeft(r);
  renderModalSide(r);

  const modal = document.getElementById('req-modal');
  modal.hidden = false;
  document.body.classList.add('no-scroll');
  document.getElementById('req-modal-card').scrollTop = 0;

  history.replaceState(null, '', `requests.html?id=${encodeURIComponent(id)}`);
}

function closeRequest() {
  document.getElementById('req-modal').hidden = true;
  document.getElementById('lightbox').hidden = true;
  document.body.classList.remove('no-scroll');
  board.open = null;
  history.replaceState(null, '', 'requests.html');
}

function showPhoto(step) {
  if (!board.photos.length) return;
  board.photoIndex = (board.photoIndex + step + board.photos.length) % board.photos.length;
  document.getElementById('req-photo').src = imageUrl(board.photos[board.photoIndex]);
  const count = document.getElementById('req-photo-count');
  if (count) count.textContent = `${board.photoIndex + 1} / ${board.photos.length}`;
}

// Full size viewer, for the uncropped photo
function openLightbox() {
  if (!board.photos.length) return;
  document.getElementById('lightbox-image').src = imageUrl(board.photos[board.photoIndex]);
  document.getElementById('lightbox-count').textContent =
    board.photos.length > 1 ? `${board.photoIndex + 1} / ${board.photos.length}` : '';
  document.getElementById('lightbox').hidden = false;
}

function stepLightbox(step) {
  showPhoto(step);
  openLightbox();
}

async function reportRequest() {
  if (!auth.user) {
    location.href = `login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }
  const reason = prompt(t('detail.reportPrompt'));
  if (!reason || reason.trim().length < 3) return;

  const { error } = await db.from('content_reports').insert({
    reporter_id: auth.user.id,
    target_type: 'SOURCING_REQUEST',
    target_id: board.open.id,
    reason: reason.trim(),
  });
  alert(error ? t('detail.reportAgain') : t('detail.reportThanks'));
}

// Events

function setUpEvents() {
  const chips = document.getElementById('region-chips');
  chips.addEventListener('click', (event) => {
    const button = event.target.closest('[data-region]');
    if (!button) return;
    board.region = button.dataset.region;
    renderRegionChips();
    renderBoard();
  });
  chips.addEventListener('change', (event) => {
    if (!event.target.value) return;
    board.region = event.target.value;
    renderRegionChips();
    renderBoard();
  });

  const input = document.getElementById('search-input');
  input.addEventListener('input', () => {
    board.search = input.value.trim().toLowerCase();
    renderBoard();
  });
  document.getElementById('search-form').addEventListener('submit', (e) => e.preventDefault());

  // The card's Details link points at this page, so open the modal instead.
  document.getElementById('request-grid').addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="requests.html?id="]');
    if (!link) return;
    event.preventDefault();
    openRequest(new URL(link.href, location.href).searchParams.get('id'));
  });

  document.getElementById('req-modal-close').addEventListener('click', closeRequest);
  document.getElementById('req-modal').addEventListener('click', (event) => {
    if (event.target.id === 'req-modal') closeRequest();
  });

  document.getElementById('req-modal-left').addEventListener('click', (event) => {
    const step = event.target.closest('[data-step]');
    if (step) { showPhoto(Number(step.dataset.step)); return; }
    if (event.target.closest('#report-request')) { reportRequest(); return; }
    if (event.target.closest('.req-gallery')) openLightbox();
  });

  document.getElementById('lightbox-close').addEventListener('click', () => {
    document.getElementById('lightbox').hidden = true;
  });
  document.getElementById('lightbox-prev').addEventListener('click', () => stepLightbox(-1));
  document.getElementById('lightbox-next').addEventListener('click', () => stepLightbox(1));
  document.getElementById('lightbox').addEventListener('click', (event) => {
    if (event.target.id === 'lightbox') event.currentTarget.hidden = true;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!document.getElementById('lightbox').hidden) {
        document.getElementById('lightbox').hidden = true;
      } else if (!document.getElementById('req-modal').hidden) {
        closeRequest();
      }
    }
    if (board.open && document.getElementById('lightbox').hidden) {
      if (event.key === 'ArrowLeft') showPhoto(-1);
      if (event.key === 'ArrowRight') showPhoto(1);
    }
  });

  document.getElementById('back-button').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.href = 'index.html';
  });
}

async function initBoard() {
  addStaticIcons();
  setUpEvents();

  await loadRegions();
  renderRegionChips();
  await loadRequests();
  renderBoard();
  applyTranslations();

  // Arriving from the home page with a request already chosen.
  const wanted = new URLSearchParams(location.search).get('id');
  if (wanted) openRequest(wanted);
}

initBoard();

// Province and category names come from the database, so redraw on a
// language change. The open request is redrawn too.
window.addEventListener('langchange', () => {
  renderRegionChips();
  renderBoard();
  if (board.open) {
    renderModalLeft(board.open);
    renderModalSide(board.open);
  }
  applyTranslations();
});
