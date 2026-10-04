// Product detail page: photos, seller information, farm story and reviews.

const productId = new URLSearchParams(location.search).get('id');

let product = null;
let photos = [];
let shownPhoto = 0;
let myRating = 0;

const errorBox = document.getElementById('page-error');

function showError(key) {
  errorBox.textContent = t(key);
  errorBox.hidden = false;
}

// Builds a safe link for each way of contacting the seller.
function contactLink(kind, value) {
  const clean = value.trim();
  if (kind === 'phone') return `tel:${clean.replace(/\s/g, '')}`;
  if (kind === 'email') return `mailto:${clean}`;
  if (clean.startsWith('http')) return clean;
  if (kind === 'facebook') return `https://facebook.com/${clean.replace(/^@/, '')}`;
  return `https://t.me/${clean.replace(/^@/, '').replace(/\s/g, '')}`;
}

function renderContacts(seller) {
  const kinds = [
    ['facebook', seller.contact_facebook],
    ['phone', seller.contact_phone],
    ['telegram', seller.contact_telegram],
    ['email', seller.contact_email],
  ];

  const box = document.getElementById('contact-links');
  const links = kinds.filter(([, value]) => value).map(([kind, value]) => `
    <a class="contact-link contact-${kind}" href="${esc(contactLink(kind, value))}"
       target="_blank" rel="noopener noreferrer">${esc(value)}</a>`);

  box.innerHTML = links.length ? links.join('') : `<p class="no-contact">${t('detail.noContact')}</p>`;
}

// Shows one photo in the big frame and marks its thumbnail.
function showPhoto(index) {
  if (!photos.length) return;
  shownPhoto = (index + photos.length) % photos.length;

  const main = document.getElementById('main-image');
  main.src = imageUrl(photos[shownPhoto].storage_path);

  document.querySelectorAll('.thumb').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.index) === shownPhoto);
  });

  const box = document.getElementById('lightbox');
  if (box && !box.hidden) {
    document.getElementById('lightbox-image').src = imageUrl(photos[shownPhoto].storage_path);
    document.getElementById('lightbox-count').textContent = `${shownPhoto + 1} / ${photos.length}`;
  }
}

function renderGallery() {
  const main = document.getElementById('main-image');
  const thumbs = document.getElementById('thumbs');

  main.onerror = function () { this.onerror = null; this.src = 'assets/images/placeholder.svg'; };
  main.alt = localName(product);

  // Every photo gets a thumbnail, including the cover, so the seller's
  // main picture can always be brought back.
  thumbs.hidden = photos.length < 2;
  thumbs.innerHTML = photos.map((photo, index) => `
    <button type="button" class="thumb" data-index="${index}"
            aria-label="${t('detail.photo')} ${index + 1}">
      <img src="${esc(imageUrl(photo.storage_path))}" alt="" loading="lazy" onerror="${FALLBACK_IMAGE}">
    </button>`).join('');

  thumbs.querySelectorAll('.thumb').forEach((button) => {
    button.addEventListener('click', () => showPhoto(Number(button.dataset.index)));
  });

  showPhoto(0);
}

// Opens the photo full size over the page.
function openLightbox() {
  if (!photos.length) return;
  const box = document.getElementById('lightbox');
  box.hidden = false;
  document.body.classList.add('no-scroll');
  document.getElementById('lightbox-image').src = imageUrl(photos[shownPhoto].storage_path);
  document.getElementById('lightbox-count').textContent = `${shownPhoto + 1} / ${photos.length}`;
  const steps = photos.length > 1;
  document.getElementById('lightbox-prev').hidden = !steps;
  document.getElementById('lightbox-next').hidden = !steps;
  document.getElementById('lightbox-close').focus();
}

function closeLightbox() {
  document.getElementById('lightbox').hidden = true;
  document.body.classList.remove('no-scroll');
}

// The viewer is optional, so the page still works if it is missing.
function setUpLightbox() {
  const box = document.getElementById('lightbox');
  const zoom = document.getElementById('zoom-button');
  if (!box || !zoom) return;

  zoom.addEventListener('click', openLightbox);
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', () => showPhoto(shownPhoto - 1));
  document.getElementById('lightbox-next').addEventListener('click', () => showPhoto(shownPhoto + 1));

  // Clicking the dark area closes the viewer, but clicking the photo does not.
  box.addEventListener('click', (event) => {
    if (event.target.id === 'lightbox') closeLightbox();
  });

  document.addEventListener('keydown', (event) => {
    if (box.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') showPhoto(shownPhoto - 1);
    if (event.key === 'ArrowRight') showPhoto(shownPhoto + 1);
  });
}

function stockText(status) {
  const keys = {
    IN_STOCK: 'form.stockIn',
    LIMITED: 'form.stockLimited',
    OUT_OF_STOCK: 'form.stockOut',
    PRE_ORDER: 'form.stockPre',
  };
  return t(keys[status] || 'form.stockIn');
}

function renderInformation(rating) {
  const shown = priceInCurrency(product);
  const price = formatPrice(shown.min, shown.max, shown.currency);
  document.getElementById('price').textContent = price || t('card.contactPrice');

  const rows = [
    ['detail.available', `<span class="in-stock">${esc(stockText(product.stock_status))}</span>`],
    ['detail.rating', `${stars(rating.average_rating)} <span>${Number(rating.average_rating || 0).toFixed(1)}</span>`],
    ['form.packaging', esc(product.packaging)],
    ['detail.productionDate', esc(product.production_period)],
    ['form.certification', esc(product.certification)],
    ['form.minOrder', product.min_order_qty ? `${formatNumber(product.min_order_qty)} ${esc(product.unit || '')}` : ''],
    ['detail.location', esc(localName(product.region))],
  ];

  document.getElementById('info-rows').innerHTML = rows
    .filter(([, value]) => value)
    .map(([key, value]) => `<div class="info-row"><dt>${t(key)}</dt><dd>${value}</dd></div>`)
    .join('');
}

function sellerChip(seller, extraClass = '') {
  const name = seller.business_name || seller.display_name;
  const letter = name.trim().charAt(0).toUpperCase();
  const avatar = seller.avatar_path
    ? `<img src="${esc(imageUrl(seller.avatar_path))}" alt="" onerror="${FALLBACK_IMAGE}">`
    : `<span class="chip-letter">${esc(letter)}</span>`;

  return `
    <a class="chip-inner ${extraClass}" href="producer.html?id=${esc(seller.id)}">
      ${avatar}
      <span>
        <strong>${esc(name)}</strong>
        <small>${icon('pin')}${esc(localName(seller.region) || '')}</small>
      </span>
      ${seller.verification_status === 'VERIFIED' ? verifiedBadge() : ''}
    </a>`;
}

function renderFarm(seller) {
  if (!seller.farm_story && !seller.bio) return;

  const band = document.getElementById('farm-band');
  band.hidden = false;

  document.getElementById('farm-label').textContent = seller.established_year
    ? `${t('spot.since')} ${seller.established_year}`
    : localName(seller.region) || '';
  document.getElementById('farm-name').textContent = seller.business_name || seller.display_name;
  document.getElementById('farm-story').textContent = seller.farm_story || seller.bio;
  document.getElementById('farm-chip').innerHTML = sellerChip(seller);

  const photo = (seller.seller_photos || [])[0];
  const image = document.getElementById('farm-photo');
  if (photo) {
    image.onerror = function () { this.closest('.farm-image').hidden = true; };
    image.src = imageUrl(photo.storage_path);
  } else {
    image.closest('.farm-image').hidden = true;
  }
}

function reviewCard(review) {
  const person = review.reviewer || {};
  const name = person.display_name || t('detail.buyer');
  const letter = name.trim().charAt(0).toUpperCase();
  const avatar = person.avatar_path
    ? `<img src="${esc(imageUrl(person.avatar_path))}" alt="" onerror="${FALLBACK_IMAGE}">`
    : `<span class="chip-letter">${esc(letter)}</span>`;

  return `
    <article class="review-card">
      <header>
        ${avatar}
        <span>
          <strong>${esc(name)}</strong>
          <small>${icon('pin')}${esc(localName(person.region) || '')}</small>
        </span>
        <button type="button" class="flag-button" data-review="${esc(review.id)}"
                title="${t('detail.report')}" aria-label="${t('detail.report')}">&#9873;</button>
      </header>
      <div class="review-stars">${stars(review.rating)}</div>
      <p>${esc(review.review_text || '')}</p>
    </article>`;
}

async function loadReviews() {
  const { data } = await db
    .from('product_reviews')
    .select('id, rating, review_text, created_at, reviewer:profiles!reviewer_id(display_name, avatar_path, region:regions(name_en, name_km))')
    .eq('product_id', productId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(20);

  const list = document.getElementById('review-list');
  const reviews = data || [];
  list.innerHTML = reviews.length
    ? reviews.map(reviewCard).join('')
    : emptyMessage('detail.noReviews');

  list.querySelectorAll('.flag-button').forEach((button) => {
    button.addEventListener('click', () => reportReview(button.dataset.review));
  });
}

// Reports go to the admin queue. Reviews are only hidden after a check.
async function reportReview(reviewId) {
  if (!auth.user) {
    location.href = `login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }

  const reason = prompt(t('detail.reportPrompt'));
  if (!reason || reason.trim().length < 3) return;

  const { error } = await db.from('content_reports').insert({
    reporter_id: auth.user.id,
    target_type: 'REVIEW',
    target_id: reviewId,
    reason: reason.trim(),
  });

  alert(error ? t('detail.reportAgain') : t('detail.reportThanks'));
}

function renderStarPicker() {
  const picker = document.getElementById('star-picker');
  picker.innerHTML = [1, 2, 3, 4, 5].map((value) => `
    <button type="button" data-value="${value}" class="${value <= myRating ? 'on' : ''}"
            aria-label="${value}">&#9733;</button>`).join('');

  picker.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      myRating = Number(button.dataset.value);
      renderStarPicker();
    });
  });
}

async function submitReview() {
  const message = document.getElementById('review-message');
  const button = document.getElementById('review-submit');

  if (!myRating) {
    message.textContent = t('detail.needRating');
    return;
  }

  button.disabled = true;
  message.textContent = '';

  const { error } = await db.from('product_reviews').upsert({
    product_id: productId,
    reviewer_id: auth.user.id,
    rating: myRating,
    review_text: document.getElementById('review-text').value.trim() || null,
  }, { onConflict: 'product_id,reviewer_id' });

  if (error) {
    message.textContent = t('detail.reviewFailed');
    button.disabled = false;
    return;
  }

  document.getElementById('review-text').value = '';
  myRating = 0;
  renderStarPicker();
  message.textContent = t('detail.reviewThanks');
  button.disabled = false;
  await loadReviews();
  await loadRating();
}

async function loadRating() {
  const { data } = await db
    .from('product_rating_summary')
    .select('average_rating, review_count')
    .eq('product_id', productId)
    .maybeSingle();

  const rating = data || { average_rating: 0, review_count: 0 };
  document.getElementById('rating-score').textContent = Number(rating.average_rating || 0).toFixed(1);
  document.getElementById('rating-stars').innerHTML = stars(rating.average_rating);
  document.getElementById('rating-count').textContent =
    `${t('detail.basedOn')} ${rating.review_count || 0} ${t('card.reviews')}`;
  return rating;
}

// Sellers cannot review their own product, and visitors must log in first.
function setUpReviewBox() {
  const box = document.getElementById('leave-review');
  const note = document.getElementById('review-note');

  // The notes carry data-i18n so they follow the language switch.
  if (!auth.user) {
    note.innerHTML = `<a href="login.html?next=${encodeURIComponent(location.pathname + location.search)}"
                         data-i18n="detail.loginToReview">${t('detail.loginToReview')}</a>`;
    note.hidden = false;
    return;
  }
  if (auth.user.id === product.owner_id) {
    note.setAttribute('data-i18n', 'detail.ownProduct');
    note.textContent = t('detail.ownProduct');
    note.hidden = false;
    return;
  }

  box.hidden = false;
  renderStarPicker();
  document.getElementById('review-submit').addEventListener('click', submitReview);
}

function renderBreadcrumb() {
  const parts = [
    `<a href="products.html">${t('nav.products')}</a>`,
    `<a href="products.html?category=${esc(product.category.slug)}">${esc(localName(product.category))}</a>`,
    `<a href="products.html?region=${esc(product.region_id)}">${esc(localName(product.region))}</a>`,
    `<span>${esc(localName(product))}</span>`,
  ];
  document.getElementById('breadcrumb').innerHTML = parts.join('<span class="sep">/</span>');
}

async function loadProduct() {
  const { data, error } = await db
    .from('products')
    .select(`
      id, name, name_km, description, price_min, price_max, currency, unit,
      price_usd_min, price_usd_max, price_khr_min, price_khr_max,
      min_order_qty, packaging, certification, production_period, stock_status,
      status, owner_id, category_id, region_id,
      category:categories(slug, name_en, name_km),
      region:regions(name_en, name_km),
      product_images(storage_path, is_cover, display_order),
      seller:profiles!owner_id(
        id, display_name, business_name, avatar_path, bio, farm_story,
        established_year, verification_status,
        contact_phone, contact_telegram, contact_facebook, contact_email,
        region:regions(name_en, name_km),
        seller_photos(storage_path, display_order)
      )`)
    .eq('id', productId)
    .maybeSingle();

  if (error || !data) {
    showError('detail.notFound');
    return;
  }

  product = data;
  photos = (data.product_images || [])
    .slice()
    .sort((a, b) => (b.is_cover - a.is_cover) || (a.display_order - b.display_order));

  document.title = `${localName(product)} | GoLocal`;
  document.getElementById('product-name').textContent = localName(product);
  document.getElementById('description-text').textContent = product.description || '';

  renderBreadcrumb();
  renderGallery();
  renderContacts(product.seller);
  document.getElementById('seller-chip').innerHTML = sellerChip(product.seller);
  renderFarm(product.seller);

  const rating = await loadRating();
  renderInformation(rating);
}

document.getElementById('back-button').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = 'products.html';
});

document.getElementById('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const term = document.getElementById('search-box').value.trim();
  location.href = term ? `products.html?q=${encodeURIComponent(term)}` : 'products.html';
});

async function initProductPage() {
  if (!productId) {
    showError('detail.notFound');
    return;
  }
  setUpLightbox();
  if (!auth.ready) await loadSession();
  await loadProduct();
  if (!product) return;
  await loadReviews();
  setUpReviewBox();
  applyTranslations();
}

initProductPage();
window.addEventListener('currencychange', () => {
  if (product) loadRating().then(renderInformation);
});

window.addEventListener('langchange', () => {
  if (product) {
    document.getElementById('product-name').textContent = localName(product);
    renderBreadcrumb();
    renderContacts(product.seller);
    document.getElementById('seller-chip').innerHTML = sellerChip(product.seller);
    renderFarm(product.seller);
    loadRating().then(renderInformation);
    loadReviews();
  }
});
