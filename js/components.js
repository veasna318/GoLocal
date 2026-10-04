// Reusable pieces of HTML used on several pages.

// Makes user-written text safe to put inside HTML.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ICONS = {
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  star: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  flag: '<path d="M5 21V4M5 5h11l-1.6 3.5L16 12H5"/>',
};

function icon(name, className = '') {
  const filled = name === 'star';
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true"
    fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${filled ? 0 : 2}"
    stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

function stars(rating) {
  const full = Math.round(Number(rating) || 0);
  let html = '<span class="stars">';
  for (let i = 1; i <= 5; i++) {
    html += icon('star', i <= full ? 'star-on' : 'star-off');
  }
  return html + '</span>';
}

function verifiedBadge() {
  return `<span class="badge-verified">${icon('check')}${t('card.verified')}</span>`;
}

const FALLBACK_IMAGE = "this.onerror=null;this.src='assets/images/placeholder.svg'";

function productCard(p) {
  const shown = priceInCurrency(p);
  const price = formatPrice(shown.min, shown.max, shown.currency);
  return `
    <a class="product-card reveal" href="product.html?id=${esc(p.id)}">
      <div class="product-card-media">
        <img src="${esc(imageUrl(p.cover_image_path))}" alt="${esc(p.name)}" loading="lazy" onerror="${FALLBACK_IMAGE}">
        ${p.is_boosted ? `<span class="tag tag-gold">${t('card.featured')}</span>` : ''}
      </div>
      <div class="product-card-body">
        <div class="product-card-title">
          <h3>${esc(localName(p))}</h3>
          ${p.seller_verified ? `<span class="verified-dot" title="${t('card.verified')}">${icon('check')}</span>` : ''}
        </div>
        <p class="product-card-location">${icon('pin')}${esc(localName(p, 'region_name') || p.region_name)}</p>
        <p class="product-card-price">
          ${price ? `${esc(price)} <span>/ ${esc(p.unit || 'unit')}</span>` : `<span>${t('card.contactPrice')}</span>`}
        </p>
        <div class="product-card-swap">
          <div class="product-card-meta">
            ${stars(p.average_rating)}
            <span class="rating-number">${Number(p.average_rating || 0).toFixed(1)}</span>
            <span class="review-count">${p.review_count || 0} ${t('card.reviews')}</span>
          </div>
          <div class="product-card-more">
            <span class="btn btn-outline btn-block btn-sm">${t('card.visit')}</span>
          </div>
        </div>
      </div>
    </a>`;
}

function requestCard(r, regionName, rating) {
  const business = r.business || {};
  const name = business.business_name || business.display_name || '';
  const quantity = r.quantity_min && r.quantity_max && Number(r.quantity_min) !== Number(r.quantity_max)
    ? `${formatNumber(r.quantity_min)} - ${formatNumber(r.quantity_max)}`
    : formatNumber(r.quantity_min || r.quantity_max || 0);
  const urgent = r.urgency === 'URGENT';
  const provinces = r.region_names || (r.preferred_region_ids || []).map(regionName).filter(Boolean);
  const businessRegion = business.region_name || regionName(business.region_id) || '';
  const cover = (r.image_paths || [])[0];

  return `
    <article class="request-card reveal">
      <div class="request-card-media" style="background-image:url('${esc(imageUrl(cover))}')">
        <div class="request-card-tags">
          ${business.verification_status === 'VERIFIED' ? verifiedBadge() : ''}
          ${urgent ? `<span class="tag tag-red">${t('req.urgent')}</span>` : ''}
        </div>
        <h3>${esc(r.title)}</h3>
      </div>
      <div class="request-card-body">
        <div class="seller-row">
          <img class="avatar" src="${esc(imageUrl(business.avatar_path))}" alt="" onerror="${FALLBACK_IMAGE}">
          <div class="seller-row-text">
            <strong>${esc(name)}</strong>
            <small>${icon('pin')}${esc(businessRegion)}</small>
          </div>
          ${rating ? `<div class="seller-row-rating">${icon('star', 'star-on')}${Number(rating).toFixed(1)}</div>` : ''}
        </div>

        <dl class="request-stats">
          <div><dt>${t('req.quantity')}</dt><dd>${quantity} ${esc(r.quantity_unit || 'kg')}</dd></div>
          <div><dt>${t('req.deadline')}</dt><dd>${r.deadline ? formatDate(r.deadline) : t('req.noDeadline')}</dd></div>
          <div><dt>${t('req.status')}</dt><dd class="${urgent ? 'text-red' : 'text-green'}">${urgent ? t('req.urgent') : t('req.open')}</dd></div>
        </dl>

        <div class="request-card-footer">
          <div class="province-list">
            ${provinces.length
              ? provinces.map((p) => `<span>${icon('pin')}${esc(p)}</span>`).join('')
              : `<span>${icon('pin')}${t('req.anyProvince')}</span>`}
          </div>
          <a class="btn btn-outline btn-sm" href="requests.html?id=${esc(r.id)}">${t('req.details')}</a>
        </div>
      </div>
    </article>`;
}

function skeletonCards(count, type = 'product') {
  return Array.from({ length: count }, () => `<div class="skeleton skeleton-${type}"></div>`).join('');
}

function emptyMessage(key) {
  return `<p class="empty-message">${t(key)}</p>`;
}

// Fades elements in as they scroll into view.
const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          el.classList.add('is-visible');
          revealObserver.unobserve(el);
          // Remove the stagger delay afterwards so hover effects react instantly.
          setTimeout(() => { el.style.transitionDelay = ''; }, 900);
        }
      });
    }, { threshold: 0.12 })
  : null;

function watchReveal(root = document) {
  root.querySelectorAll('.reveal:not(.is-visible)').forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`;
    if (revealObserver) revealObserver.observe(el);
    else el.classList.add('is-visible');
  });
}

// Lets a side scrolling row move with a normal mouse wheel.
// The page keeps scrolling once the row reaches either end.
function enableWheelScroll(row) {
  if (!row) return;
  row.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const before = row.scrollLeft;
    row.scrollLeft += event.deltaY;
    if (row.scrollLeft !== before) event.preventDefault();
  }, { passive: false });
}
