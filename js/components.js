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

  // Marks for the ways a seller can be contacted.
  facebook: '<path d="M13.4 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H16.6V3.6c-.3 0-1.33-.1-2.52-.1-2.5 0-4.2 1.52-4.2 4.32V9.9H7.2V13h2.68v8z"/>',
  telegram: '<path d="M21.6 4.2 2.9 11.4c-.95.37-.94 1.2.03 1.5l4.75 1.48 1.83 5.6c.22.6.1.84.73.84.48 0 .7-.22 .97-.48l2.3-2.24 4.8 3.54c.88.49 1.5.24 1.72-.81l3.1-14.6c.32-1.29-.5-1.87-1.53-1.4zM8.6 14.5l10.3-6.5c.5-.3.96-.14.58.19L10.9 16.1l-.34 3.7z"/>',
  phone: '<path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.05-.27 1.15.38 2.4.59 3.7.59.58 0 1.05.47 1.05 1.05V20c0 .58-.47 1.05-1.05 1.05C10.4 21.05 3 13.6 3 4.4 3 3.82 3.47 3.35 4.05 3.35H7.6c.58 0 1.05.47 1.05 1.05 0 1.3.21 2.55.59 3.7.12.36.04.74-.27 1.05z"/>',
  email: '<path d="M3.6 5.4h16.8c.9 0 1.6.7 1.6 1.6v10c0 .9-.7 1.6-1.6 1.6h-2.1V9.9L12 13.9 5.7 9.9v8.7H3.6c-.9 0-1.6-.7-1.6-1.6V7c0-.9.7-1.6 1.6-1.6zm0 1.8 8.4 5.3 8.4-5.3z"/>',
};

// These are solid shapes rather than outlines, so they are drawn filled.
const FILLED_ICONS = ['star', 'facebook', 'telegram', 'phone', 'email'];

function icon(name, className = '') {
  const filled = FILLED_ICONS.includes(name);
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true"
    fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${filled ? 0 : 2}"
    stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

// The four ways a seller or business can be reached, in the order they
// are shown. One copy, used by every page that lists contacts.
const CONTACT_KINDS = ['facebook', 'phone', 'telegram', 'email'];

function contactUrl(kind, value) {
  const clean = value.trim();
  if (kind === 'phone') return `tel:${clean.replace(/\s/g, '')}`;
  if (kind === 'email') return `mailto:${clean}`;
  if (clean.startsWith('http')) return clean;
  if (kind === 'facebook') return `https://facebook.com/${clean.replace(/^@/, '')}`;
  return `https://t.me/${clean.replace(/^@/, '').replace(/\s/g, '')}`;
}

// Builds the stack of contact buttons, each with its own mark.
function contactLinksHtml(profile) {
  const found = CONTACT_KINDS
    .map((kind) => [kind, profile['contact_' + kind] || ''])
    .filter(([, value]) => value.trim());

  if (!found.length) return `<p class="no-contact">${t('detail.noContact')}</p>`;

  return found.map(([kind, value]) => `
    <a class="contact-link contact-${kind}" href="${esc(contactUrl(kind, value))}"
       target="_blank" rel="noopener noreferrer">
      ${icon(kind, 'contact-mark')}<span>${esc(value)}</span>
    </a>`).join('');
}

function stars(rating) {
  const full = Math.round(Number(rating) || 0);
  let html = '<span class="stars">';
  for (let i = 1; i <= 5; i++) {
    html += icon('star', i <= full ? 'star-on' : 'star-off');
  }
  return html + '</span>';
}

// Businesses wear the gold badge, producers the green one, so the two
// kinds of account are told apart at a glance.
function verifiedBadge(role) {
  const kind = role === 'BUSINESS' ? ' badge-business' : '';
  return `<span class="badge-verified${kind}">${icon('check')}${t('card.verified')}</span>`;
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
    <article class="request-card reveal" data-request-id="${esc(r.id)}">
      <div class="request-card-media" style="background-image:url('${esc(imageUrl(cover))}')">
        <div class="request-card-tags">
          ${business.verification_status === 'VERIFIED' ? verifiedBadge(business.platform_role) : ''}
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
          <div class="province-line" title="${esc(provinces.join(', '))}">
            ${icon('pin')}<span>${provinces.length
              ? esc(provinces.join(' \u00b7 '))
              : t('req.anyProvince')}</span>
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
