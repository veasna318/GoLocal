// Browse page: filters on the left, results on the right.
// Filters are kept in the address bar so a search can be shared or bookmarked.

const PAGE_SIZE = 12;

// The province chips show these first; the rest sit in the More dropdown.
const MAIN_REGIONS = ['Phnom Penh', 'Kandal', 'Takeo', 'Kampong Speu', 'Battambang', 'Pursat', 'Siem Reap'];

let categories = [];
let regions = [];
let picked = { category: '', region: '' };
let shown = 0;
let total = 0;

// Reads the current filters straight from the form controls.
function readFilters() {
  const checked = (selector) =>
    Array.from(document.querySelectorAll(selector)).filter((box) => box.checked).map((box) => box.value);

  return {
    q: document.getElementById('search-box').value.trim(),
    category: picked.category,
    region: picked.region,
    stock: checked('#stock-list input'),
    certified: document.getElementById('certified-only').checked,
    priceMin: document.getElementById('price-min').value,
    priceMax: document.getElementById('price-max').value,
    rating: document.getElementById('rating-select').value,
    sort: document.getElementById('sort').value,
  };
}

// Puts the filters in the address bar without reloading the page.
function saveFiltersToUrl(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.region) params.set('region', filters.region);
  if (filters.stock.length) params.set('stock', filters.stock.join(','));
  if (filters.certified) params.set('certified', '1');
  if (filters.priceMin) params.set('min', filters.priceMin);
  if (filters.priceMax) params.set('max', filters.priceMax);

  if (filters.rating) params.set('rating', filters.rating);
  if (filters.sort !== 'recommended') params.set('sort', filters.sort);

  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

// Fills the controls from the address bar when the page opens.
function loadFiltersFromUrl() {
  const params = new URLSearchParams(location.search);
  const setChecks = (selector, values) => {
    document.querySelectorAll(selector).forEach((box) => { box.checked = values.includes(box.value); });
  };

  document.getElementById('search-box').value = params.get('q') || '';
  setChecks('#stock-list input', (params.get('stock') || '').split(','));
  picked.category = params.get('category') || '';
  picked.region = params.get('region') || '';
  document.getElementById('certified-only').checked = params.get('certified') === '1';
  document.getElementById('price-min').value = params.get('min') || '';
  document.getElementById('price-max').value = params.get('max') || '';
  document.getElementById('rating-select').value = params.get('rating') || '';
  document.getElementById('sort').value = params.get('sort') || 'recommended';
}

// Builds the database query from the filters.
function buildQuery(filters) {
  let query = db
    .from('product_cards')
    .select('*', { count: 'exact' })
    .eq('status', 'PUBLISHED');

  if (filters.q) {
    const term = filters.q.replace(/[%,()]/g, ' ');
    query = query.or(`name.ilike.%${term}%,name_km.ilike.%${term}%,seller_name.ilike.%${term}%`);
  }
  if (filters.category) query = query.eq('category_slug', filters.category);
  if (filters.region) query = query.eq('region_id', filters.region);
  if (filters.stock.length) query = query.in('stock_status', filters.stock);
  if (filters.certified) query = query.not('certification', 'is', null);
  if (filters.rating) query = query.gte('average_rating', Number(filters.rating));

  // Both currencies are stored, so filter on the one the visitor chose.
  if (filters.priceMin) query = query.gte(priceColumn('min'), Number(filters.priceMin));
  if (filters.priceMax) query = query.lte(priceColumn('min'), Number(filters.priceMax));

  const sorts = {
    recommended: [['is_boosted', false], ['average_rating', false], ['published_at', false]],
    newest: [['published_at', false]],
    priceLow: [[priceColumn('min'), true]],
    priceHigh: [[priceColumn('min'), false]],
    rating: [['average_rating', false], ['review_count', false]],
  };
  (sorts[filters.sort] || sorts.recommended).forEach(([column, ascending]) => {
    query = query.order(column, { ascending, nullsFirst: false });
  });

  return query;
}

// Small removable chips showing what is filtering the list right now.
function renderActiveChips(filters) {
  const chips = [];
  const add = (label, clear) => chips.push({ label, clear });

  if (filters.q) add(`"${filters.q}"`, () => { document.getElementById('search-box').value = ''; });
  if (filters.category) {
    const found = categories.find((c) => c.slug === filters.category);
    if (found) add(localName(found), () => { picked.category = ''; });
  }
  if (filters.region) {
    const found = regions.find((r) => r.id === filters.region);
    if (found) add(localName(found), () => { picked.region = ''; });
  }
  if (filters.certified) {
    add(t('browse.certifiedOnly'), () => { document.getElementById('certified-only').checked = false; });
  }
  if (filters.rating) {
    add(`${filters.rating}+`, () => { document.getElementById('rating-select').value = ''; });
  }
  if (filters.priceMin || filters.priceMax) {
    add(`${filters.priceMin || 0} - ${filters.priceMax || '...'} ${getCurrency()}`, () => {
      document.getElementById('price-min').value = '';
      document.getElementById('price-max').value = '';
    });
  }

  const box = document.getElementById('active-chips');
  box.innerHTML = chips.map((chip, index) =>
    `<button type="button" class="active-chip" data-chip="${index}">${esc(chip.label)}<span>&times;</span></button>`).join('');

  box.querySelectorAll('.active-chip').forEach((button) => {
    button.addEventListener('click', () => {
      chips[Number(button.dataset.chip)].clear();
      renderCategoryRow();
      renderRegionChips();
      search();
    });
  });
}

async function search(append = false) {
  const grid = document.getElementById('product-grid');
  const filters = readFilters();
  saveFiltersToUrl(filters);
  renderActiveChips(filters);

  if (!append) {
    shown = 0;
    grid.innerHTML = skeletonCards(8);
  }

  const { data, count, error } = await buildQuery(filters).range(shown, shown + PAGE_SIZE - 1);

  if (error) {
    grid.innerHTML = emptyMessage('error.load');
    document.getElementById('load-more').hidden = true;
    return;
  }

  total = count || 0;
  const rows = data || [];
  const cards = rows.map(productCard).join('');
  if (append) grid.insertAdjacentHTML('beforeend', cards);
  else grid.innerHTML = cards || emptyMessage('empty.products');

  shown += rows.length;
  document.getElementById('result-count').textContent = `${formatNumber(total)} ${t('browse.products')}`;
  document.getElementById('load-more').hidden = shown >= total;
  watchReveal(grid);
}

// Waits until the visitor stops typing before searching.
let typingTimer = null;
function searchSoon() {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => search(), 350);
}

async function fillFilterLists() {
  const [categoryRows, regionRows] = await Promise.all([
    db.from('categories').select('id, slug, name_en, name_km, icon_path').eq('is_active', true).order('display_order'),
    db.from('regions').select('id, name_en, name_km').eq('is_active', true).order('name_en'),
  ]);

  categories = categoryRows.data || [];
  regions = regionRows.data || [];
  renderCategoryRow();
  renderRegionChips();
}

// The same picture strip as the home page, with the chosen one outlined.
function renderCategoryRow() {
  const row = document.getElementById('category-row');
  row.innerHTML = categories.map((item) => `
    <button type="button" class="category-card ${item.slug === picked.category ? 'selected' : ''}"
            data-slug="${esc(item.slug)}" aria-pressed="${item.slug === picked.category}">
      <img src="${esc(item.icon_path ? imageUrl(item.icon_path) : `assets/images/categories/${item.slug}.png`)}"
           alt="" loading="lazy" onerror="${FALLBACK_IMAGE}">
      <span>${esc(localName(item))}</span>
    </button>`).join('');

  row.querySelectorAll('.category-card').forEach((card) => {
    card.addEventListener('click', () => {
      // Clicking the chosen category again clears it.
      picked.category = picked.category === card.dataset.slug ? '' : card.dataset.slug;
      renderCategoryRow();
      search();
    });
  });
  updateCategoryFade();
}

// A short fade only on the side that still has cards to scroll to.
function updateCategoryFade() {
  const row = document.getElementById('category-row');
  const more = row.scrollWidth - row.clientWidth;
  row.classList.toggle('fade-left', row.scrollLeft > 8);
  row.classList.toggle('fade-right', row.scrollLeft < more - 8);
}

function renderRegionChips() {
  const main = MAIN_REGIONS.map((name) => regions.find((r) => r.name_en === name)).filter(Boolean);
  const others = regions.filter((r) => !main.includes(r));
  const isOther = others.some((r) => r.id === picked.region);

  document.getElementById('region-chips').innerHTML = `
    <button type="button" class="chip ${picked.region === '' ? 'active' : ''}" data-region="">${t('filter.allRegions')}</button>
    ${main.map((r) => `
      <button type="button" class="chip ${picked.region === r.id ? 'active' : ''}" data-region="${esc(r.id)}">${esc(localName(r))}</button>
    `).join('')}
    <select class="chip chip-select ${isOther ? 'active' : ''}" aria-label="${t('filter.more')}">
      <option value="">${t('filter.more')}</option>
      ${others.map((r) => `<option value="${esc(r.id)}" ${picked.region === r.id ? 'selected' : ''}>${esc(localName(r))}</option>`).join('')}
    </select>`;

  const bar = document.getElementById('region-chips');
  bar.querySelectorAll('.chip[data-region]').forEach((chip) => {
    chip.addEventListener('click', () => {
      picked.region = chip.dataset.region;
      renderRegionChips();
      search();
    });
  });
  bar.querySelector('.chip-select').addEventListener('change', (event) => {
    picked.region = event.target.value;
    renderRegionChips();
    search();
  });
}

function clearFilters() {
  document.querySelectorAll('.filters input[type="checkbox"]').forEach((box) => { box.checked = false; });
  document.getElementById('search-box').value = '';
  picked = { category: '', region: '' };
  renderCategoryRow();
  renderRegionChips();
  document.getElementById('price-min').value = '';
  document.getElementById('price-max').value = '';
  document.getElementById('rating-select').value = '';
  search();
}

function listenToFilters() {
  document.getElementById('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    search();
  });
  document.getElementById('search-box').addEventListener('input', searchSoon);
  document.getElementById('price-min').addEventListener('input', searchSoon);
  document.getElementById('price-max').addEventListener('input', searchSoon);

  document.getElementById('stock-list').addEventListener('change', () => search());
  ['certified-only', 'rating-select', 'sort']
    .forEach((id) => document.getElementById(id).addEventListener('change', () => search()));
  document.getElementById('category-row').addEventListener('scroll', updateCategoryFade, { passive: true });
  window.addEventListener('resize', updateCategoryFade);
  enableWheelScroll(document.getElementById('category-row'));
  enableWheelScroll(document.getElementById('region-chips'));

  document.getElementById('clear-filters').addEventListener('click', clearFilters);
  document.getElementById('load-more').addEventListener('click', () => search(true));
  document.getElementById('filter-toggle').addEventListener('click', () => {
    document.getElementById('filters').classList.toggle('open');
  });
}

async function initBrowse() {
  loadFiltersFromUrl();
  await fillFilterLists();
  listenToFilters();
  applyTranslations();
  await search();
}

initBrowse();

// Switching currency changes which column we filter and sort on.
window.addEventListener('currencychange', () => search());

window.addEventListener('langchange', async () => {
  renderCategoryRow();
  renderRegionChips();
  await search();
});
