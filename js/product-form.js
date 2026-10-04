// Add or edit a product, upload photos, and write descriptions with AI.

const MAX_PHOTOS = 8;
const productId = new URLSearchParams(location.search).get('id');

const form = document.getElementById('product-form');
const errorBox = document.getElementById('form-error');
const successBox = document.getElementById('form-success');

// Photos already saved, plus new ones the seller just picked.
let savedPhotos = [];
let newPhotos = [];

async function fillDropdowns() {
  const [categories, regions] = await Promise.all([
    db.from('categories').select('id, name_en, name_km').eq('is_active', true).order('display_order'),
    db.from('regions').select('id, name_en, name_km').eq('is_active', true).order('name_en'),
  ]);
  const options = (rows) => (rows || []).map((r) => `<option value="${r.id}">${esc(localName(r))}</option>`).join('');
  form.category_id.innerHTML = options(categories.data);
  form.region_id.innerHTML = options(regions.data);
}

async function loadProduct() {
  const { data, error } = await db
    .from('products')
    .select('*, product_images(id, storage_path, is_cover, display_order)')
    .eq('id', productId)
    .single();

  if (error || !data) {
    errorBox.textContent = t('error.load');
    errorBox.hidden = false;
    return;
  }

  document.getElementById('page-title').textContent = t('form.editProduct');
  ['name', 'name_km', 'category_id', 'region_id', 'description',
   'price_usd_min', 'price_usd_max', 'price_khr_min', 'price_khr_max',
   'currency', 'unit', 'min_order_qty', 'packaging', 'certification',
   'production_period', 'stock_status'].forEach((field) => {
    if (form[field] && data[field] != null) form[field].value = data[field];
  });
  updateFillButtons();

  savedPhotos = (data.product_images || [])
    .slice()
    .sort((a, b) => (b.is_cover - a.is_cover) || (a.display_order - b.display_order));
  renderPhotos();
}

function renderPhotos() {
  const grid = document.getElementById('photo-grid');
  const all = [
    ...savedPhotos.map((p) => ({ url: imageUrl(p.storage_path), saved: p })),
    ...newPhotos.map((p) => ({ url: p.url, file: p.file })),
  ];

  grid.innerHTML = all.map((photo, index) => `
    <div class="photo-item">
      <img src="${esc(photo.url)}" alt="">
      ${index === 0 ? `<span class="cover-tag">${t('form.cover')}</span>` : ''}
      <button type="button" data-index="${index}" aria-label="Remove">&times;</button>
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

// Calls the Edge Function and reads the real error text when it fails.
async function callAi(body) {
  const { data, error } = await db.functions.invoke('write-description', { body });
  if (!error) return data;

  let detail = '';
  try {
    const sent = await error.context.json();
    detail = sent.error || '';
  } catch {
    detail = error.message || '';
  }
  throw new Error(detail || 'AI request failed');
}

// Asks the Edge Function to write the description.
async function writeWithAi() {
  const keywordsBox = document.getElementById('ai-keywords');
  const button = document.getElementById('ai-button');
  const message = document.getElementById('ai-message');
  const keywords = keywordsBox.value.trim();

  if (keywords.length < 3) {
    message.textContent = t('ai.needKeywords');
    return;
  }

  button.disabled = true;
  button.textContent = t('ai.writing');
  message.textContent = '';

  try {
    const category = form.category_id.selectedOptions[0];
    const region = form.region_id.selectedOptions[0];
    const data = await callAi({
      keywords,
      productName: form.name.value.trim(),
      category: category ? category.textContent : '',
      province: region ? region.textContent : '',
      unit: form.unit.value.trim(),
    });
    if (!data || !data.text) throw new Error('AI sent no text');

    form.description.value = data.text;
    if (!form.name.value.trim() && data.name) form.name.value = data.name;
    if (!form.name_km.value.trim() && data.nameKhmer) form.name_km.value = data.nameKhmer;
    updateFillButtons();
    message.textContent = t('ai.done');
  } catch (error) {
    message.textContent = `${t('ai.error')} (${error.message})`;
  }

  button.disabled = false;
  button.textContent = t('ai.write');
}

// The Auto fill button only shows when this name box is empty
// and the other language box already has something in it.
function updateFillButtons() {
  document.querySelectorAll('.fill-btn').forEach((button) => {
    const own = form[button.dataset.fill].value.trim();
    const other = form[button.dataset.source].value.trim();
    button.hidden = own.length > 0 || other.length < 2;
  });
}

// Fills the empty name box by translating the other one.
async function autoFillName(button) {
  const targetBox = form[button.dataset.fill];
  const message = document.getElementById('ai-message');
  const text = form[button.dataset.source].value.trim();

  button.disabled = true;
  button.textContent = t('ai.filling');
  message.textContent = '';

  try {
    const data = await callAi({ mode: 'translate', text, target: button.dataset.target });
    if (!data || !data.text) throw new Error('AI sent no text');
    targetBox.value = data.text;
  } catch (error) {
    message.textContent = `${t('ai.translateError')} (${error.message})`;
  }

  button.disabled = false;
  button.textContent = t('form.autoFill');
  updateFillButtons();
}

// Phone photos are often too big for the 5 MB limit, so make a smaller JPEG first.
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

// Uploads the newly picked photos and saves their paths.
// Typing a price in one currency fills the other one in, using the
// National Bank rate. The seller can then round it however they like.
function linkPriceBoxes() {
  const pairs = [
    ['price_usd_min', 'price_khr_min'],
    ['price_usd_max', 'price_khr_max'],
  ];

  pairs.forEach(([usdId, khrId]) => {
    const usdBox = document.getElementById(usdId);
    const khrBox = document.getElementById(khrId);

    usdBox.addEventListener('input', () => {
      if (document.activeElement !== usdBox) return;
      khrBox.value = usdBox.value === '' ? '' : toKhr(usdBox.value);
    });
    khrBox.addEventListener('input', () => {
      if (document.activeElement !== khrBox) return;
      usdBox.value = khrBox.value === '' ? '' : toUsd(khrBox.value);
    });
  });
}

// Uploads the newly picked photos and saves their paths.
async function uploadPhotos(id) {
  const rows = [];
  for (let i = 0; i < newPhotos.length; i++) {
    const picture = await shrinkImage(newPhotos[i].file);
    const ending = picture.type === 'image/png' ? 'png' : 'jpg';
    const path = `${auth.user.id}/products/${id}/${Date.now()}-${i}.${ending}`;
    const { error } = await db.storage
      .from('public-images')
      .upload(path, picture, { contentType: picture.type, upsert: false });
    if (error) throw error;
    rows.push({ product_id: id, storage_path: path, display_order: savedPhotos.length + i });
  }
  return rows;
}

async function saveProduct(status) {
  errorBox.hidden = true;
  successBox.hidden = true;

  const number = (value) => (value === '' || value == null ? null : Number(value));
  const text = (value) => (value.trim() === '' ? null : value.trim());

  const fields = {
    owner_id: auth.user.id,
    name: form.name.value.trim(),
    name_km: text(form.name_km.value),
    category_id: form.category_id.value,
    region_id: form.region_id.value,
    description: form.description.value.trim(),
    price_usd_min: number(form.price_usd_min.value),
    price_usd_max: number(form.price_usd_max.value),
    price_khr_min: number(form.price_khr_min.value),
    price_khr_max: number(form.price_khr_max.value),
    currency: form.currency.value,
    // price_min and price_max keep the seller's own currency.
    price_min: number(form.currency.value === 'KHR' ? form.price_khr_min.value : form.price_usd_min.value),
    price_max: number(form.currency.value === 'KHR' ? form.price_khr_max.value : form.price_usd_max.value),
    unit: form.unit.value.trim() || 'kg',
    min_order_qty: number(form.min_order_qty.value),
    packaging: text(form.packaging.value),
    certification: text(form.certification.value),
    production_period: text(form.production_period.value),
    stock_status: form.stock_status.value,
    status,
  };

  let id = productId;
  if (id) {
    const { error } = await db.from('products').update(fields).eq('id', id);
    if (error) throw error;
    // Remove photos the seller deleted.
    const keptIds = savedPhotos.map((p) => p.id);
    const { data: existing } = await db.from('product_images').select('id, storage_path').eq('product_id', id);
    const removed = (existing || []).filter((p) => !keptIds.includes(p.id));
    if (removed.length) {
      await db.storage.from('public-images').remove(removed.map((p) => p.storage_path));
      await db.from('product_images').delete().in('id', removed.map((p) => p.id));
    }
  } else {
    const { data, error } = await db.from('products').insert(fields).select('id').single();
    if (error) throw error;
    id = data.id;
  }

  const newRows = await uploadPhotos(id);
  if (newRows.length) {
    const { error } = await db.from('product_images').insert(newRows);
    if (error) throw error;
  }

  // Make sure exactly one photo is the cover.
  const { data: images } = await db.from('product_images')
    .select('id').eq('product_id', id).order('display_order').limit(1);
  if (images && images.length) {
    await db.from('product_images').update({ is_cover: false }).eq('product_id', id);
    await db.from('product_images').update({ is_cover: true }).eq('id', images[0].id);
  }

  return id;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = (event.submitter && event.submitter.value) || 'DRAFT';
  const buttons = form.querySelectorAll('button[type="submit"]');
  buttons.forEach((b) => { b.disabled = true; });
  event.submitter.textContent = t('form.saving');

  try {
    await saveProduct(status);
    location.href = 'dashboard.html';
  } catch (error) {
    errorBox.textContent = (error && error.message) ? error.message : t('form.required');
    errorBox.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    buttons.forEach((b) => { b.disabled = false; });
    applyTranslations(form);
  }
});

document.getElementById('ai-button').addEventListener('click', writeWithAi);

document.querySelectorAll('.fill-btn').forEach((button) => {
  button.addEventListener('click', () => autoFillName(button));
});

['name', 'name_km'].forEach((field) => {
  form[field].addEventListener('input', updateFillButtons);
});

async function initProductForm() {
  if (!(await requireAccount('seller'))) return;
  if (!isVerifiedSeller() && !isAdmin()) {
    location.href = 'dashboard.html';
    return;
  }
  await fillDropdowns();
  linkPriceBoxes();
  if (productId) await loadProduct();
  updateFillButtons();
  renderPhotos();
}

initProductForm();

// Category and province names come from the database, so the lists have to
// be rebuilt when the language changes. The chosen values are kept.
window.addEventListener('langchange', async () => {
  const picked = { category_id: form.category_id.value, region_id: form.region_id.value };
  await fillDropdowns();
  Object.entries(picked).forEach(([field, value]) => {
    if (value) form[field].value = value;
  });
  updateFillButtons();
  applyTranslations();
});
