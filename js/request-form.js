// Post or edit a sourcing request. Only verified business accounts can
// save one; the database enforces that as well as this page.

const MAX_PHOTOS = 5;
const requestId = new URLSearchParams(location.search).get('id');

const form = document.getElementById('request-form');
const errorBox = document.getElementById('form-error');

let regions = [];
let chosenRegions = [];     // province ids the business will accept
let savedPhotos = [];       // storage paths already on the request
let newPhotos = [];         // files just picked

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function fillDropdowns() {
  const [categories, regionRows] = await Promise.all([
    db.from('categories').select('id, name_en, name_km').eq('is_active', true).order('display_order'),
    db.from('regions').select('id, name_en, name_km').eq('is_active', true).order('name_en'),
  ]);

  form.category_id.innerHTML = `<option value="">${t('rform.anyCategory')}</option>`
    + (categories.data || []).map((r) => `<option value="${r.id}">${esc(localName(r))}</option>`).join('');

  regions = regionRows.data || [];
  renderProvinces();
}

// An empty selection means the business will take suppliers anywhere.
function renderProvinces() {
  document.getElementById('province-grid').innerHTML = regions.map((r) => `
    <label class="check-row">
      <input type="checkbox" value="${r.id}" ${chosenRegions.includes(r.id) ? 'checked' : ''}>
      <span>${esc(localName(r))}</span>
    </label>`).join('');
}

function readProvinces() {
  return Array.from(document.querySelectorAll('#province-grid input:checked')).map((box) => box.value);
}

function renderPhotos() {
  const grid = document.getElementById('photo-grid');
  const all = [
    ...savedPhotos.map((path) => ({ url: imageUrl(path) })),
    ...newPhotos.map((p) => ({ url: p.url })),
  ];

  grid.innerHTML = all.map((photo, index) => `
    <div class="photo-item">
      <img src="${esc(photo.url)}" alt="" onerror="${FALLBACK_IMAGE}">
      <button type="button" data-index="${index}" aria-label="${t('acct.remove')}">&times;</button>
    </div>`).join('')
    + (all.length < MAX_PHOTOS
      ? `<div class="photo-add" id="photo-add">+<br>${t('form.addPhoto')}</div>`
      : '');

  const addBox = document.getElementById('photo-add');
  if (addBox) addBox.addEventListener('click', () => document.getElementById('photo-input').click());

  grid.querySelectorAll('.photo-item button').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      if (index < savedPhotos.length) savedPhotos.splice(index, 1);
      else newPhotos.splice(index - savedPhotos.length, 1);
      renderPhotos();
    });
  });
}

document.getElementById('photo-input').addEventListener('change', (event) => {
  const room = MAX_PHOTOS - (savedPhotos.length + newPhotos.length);
  Array.from(event.target.files).slice(0, room).forEach((file) => {
    newPhotos.push({ file, url: URL.createObjectURL(file) });
  });
  event.target.value = '';
  renderPhotos();
});

// Phone photos are often too big, so make a smaller JPEG first.
async function shrinkImage(file, maxSide = 1600) {
  try {
    const picture = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(picture.width, picture.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(picture.width * scale);
    canvas.height = Math.round(picture.height * scale);
    canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height);
    const smaller = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
    return smaller && smaller.size < file.size ? smaller : file;
  } catch {
    return file;
  }
}

async function uploadPhotos() {
  const paths = [];
  for (let i = 0; i < newPhotos.length; i++) {
    const picture = await shrinkImage(newPhotos[i].file);
    const ending = picture.type === 'image/png' ? 'png' : 'jpg';
    const path = `${auth.user.id}/requests/${Date.now()}-${i}.${ending}`;
    const { error } = await db.storage
      .from('public-images')
      .upload(path, picture, { contentType: picture.type, upsert: false });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

async function loadRequest() {
  const { data, error } = await db
    .from('sourcing_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (error || !data) {
    showError(t('error.load'));
    return;
  }

  document.getElementById('page-title').textContent = t('rform.editTitle');
  document.getElementById('close-button').hidden = false;

  ['title', 'category_id', 'description', 'quantity_min', 'quantity_max',
   'quantity_unit', 'budget_min', 'budget_max', 'currency', 'packaging',
   'certification_required', 'quality_requirements', 'contract_type',
   'urgency', 'deadline'].forEach((field) => {
    if (form[field] && data[field] != null) form[field].value = data[field];
  });

  chosenRegions = data.preferred_region_ids || [];
  savedPhotos = data.image_paths || [];
  renderProvinces();
  renderPhotos();
}

function collectFields(status) {
  const number = (value) => (value === '' || value == null ? null : Number(value));
  const text = (value) => (value.trim() === '' ? null : value.trim());

  return {
    business_id: auth.user.id,
    title: form.title.value.trim(),
    category_id: form.category_id.value || null,
    description: form.description.value.trim(),
    quantity_min: number(form.quantity_min.value),
    quantity_max: number(form.quantity_max.value),
    quantity_unit: form.quantity_unit.value.trim() || 'kg',
    budget_min: number(form.budget_min.value),
    budget_max: number(form.budget_max.value),
    currency: form.currency.value,
    packaging: text(form.packaging.value),
    certification_required: text(form.certification_required.value),
    quality_requirements: text(form.quality_requirements.value),
    contract_type: form.contract_type.value,
    urgency: form.urgency.value,
    preferred_region_ids: readProvinces(),
    deadline: form.deadline.value || null,
    status,
  };
}

// The table has checks the browser cannot catch, so say it plainly here.
function localProblem(fields) {
  const { quantity_min: low, quantity_max: high } = fields;
  if (low != null && high != null && high < low) return t('rform.qtyOrder');
  if (fields.budget_min != null && fields.budget_max != null
      && fields.budget_max < fields.budget_min) return t('rform.budgetOrder');
  if (fields.deadline && fields.deadline < new Date().toISOString().slice(0, 10)) {
    return t('rform.deadlinePast');
  }
  return '';
}

async function saveRequest(status) {
  errorBox.hidden = true;

  const fields = collectFields(status);
  const problem = localProblem(fields);
  if (problem) throw new Error(problem);

  fields.image_paths = savedPhotos.concat(await uploadPhotos());

  if (requestId) {
    const { error } = await db.from('sourcing_requests').update(fields).eq('id', requestId);
    if (error) throw error;
  } else {
    const { error } = await db.from('sourcing_requests').insert(fields);
    if (error) throw error;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = (event.submitter && event.submitter.value) || 'OPEN';
  const buttons = form.querySelectorAll('button[type="submit"]');
  buttons.forEach((b) => { b.disabled = true; });
  event.submitter.textContent = t('form.saving');

  try {
    await saveRequest(status);
    location.href = 'dashboard.html';
  } catch (error) {
    showError((error && error.message) ? error.message : t('form.required'));
    buttons.forEach((b) => { b.disabled = false; });
    applyTranslations(form);
  }
});

async function initRequestForm() {
  if (!(await requireAccount('seller'))) return;

  // Only a verified business can post. Producers land here by accident.
  const isBusiness = auth.profile.platform_role === 'BUSINESS';
  if (!isAdmin() && (!isBusiness || !isVerifiedSeller())) {
    location.href = 'dashboard.html';
    return;
  }

  await fillDropdowns();
  if (requestId) await loadRequest();
  renderPhotos();
  applyTranslations();
}

initRequestForm();

// Category and province names come from the database, so rebuild those
// lists when the language changes. The chosen values are kept.
window.addEventListener('langchange', async () => {
  const picked = form.category_id.value;
  chosenRegions = readProvinces();
  await fillDropdowns();
  if (picked) form.category_id.value = picked;
  applyTranslations();
});
