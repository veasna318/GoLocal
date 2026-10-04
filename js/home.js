// Home page: loads data from Supabase and fills each section.

const MAIN_REGIONS = ['Phnom Penh', 'Kandal', 'Takeo', 'Kampong Speu', 'Battambang', 'Pursat', 'Siem Reap'];

const home = {
  regions: [],
  categories: [],
  region: 'all',
  useSample: false,
  featured: [],
  trending: [],
  requests: [],
  sellerRatings: {},
  producers: [],
  spotIndex: 0,
  regionCounts: {},
};

function regionById(id) {
  return home.regions.find((r) => r.id === id);
}

function regionName(id) {
  return localName(regionById(id)) || '';
}

function addStaticIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
  document.querySelector('.carousel-arrow.prev').innerHTML = icon('left');
  document.querySelector('.carousel-arrow.next').innerHTML = icon('right');
}

async function loadReferenceData() {
  const [regions, categories] = await Promise.all([
    db.from('regions').select('id, name_en, name_km').eq('is_active', true).order('name_en'),
    db.from('categories').select('id, name_en, name_km, slug, icon_path').eq('is_active', true).order('display_order'),
  ]);
  if (regions.error || categories.error) throw regions.error || categories.error;
  home.regions = regions.data;
  home.categories = categories.data;
}

// Banner location pills show the province name in the current language.
function renderStoryRegions() {
  document.querySelectorAll('.story-location[data-region]').forEach((el) => {
    const region = home.regions.find((r) => r.name_en === el.dataset.region);
    el.innerHTML = icon('pin') + esc(region ? localName(region) : el.dataset.region);
  });
}

function updateCategoryFade() {
  const row = document.getElementById('category-row');
  const end = row.scrollWidth - row.clientWidth;
  row.classList.toggle('fade-left', row.scrollLeft > 4);
  row.classList.toggle('fade-right', row.scrollLeft < end - 4);
}

function renderCategories() {
  const row = document.getElementById('category-row');
  row.innerHTML = home.categories.map((c) => `
    <a class="category-card" href="products.html?category=${esc(c.slug)}">
      <img src="${esc(c.icon_path ? imageUrl(c.icon_path) : `assets/images/categories/${c.slug}.png`)}" alt="" loading="lazy" onerror="${FALLBACK_IMAGE}">
      <span>${esc(localName(c))}</span>
    </a>`).join('');
  updateCategoryFade();
}

function renderRegionChips() {
  const main = MAIN_REGIONS.map((name) => home.regions.find((r) => r.name_en === name)).filter(Boolean);
  const others = home.regions.filter((r) => !main.includes(r));
  const isOther = others.some((r) => r.id === home.region);

  document.getElementById('region-chips').innerHTML = `
    <button class="chip ${home.region === 'all' ? 'active' : ''}" data-region="all">${t('filter.allRegions')}</button>
    ${main.map((r) => `
      <button class="chip ${home.region === r.id ? 'active' : ''}" data-region="${r.id}">${esc(localName(r))}</button>
    `).join('')}
    <select class="chip chip-select ${isOther ? 'active' : ''}" aria-label="${t('filter.more')}">
      <option value="">${t('filter.more')}</option>
      ${others.map((r) => `<option value="${r.id}" ${home.region === r.id ? 'selected' : ''}>${esc(localName(r))}</option>`).join('')}
    </select>`;
}

// A business that is already signed in and verified should go straight to
// the form, not back to the sign-up page.
function pointBusinessCta() {
  const cta = document.getElementById('business-cta');
  if (!cta || typeof auth === 'undefined' || !auth.profile) return;
  if (auth.profile.platform_role === 'BUSINESS' && isVerifiedSeller()) {
    cta.href = 'request-form.html';
  }
}

function setupFilters() {
  const chips = document.getElementById('region-chips');
  chips.addEventListener('click', (e) => {
    const button = e.target.closest('[data-region]');
    if (!button) return;
    home.region = button.dataset.region;
    renderRegionChips();
    loadProducts();
  });
  chips.addEventListener('change', (e) => {
    if (!e.target.value) return;
    home.region = e.target.value;
    renderRegionChips();
    loadProducts();
  });

  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').trim();
    location.href = 'products.html' + (q ? '?q=' + encodeURIComponent(q) : '');
  });
}

function productQuery() {
  let query = db.from('product_cards').select('*').eq('status', 'PUBLISHED');
  if (home.region !== 'all') query = query.eq('region_id', home.region);
  return query;
}

function filteredSample() {
  const name = regionById(home.region)?.name_en;
  return SAMPLE_PRODUCTS.filter((p) => home.region === 'all' || p.region_name === name);
}

async function loadProducts() {
  const featuredGrid = document.getElementById('featured-grid');
  const trendingGrid = document.getElementById('trending-grid');
  featuredGrid.innerHTML = skeletonCards(5);
  trendingGrid.innerHTML = skeletonCards(5);

  if (home.useSample) {
    const list = filteredSample();
    home.featured = [...list].sort((a, b) => b.is_boosted - a.is_boosted).slice(0, 5);
    home.trending = [...list].sort((a, b) => b.average_rating - a.average_rating).slice(0, 5);
    renderProducts();
    return;
  }

  const [featured, trending] = await Promise.all([
    productQuery().order('is_boosted', { ascending: false }).order('published_at', { ascending: false }).limit(5),
    productQuery().order('average_rating', { ascending: false }).order('review_count', { ascending: false }).limit(5),
  ]);

  if (featured.error || trending.error) {
    featuredGrid.innerHTML = emptyMessage('error.load');
    trendingGrid.innerHTML = '';
    return;
  }

  // Show sample listings only when the whole site has no products yet.
  const noFilters = home.region === 'all';
  if (noFilters && featured.data.length === 0 && typeof SAMPLE_PRODUCTS !== 'undefined') {
    home.useSample = true;
    document.getElementById('sample-note').hidden = false;
    return loadProducts();
  }

  home.featured = featured.data;
  home.trending = trending.data;
  renderProducts();
}

function renderProducts() {
  const fill = (id, list) => {
    const grid = document.getElementById(id);
    grid.innerHTML = list.length ? list.map(productCard).join('') : emptyMessage('empty.products');
    watchReveal(grid);
  };
  fill('featured-grid', home.featured);
  fill('trending-grid', home.trending);
}

async function loadRequests() {
  const grid = document.getElementById('request-grid');
  grid.innerHTML = skeletonCards(4, 'request');
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await db
    .from('sourcing_requests')
    .select('id, title, quantity_min, quantity_max, quantity_unit, deadline, urgency, preferred_region_ids, image_paths, business:profiles(id, display_name, business_name, avatar_path, verification_status, region_id)')
    .eq('status', 'OPEN')
    .or(`deadline.is.null,deadline.gte.${today}`)
    .order('urgency', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(4);

  if (error) {
    grid.innerHTML = emptyMessage('error.load');
    return;
  }

  if (data.length === 0 && typeof SAMPLE_REQUESTS !== 'undefined') {
    home.requests = SAMPLE_REQUESTS;
  } else {
    home.requests = data;
    const ids = [...new Set(data.map((r) => r.business?.id).filter(Boolean))];
    if (ids.length) {
      const ratings = await db.from('seller_rating_summary').select('seller_id, average_rating').in('seller_id', ids);
      (ratings.data || []).forEach((r) => { home.sellerRatings[r.seller_id] = r.average_rating; });
    }
  }
  renderRequests();
}

function renderRequests() {
  const grid = document.getElementById('request-grid');
  grid.innerHTML = home.requests.length
    ? home.requests.map((r) => requestCard(r, regionName, r.rating ?? home.sellerRatings[r.business?.id])).join('')
    : emptyMessage('empty.requests');
  watchReveal(grid);
}

async function loadProducers() {
  const { data } = await db
    .from('profiles')
    .select('id, display_name, business_name, farm_story, cover_path, region_id, established_year, seller_photos(storage_path, display_order)')
    .eq('platform_role', 'PRODUCER')
    .eq('verification_status', 'VERIFIED')
    .not('farm_story', 'is', null)
    .limit(5);

  if (!data || data.length === 0) {
    home.producers = typeof SAMPLE_PRODUCERS !== 'undefined' ? SAMPLE_PRODUCERS : [];
  } else {
    const ids = data.map((p) => p.id);
    const [ratings, products] = await Promise.all([
      db.from('seller_rating_summary').select('seller_id, average_rating').in('seller_id', ids),
      db.from('product_cards').select('seller_id').eq('status', 'PUBLISHED').in('seller_id', ids),
    ]);
    home.producers = data.map((p) => ({
      ...p,
      rating: (ratings.data || []).find((r) => r.seller_id === p.id)?.average_rating,
      product_count: (products.data || []).filter((x) => x.seller_id === p.id).length,
    }));
  }
  renderSpotlight();
}

// The farm photo tells the story better than the profile banner,
// so use the first one and fall back to the cover.
function spotlightPhoto(p) {
  const photos = (p.seller_photos || []).slice()
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  return (photos[0] && photos[0].storage_path) || p.cover_path;
}

function renderSpotlight() {
  const box = document.getElementById('spotlight');
  const p = home.producers[home.spotIndex];
  if (!p) {
    box.closest('.spotlight').hidden = true;
    return;
  }
  const region = p.region_name || regionName(p.region_id);
  const many = home.producers.length > 1;

  box.innerHTML = `
    <div class="spotlight-text reveal">
      <span class="eyebrow">${t('spot.label')}</span>
      <h2>${esc(p.business_name || p.display_name)}</h2>
      <p class="spotlight-story">${esc(p.farm_story)}</p>
      <ul class="spotlight-stats">
        <li><strong>${icon('pin')}${esc(region)}</strong></li>
        ${p.product_count != null ? `<li><strong>${p.product_count}</strong> ${t(p.product_count === 1 ? 'spot.product' : 'spot.products')}</li>` : ''}
        ${p.rating ? `<li><strong>${Number(p.rating).toFixed(1)}</strong> ${t('spot.rating')}</li>` : ''}
        ${p.established_year ? `<li>${t('spot.since')} <strong>${p.established_year}</strong></li>` : ''}
      </ul>
      <div class="spotlight-actions">
        <a href="producer.html?id=${esc(p.id)}" class="btn btn-gold">${t('spot.visit')}</a>
        ${many ? `
          <div class="spotlight-nav">
            <button class="round-btn" data-step="-1" aria-label="Previous">${icon('left')}</button>
            <span>${home.spotIndex + 1} / ${home.producers.length}</span>
            <button class="round-btn" data-step="1" aria-label="Next">${icon('right')}</button>
          </div>` : ''}
      </div>
    </div>
    <div class="spotlight-image reveal">
      <img src="${esc(imageUrl(spotlightPhoto(p)))}" alt="${esc(p.business_name || '')}" onerror="${FALLBACK_IMAGE}">
      ${verifiedBadge()}
    </div>`;

  box.querySelectorAll('[data-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const n = home.producers.length;
      home.spotIndex = (home.spotIndex + Number(button.dataset.step) + n) % n;
      renderSpotlight();
    });
  });
  watchReveal(box);
}

async function loadRegionCounts() {
  home.regionCounts = {};
  if (home.useSample) {
    SAMPLE_PRODUCTS.forEach((p) => {
      const r = home.regions.find((x) => x.name_en === p.region_name);
      if (r) home.regionCounts[r.id] = (home.regionCounts[r.id] || 0) + 1;
    });
  } else {
    const { data } = await db.from('product_cards').select('region_id').eq('status', 'PUBLISHED');
    (data || []).forEach((p) => { home.regionCounts[p.region_id] = (home.regionCounts[p.region_id] || 0) + 1; });
  }
  renderProvinces();
}

function renderProvinces() {
  const sorted = [...home.regions].sort((a, b) =>
    (home.regionCounts[b.id] || 0) - (home.regionCounts[a.id] || 0) || a.name_en.localeCompare(b.name_en));
  const grid = document.getElementById('province-grid');
  grid.innerHTML = sorted.map((r) => {
    const count = home.regionCounts[r.id] || 0;
    return `
      <a class="province-tile reveal ${count ? 'has-products' : ''}" href="products.html?region=${r.id}">
        <span>${esc(localName(r))}</span>
        <small>${count} ${t(count === 1 ? 'spot.product' : 'spot.products')}</small>
      </a>`;
  }).join('');
  watchReveal(grid);
}

function setupCarousel() {
  const track = document.querySelector('.story-track');
  const step = () => track.querySelector('.story-card').offsetWidth + 8;
  const move = (dir) => {
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    if (dir > 0 && atEnd) track.scrollTo({ left: 0, behavior: 'smooth' });
    else track.scrollBy({ left: dir * step(), behavior: 'smooth' });
  };
  document.querySelector('.carousel-arrow.prev').addEventListener('click', () => move(-1));
  document.querySelector('.carousel-arrow.next').addEventListener('click', () => move(1));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;
  let timer = setInterval(() => move(1), 5000);
  const carousel = document.querySelector('.story-carousel');
  carousel.addEventListener('mouseenter', () => clearInterval(timer));
  carousel.addEventListener('mouseleave', () => { timer = setInterval(() => move(1), 5000); });
}

function rerenderForLanguage() {
  renderStoryRegions();
  renderCategories();
  renderRegionChips();
  renderProducts();
  renderRequests();
  renderSpotlight();
  renderProvinces();
  // Show re-drawn cards straight away instead of fading them in again.
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
}

async function initHome() {
  addStaticIcons();
  renderStoryRegions();
  setupCarousel();
  setupFilters();
  document.getElementById('category-row').addEventListener('scroll', updateCategoryFade, { passive: true });
  enableWheelScroll(document.getElementById('category-row'));
  enableWheelScroll(document.getElementById('region-chips'));
  window.addEventListener('resize', updateCategoryFade);
  watchReveal();
  pointBusinessCta();

  try {
    await loadReferenceData();
  } catch {
    document.getElementById('featured-grid').innerHTML = emptyMessage('error.load');
    return;
  }

  renderStoryRegions();
  renderCategories();
  renderRegionChips();
  await loadProducts();
  loadRequests();
  loadProducers();
  loadRegionCounts();
  window.addEventListener('langchange', rerenderForLanguage);
  // Prices are already loaded, so only the cards need redrawing.
  window.addEventListener('currencychange', () => {
    renderProducts();
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  });
}

initHome();
