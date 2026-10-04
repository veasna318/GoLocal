// Producer profile page: who the seller is, their photos and their products.

const producerId = new URLSearchParams(location.search).get('id');

let seller = null;
let sellerPhotos = [];
let shownPhoto = 0;

const errorBox = document.getElementById('page-error');

function showError(key) {
  errorBox.textContent = t(key);
  errorBox.hidden = false;
}

function sellerName(person) {
  return person.business_name || person.display_name || '';
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

// Contact details are only shown for verified sellers.
function renderContacts() {
  const card = document.getElementById('profile-contact');
  const box = document.getElementById('contact-links');

  if (seller.verification_status !== 'VERIFIED') {
    card.hidden = true;
    return;
  }

  const kinds = [
    ['facebook', seller.contact_facebook],
    ['phone', seller.contact_phone],
    ['telegram', seller.contact_telegram],
    ['email', seller.contact_email],
  ].filter(([, value]) => value);

  card.hidden = false;
  box.innerHTML = kinds.length
    ? kinds.map(([kind, value]) => `
        <a class="contact-link contact-${kind}" href="${esc(contactLink(kind, value))}"
           target="_blank" rel="noopener noreferrer">${esc(value)}</a>`).join('')
    : `<p class="no-contact">${t('detail.noContact')}</p>`;
}

function renderHead(rating, productCount) {
  const person = seller.display_name || '';
  const farm = seller.business_name || '';
  const place = localName(seller.region) || '';

  document.title = `${farm || person} | GoLocal`;
  document.getElementById('profile-head').hidden = false;

  const cover = document.getElementById('profile-cover');
  const coverPath = seller.cover_path || (sellerPhotos[0] || {}).storage_path;
  if (coverPath) cover.style.backgroundImage = `url('${imageUrl(coverPath)}')`;
  else cover.classList.add('no-cover');

  const letter = (person || farm).trim().charAt(0).toUpperCase();
  document.getElementById('profile-avatar').innerHTML = seller.avatar_path
    ? `<img src="${esc(imageUrl(seller.avatar_path))}" alt="" onerror="${FALLBACK_IMAGE}">`
    : `<span class="chip-letter">${esc(letter)}</span>`;

  // The person's name is the heading. The farm and province sit under it.
  document.getElementById('profile-name').innerHTML =
    `${esc(person || farm)} ${seller.verification_status === 'VERIFIED' ? verifiedBadge() : ''}`;

  const subLine = document.getElementById('profile-sub');
  const parts = [];
  if (farm) parts.push(`<span class="sub-farm">${esc(farm)}</span>`);
  if (place) parts.push(`<span class="sub-place">${icon('pin')}${esc(place)}</span>`);
  subLine.hidden = !parts.length;
  subLine.innerHTML = parts.join('<span class="sub-dot">&#183;</span>');

  const rows = [
    ['prod.productCount', String(productCount)],
    ['detail.rating', `${stars(rating.average_rating)} <span>${Number(rating.average_rating || 0).toFixed(1)}</span>`],
    ['card.reviews', String(rating.review_count || 0)],
    ['spot.since', seller.established_year ? String(seller.established_year) : ''],
    ['prod.capacity', esc(seller.production_capacity)],
    ['prod.owner', esc(farm)],
  ];

  document.getElementById('profile-stats').innerHTML = rows
    .filter(([, value]) => value)
    .map(([key, value]) => `<div class="profile-stat"><dt>${t(key)}</dt><dd>${value}</dd></div>`)
    .join('');
}

// The short introduction sits in the head card under the name.
// The farm story sits under the farm photos instead.
function renderStory() {
  const box = document.getElementById('profile-bio');
  const intro = seller.bio || '';
  box.hidden = !intro;
  box.textContent = intro;
}

function renderPhotos() {
  const section = document.getElementById('profile-photos');
  const storyBox = document.getElementById('farm-story');
  const story = seller.farm_story || '';

  storyBox.hidden = !story;
  storyBox.textContent = story;

  // The section still shows when there is a story but no photos yet.
  section.hidden = !sellerPhotos.length && !story;
  if (!sellerPhotos.length) {
    document.getElementById('photo-row').innerHTML = '';
    return;
  }

  const row = document.getElementById('photo-row');
  row.innerHTML = sellerPhotos.map((photo, index) => `
    <button type="button" class="photo-tile" data-index="${index}"
            aria-label="${t('detail.photo')} ${index + 1}">
      <img src="${esc(imageUrl(photo.storage_path))}" alt="${esc(photo.caption || '')}"
           loading="lazy" onerror="${FALLBACK_IMAGE}">
      ${photo.caption ? `<span class="photo-caption">${esc(photo.caption)}</span>` : ''}
    </button>`).join('');

  row.querySelectorAll('.photo-tile').forEach((button) => {
    button.addEventListener('click', () => openLightbox(Number(button.dataset.index)));
  });

  enableWheelScroll(row);
}

// Full size photo viewer, shared with the product page markup.
function showLightboxPhoto(index) {
  if (!sellerPhotos.length) return;
  shownPhoto = (index + sellerPhotos.length) % sellerPhotos.length;
  document.getElementById('lightbox-image').src = imageUrl(sellerPhotos[shownPhoto].storage_path);
  document.getElementById('lightbox-count').textContent = `${shownPhoto + 1} / ${sellerPhotos.length}`;
}

function openLightbox(index) {
  const box = document.getElementById('lightbox');
  if (!box || !sellerPhotos.length) return;
  box.hidden = false;
  document.body.classList.add('no-scroll');
  showLightboxPhoto(index);
  const steps = sellerPhotos.length > 1;
  document.getElementById('lightbox-prev').hidden = !steps;
  document.getElementById('lightbox-next').hidden = !steps;
  document.getElementById('lightbox-close').focus();
}

function closeLightbox() {
  document.getElementById('lightbox').hidden = true;
  document.body.classList.remove('no-scroll');
}

function setUpLightbox() {
  const box = document.getElementById('lightbox');
  if (!box) return;

  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', () => showLightboxPhoto(shownPhoto - 1));
  document.getElementById('lightbox-next').addEventListener('click', () => showLightboxPhoto(shownPhoto + 1));

  box.addEventListener('click', (event) => {
    if (event.target.id === 'lightbox') closeLightbox();
  });

  document.addEventListener('keydown', (event) => {
    if (box.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') showLightboxPhoto(shownPhoto - 1);
    if (event.key === 'ArrowRight') showLightboxPhoto(shownPhoto + 1);
  });
}

// Reports go to the admin queue. Nothing is hidden until an admin checks it.
async function reportProfile() {
  if (!auth.user) {
    location.href = `login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }

  const reason = prompt(t('detail.reportPrompt'));
  if (!reason || reason.trim().length < 3) return;

  const { error } = await db.from('content_reports').insert({
    reporter_id: auth.user.id,
    target_type: 'PROFILE',
    target_id: producerId,
    reason: reason.trim(),
  });

  alert(error ? t('detail.reportAgain') : t('detail.reportThanks'));
}

async function loadRating() {
  const { data } = await db
    .from('seller_rating_summary')
    .select('average_rating, review_count')
    .eq('seller_id', producerId)
    .maybeSingle();

  return data || { average_rating: 0, review_count: 0 };
}

// The profile lists the certifications the seller holds, gathered from
// their published products so nothing has to be typed twice.
function renderCertifications(products) {
  const box = document.getElementById('profile-certs');
  const names = [...new Set(
    products
      .map((p) => (p.certification || '').trim())
      .filter(Boolean)
      .flatMap((value) => value.split(/[,;/]/).map((part) => part.trim()))
      .filter(Boolean),
  )];

  box.hidden = !names.length;
  box.innerHTML = names.length
    ? `<span class="cert-label">${t('prod.certs')}</span>`
      + names.map((name) => `<span class="cert-chip">${icon('check')}${esc(name)}</span>`).join('')
    : '';
}

async function loadProducts() {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = skeletonCards(4);

  const { data } = await db
    .from('product_cards')
    .select('*')
    .eq('seller_id', producerId)
    .eq('status', 'PUBLISHED')
    .order('is_boosted', { ascending: false })
    .order('published_at', { ascending: false });

  const products = data || [];
  grid.innerHTML = products.length
    ? products.map(productCard).join('')
    : emptyMessage('prod.noProducts');

  document.getElementById('product-count').textContent =
    `${products.length} ${products.length === 1 ? t('spot.product') : t('spot.products')}`;

  renderCertifications(products);

  watchReveal(grid);
  return products.length;
}

async function loadProducer() {
  const { data, error } = await db
    .from('profiles')
    .select(`
      id, display_name, business_name, platform_role, avatar_path, cover_path,
      bio, farm_story, established_year, production_capacity, verification_status,
      contact_phone, contact_telegram, contact_facebook, contact_email,
      region:regions(name_en, name_km),
      seller_photos(storage_path, caption, display_order)`)
    .eq('id', producerId)
    .maybeSingle();

  if (error || !data) {
    showError('prod.notFound');
    return false;
  }

  seller = data;
  sellerPhotos = (data.seller_photos || [])
    .slice()
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  return true;
}

// The owner of the profile gets an edit link instead of only a report button.
function showOwnerTools() {
  const isMine = auth.user && auth.user.id === producerId;
  document.getElementById('edit-account').hidden = !isMine;
  document.getElementById('report-profile').hidden = !!isMine;
}

function renderAll(rating, productCount) {
  renderHead(rating, productCount);
  renderStory();
  renderPhotos();
  renderContacts();
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

document.getElementById('report-profile').addEventListener('click', reportProfile);

async function initProducerPage() {
  if (!producerId) {
    showError('prod.notFound');
    return;
  }

  setUpLightbox();
  if (!auth.ready) await loadSession();
  if (!await loadProducer()) return;

  const [rating, productCount] = await Promise.all([loadRating(), loadProducts()]);
  renderAll(rating, productCount);
  showOwnerTools();
  applyTranslations();
}

initProducerPage();

window.addEventListener('currencychange', () => {
  if (seller) loadProducts();
});

window.addEventListener('langchange', async () => {
  if (!seller) return;
  const rating = await loadRating();
  const productCount = await loadProducts();
  renderAll(rating, productCount);
});
