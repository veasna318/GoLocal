// Request board: every open sourcing request, with the full brief shown
// in a modal so the visitor never leaves the board.

const board = {
  regions: [],
  requests: [],
  ratings: {},
  region: 'all',
  search: '',
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
               platform_role, verification_status, region_id, contact_phone,
               contact_telegram, contact_facebook, contact_email)`)
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

  // The whole card opens the request, not just the Details button.
  document.getElementById('request-grid').addEventListener('click', (event) => {
    const card = event.target.closest('.request-card');
    if (!card) return;
    event.preventDefault();
    openRequest(card.dataset.requestId);
  });

  document.getElementById('back-button').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.href = 'index.html';
  });
}

// Hands the chosen request to the shared modal and remembers it in the
// address bar, so a single request can be linked to.
function openRequest(id) {
  const found = board.requests.find((row) => row.id === id);
  if (!found) return;
  openRequestModal(found, board.ratings[found.business?.id]);
  history.replaceState(null, '', `requests.html?id=${encodeURIComponent(id)}`);
}

async function initBoard() {
  addStaticIcons();
  setUpRequestModal();
  reqModal.onClose = () => history.replaceState(null, '', 'requests.html');
  setUpEvents();

  await loadRegions();
  reqModal.regions = board.regions;
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
  redrawRequestModal();
  applyTranslations();
});
