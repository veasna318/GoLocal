// The sourcing request detail modal, shared by the request board and by a
// business profile page. It builds its own markup so both pages behave the
// same way and only one copy has to be kept right.

const reqModal = {
  regions: [],      // the page fills this so province ids can be named
  request: null,    // the request now on screen
  photos: [],
  photoIndex: 0,
  rating: null,
  onClose: null,    // the page may want the address bar put back
};

function reqRegionName(id) {
  const found = reqModal.regions.find((r) => r.id === id);
  return found ? localName(found) : '';
}

function reqRangeText(min, max, suffix = '') {
  const low = min == null ? null : Number(min);
  const high = max == null ? null : Number(max);
  if (low == null && high == null) return '';
  if (low != null && high != null && low !== high) {
    return `${formatNumber(low)}${suffix} - ${formatNumber(high)}${suffix}`;
  }
  return `${formatNumber(low ?? high)}${suffix}`;
}

function reqBudgetText(r) {
  if (r.budget_min == null && r.budget_max == null) return t('req.budgetOpen');
  const money = (v) => formatMoney(v, r.currency);
  if (r.budget_min != null && r.budget_max != null && Number(r.budget_min) !== Number(r.budget_max)) {
    return `${money(r.budget_min)} - ${money(r.budget_max)}`;
  }
  return money(r.budget_min ?? r.budget_max);
}

function reqContactBlock(business) {
  if (business.verification_status !== 'VERIFIED') {
    return `<p class="no-contact">${t('detail.noContact')}</p>`;
  }
  return `<div class="contact-links">${contactLinksHtml(business)}</div>`;
}

// The page may not have the modal markup, so put it there once.
function buildRequestModal() {
  if (document.getElementById('req-modal')) return;

  const holder = document.createElement('div');
  holder.innerHTML = `
    <div class="req-modal" id="req-modal" role="dialog" aria-modal="true" hidden>
      <div class="req-modal-card" id="req-modal-card">
        <button type="button" class="req-modal-close" id="req-modal-close"
                data-i18n-label="detail.close">&times;</button>
        <div class="req-modal-left" id="req-modal-left"></div>
        <aside class="req-modal-side" id="req-modal-side"></aside>
      </div>
    </div>
    <div class="lightbox" id="req-lightbox" role="dialog" aria-modal="true" hidden>
      <button type="button" class="lightbox-close" id="req-lightbox-close"
              data-i18n-label="detail.close">&times;</button>
      <button type="button" class="lightbox-step" id="req-lightbox-prev"
              data-i18n-label="detail.previous">&#8249;</button>
      <img id="req-lightbox-image" alt="">
      <button type="button" class="lightbox-step" id="req-lightbox-next"
              data-i18n-label="detail.next">&#8250;</button>
      <span class="lightbox-count" id="req-lightbox-count"></span>
    </div>`;

  while (holder.firstElementChild) document.body.appendChild(holder.firstElementChild);
}

// The photo frame keeps a fixed shape and crops to fill it, so a tall or
// square photo leaves no empty bands. The full picture is one click away.
function reqGalleryHtml() {
  if (!reqModal.photos.length) return '';
  const many = reqModal.photos.length > 1;
  return `
    <div class="req-gallery">
      <img id="req-photo" src="${esc(imageUrl(reqModal.photos[reqModal.photoIndex]))}" alt=""
           onerror="${FALLBACK_IMAGE}">
      ${many ? `
        <button type="button" class="req-photo-step prev" data-step="-1"
                data-i18n-label="detail.previous">${icon('left')}</button>
        <button type="button" class="req-photo-step next" data-step="1"
                data-i18n-label="detail.next">${icon('right')}</button>
        <span class="req-photo-count" id="req-photo-count">${reqModal.photoIndex + 1} / ${reqModal.photos.length}</span>
      ` : ''}
      <span class="req-photo-zoom">${t('req.viewFull')}</span>
    </div>`;
}

function renderRequestModalLeft() {
  const r = reqModal.request;
  const business = r.business || {};
  const name = business.business_name || business.display_name || '';
  const place = reqRegionName(business.region_id);
  const extras = [[t('req.quality'), r.quality_requirements]].filter(([, value]) => value);

  document.getElementById('req-modal-left').innerHTML = `
    ${reqGalleryHtml()}
    <div class="req-modal-info">
      <h2>${esc(r.title)}</h2>

      <div class="seller-row req-business">
        <img class="avatar" src="${esc(imageUrl(business.avatar_path))}" alt="" onerror="${FALLBACK_IMAGE}">
        <div class="seller-row-text">
          <strong>${esc(name)}</strong>
          <small>${icon('pin')}${esc(place)}</small>
        </div>
        ${reqModal.rating ? `<div class="seller-row-rating">${icon('star', 'star-on')}${Number(reqModal.rating).toFixed(1)}</div>` : ''}
        ${business.verification_status === 'VERIFIED' ? verifiedBadge(business.platform_role) : ''}
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

function renderRequestModalSide() {
  const r = reqModal.request;
  const business = r.business || {};
  const wanted = (r.preferred_region_ids || []).map(reqRegionName).filter(Boolean);
  const urgent = r.urgency === 'URGENT';

  const rows = [
    [t('req.budget'), reqBudgetText(r), ''],
    [t('req.packaging'), r.packaging || t('req.any'), ''],
    [t('req.contract'), t(r.contract_type === 'LONG_TERM' ? 'req.longTerm' : 'req.oneTime'), ''],
    [t('req.deadline'), r.deadline ? formatDate(r.deadline) : t('req.noDeadline'), ''],
    [t('req.status'), urgent ? t('req.urgent') : t('req.open'), urgent ? 'value-urgent' : 'value-open'],
    [t('req.certification'), r.certification_required || t('req.any'), ''],
  ];

  document.getElementById('req-modal-side').innerHTML = `
    <p class="side-label">${t('req.specifications')}</p>
    <p class="side-quantity">${esc(reqRangeText(r.quantity_min, r.quantity_max, ' ' + (r.quantity_unit || 'kg')))}</p>

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
      ${reqContactBlock(business)}
    </div>`;
}

function redrawRequestModal() {
  if (!reqModal.request) return;
  renderRequestModalLeft();
  renderRequestModalSide();
}

function openRequestModal(request, rating) {
  if (!request) return;
  buildRequestModal();

  reqModal.request = request;
  reqModal.photos = request.image_paths || [];
  reqModal.photoIndex = 0;
  reqModal.rating = rating ?? null;

  redrawRequestModal();

  document.getElementById('req-modal').hidden = false;
  document.body.classList.add('no-scroll');
  document.getElementById('req-modal-card').scrollTop = 0;
  applyTranslations(document.getElementById('req-modal'));
}

function closeRequestModal() {
  const modal = document.getElementById('req-modal');
  if (modal) modal.hidden = true;
  const box = document.getElementById('req-lightbox');
  if (box) box.hidden = true;
  document.body.classList.remove('no-scroll');
  reqModal.request = null;
  if (typeof reqModal.onClose === 'function') reqModal.onClose();
}

function showRequestPhoto(step) {
  if (!reqModal.photos.length) return;
  reqModal.photoIndex = (reqModal.photoIndex + step + reqModal.photos.length) % reqModal.photos.length;
  document.getElementById('req-photo').src = imageUrl(reqModal.photos[reqModal.photoIndex]);
  const count = document.getElementById('req-photo-count');
  if (count) count.textContent = `${reqModal.photoIndex + 1} / ${reqModal.photos.length}`;
}

// Full size viewer, for the photo without the crop
function openRequestLightbox() {
  if (!reqModal.photos.length) return;
  document.getElementById('req-lightbox-image').src = imageUrl(reqModal.photos[reqModal.photoIndex]);
  document.getElementById('req-lightbox-count').textContent =
    reqModal.photos.length > 1 ? `${reqModal.photoIndex + 1} / ${reqModal.photos.length}` : '';
  document.getElementById('req-lightbox').hidden = false;
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
    target_id: reqModal.request.id,
    reason: reason.trim(),
  });
  alert(error ? t('detail.reportAgain') : t('detail.reportThanks'));
}

// Wires the modal once. Safe to call on any page that may open a request.
function setUpRequestModal() {
  buildRequestModal();

  document.getElementById('req-modal-close').addEventListener('click', closeRequestModal);
  document.getElementById('req-modal').addEventListener('click', (event) => {
    if (event.target.id === 'req-modal') closeRequestModal();
  });

  document.getElementById('req-modal-left').addEventListener('click', (event) => {
    const step = event.target.closest('[data-step]');
    if (step) { showRequestPhoto(Number(step.dataset.step)); return; }
    if (event.target.closest('#report-request')) { reportRequest(); return; }
    if (event.target.closest('.req-gallery')) openRequestLightbox();
  });

  const box = document.getElementById('req-lightbox');
  document.getElementById('req-lightbox-close').addEventListener('click', () => { box.hidden = true; });
  document.getElementById('req-lightbox-prev').addEventListener('click', () => {
    showRequestPhoto(-1); openRequestLightbox();
  });
  document.getElementById('req-lightbox-next').addEventListener('click', () => {
    showRequestPhoto(1); openRequestLightbox();
  });
  box.addEventListener('click', (event) => {
    if (event.target.id === 'req-lightbox') box.hidden = true;
  });

  document.addEventListener('keydown', (event) => {
    if (!reqModal.request) return;
    if (event.key === 'Escape') {
      if (!box.hidden) box.hidden = true;
      else closeRequestModal();
      return;
    }
    if (!box.hidden) return;
    if (event.key === 'ArrowLeft') showRequestPhoto(-1);
    if (event.key === 'ArrowRight') showRequestPhoto(1);
  });
}
