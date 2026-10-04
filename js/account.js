// My Account: edit your profile, pictures and farm photos.
// Role, verification status and the active flag are set by admins only,
// so this page never sends them.

const MAX_FARM_PHOTOS = 8;

const form = document.getElementById('account-form');
const errorBox = document.getElementById('form-error');
const successBox = document.getElementById('form-success');

// Farm photos already saved, plus new ones just picked.
let savedPhotos = [];
let newPhotos = [];

// Single pictures: keep the saved path, a newly picked file, or a removal.
const avatar = { path: null, file: null, url: null };
const cover = { path: null, file: null, url: null };

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

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

// Every uploaded file sits in a folder named after the account id.
async function uploadImage(file, folder) {
  const picture = await shrinkImage(file);
  const ending = picture.type === 'image/png' ? 'png' : 'jpg';
  const path = `${auth.user.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ending}`;
  const { error } = await db.storage
    .from('public-images')
    .upload(path, picture, { contentType: picture.type, upsert: false });
  if (error) throw error;
  return path;
}

async function fillProvinces() {
  const { data } = await db.from('regions')
    .select('id, name_en, name_km').eq('is_active', true).order('name_en');
  form.region_id.innerHTML = `<option value="">${t('acct.noProvince')}</option>`
    + (data || []).map((r) => `<option value="${r.id}">${esc(localName(r))}</option>`).join('');
}

// Single picture frames
function renderSingle(slot, frameId, clearId) {
  const frame = document.getElementById(frameId);
  const clear = document.getElementById(clearId);
  const url = slot.url || (slot.path ? imageUrl(slot.path) : '');

  frame.innerHTML = url ? `<img src="${esc(url)}" alt="">` : `<span class="frame-empty">${t('acct.none')}</span>`;
  clear.hidden = !url;
}

function setUpSingle(slot, name) {
  const input = document.getElementById(`${name}-input`);
  document.getElementById(`${name}-pick`).addEventListener('click', () => input.click());

  input.addEventListener('change', (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    slot.file = file;
    slot.url = URL.createObjectURL(file);
    renderSingle(slot, `${name}-frame`, `${name}-clear`);
  });

  document.getElementById(`${name}-clear`).addEventListener('click', () => {
    slot.file = null;
    slot.url = null;
    slot.path = null;
    renderSingle(slot, `${name}-frame`, `${name}-clear`);
  });
}

// Farm photo grid
function renderPhotos() {
  const grid = document.getElementById('photo-grid');
  const all = [
    ...savedPhotos.map((p) => ({ url: imageUrl(p.storage_path) })),
    ...newPhotos.map((p) => ({ url: p.url })),
  ];

  grid.innerHTML = all.map((photo, index) => `
    <div class="photo-item">
      <img src="${esc(photo.url)}" alt="">
      <button type="button" data-index="${index}" aria-label="${t('acct.remove')}">&times;</button>
    </div>`).join('')
    + (all.length < MAX_FARM_PHOTOS
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
  const room = MAX_FARM_PHOTOS - (savedPhotos.length + newPhotos.length);
  Array.from(event.target.files).slice(0, room).forEach((file) => {
    newPhotos.push({ file, url: URL.createObjectURL(file) });
  });
  event.target.value = '';
  renderPhotos();
});

function fillForm(profile) {
  ['display_name', 'business_name', 'bio', 'farm_story', 'production_capacity',
   'established_year', 'contact_phone', 'contact_telegram', 'contact_facebook',
   'contact_email'].forEach((field) => {
    if (form[field] && profile[field] != null) form[field].value = profile[field];
  });
  if (profile.region_id) form.region_id.value = profile.region_id;

  avatar.path = profile.avatar_path || null;
  cover.path = profile.cover_path || null;
  renderSingle(avatar, 'avatar-frame', 'avatar-clear');
  renderSingle(cover, 'cover-frame', 'cover-clear');
}

// The farm fields only matter to producers and businesses.
function showSellerParts() {
  const seller = isSeller();
  document.getElementById('seller-block').hidden = !seller;

  const note = document.getElementById('verify-note');
  if (seller && auth.profile.verification_status !== 'VERIFIED') {
    note.textContent = t('acct.notVerified');
    note.hidden = false;
  }
}

async function loadFarmPhotos() {
  const { data } = await db.from('seller_photos')
    .select('id, storage_path, display_order')
    .eq('seller_id', auth.user.id)
    .order('display_order');
  savedPhotos = data || [];
  renderPhotos();
}

async function saveFarmPhotos() {
  // Remove the rows the seller deleted, and their files.
  const keptIds = savedPhotos.map((p) => p.id);
  const { data: existing } = await db.from('seller_photos')
    .select('id, storage_path').eq('seller_id', auth.user.id);

  const removed = (existing || []).filter((p) => !keptIds.includes(p.id));
  if (removed.length) {
    await db.storage.from('public-images').remove(removed.map((p) => p.storage_path));
    await db.from('seller_photos').delete().in('id', removed.map((p) => p.id));
  }

  // Upload the new ones.
  const rows = [];
  for (let i = 0; i < newPhotos.length; i++) {
    const path = await uploadImage(newPhotos[i].file, 'farm');
    rows.push({ seller_id: auth.user.id, storage_path: path, display_order: savedPhotos.length + i });
  }
  if (rows.length) {
    const { error } = await db.from('seller_photos').insert(rows);
    if (error) throw error;
  }
}

async function saveProfile() {
  const text = (value) => (value.trim() === '' ? null : value.trim());
  const seller = isSeller();

  const fields = {
    display_name: form.display_name.value.trim(),
    business_name: text(form.business_name.value),
    region_id: form.region_id.value || null,
    bio: text(form.bio.value),
    updated_at: new Date().toISOString(),
  };

  if (seller) {
    fields.farm_story = text(form.farm_story.value);
    fields.production_capacity = text(form.production_capacity.value);
    fields.established_year = form.established_year.value ? Number(form.established_year.value) : null;
    fields.contact_phone = text(form.contact_phone.value);
    fields.contact_telegram = text(form.contact_telegram.value);
    fields.contact_facebook = text(form.contact_facebook.value);
    fields.contact_email = text(form.contact_email.value);
  }

  // Upload a newly picked avatar or cover before saving the row.
  if (avatar.file) fields.avatar_path = await uploadImage(avatar.file, 'avatar');
  else fields.avatar_path = avatar.path;

  if (cover.file) fields.cover_path = await uploadImage(cover.file, 'cover');
  else fields.cover_path = cover.path;

  const { error } = await db.from('profiles').update(fields).eq('id', auth.user.id);
  if (error) throw error;

  if (seller) await saveFarmPhotos();
}

// Back goes to wherever the person came from, usually their own profile.
document.getElementById('back-button').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = auth.user ? `producer.html?id=${auth.user.id}` : 'index.html';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  successBox.hidden = true;

  const button = document.getElementById('save-button');
  button.disabled = true;
  button.textContent = t('form.saving');

  try {
    await saveProfile();
    await loadSession();
    await loadFarmPhotos();
    avatar.file = null;
    avatar.url = null;
    cover.file = null;
    cover.url = null;
    newPhotos = [];
    fillForm(auth.profile);
    successBox.textContent = t('acct.saved');
    successBox.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    showError((error && error.message) ? error.message : t('form.required'));
  }

  button.disabled = false;
  button.textContent = t('acct.save');
});

async function initAccountPage() {
  if (!(await requireAccount())) return;

  await fillProvinces();
  showSellerParts();
  fillForm(auth.profile || {});
  setUpSingle(avatar, 'avatar');
  setUpSingle(cover, 'cover');
  if (isSeller()) await loadFarmPhotos();
  applyTranslations();
}

initAccountPage();

window.addEventListener('langchange', () => {
  fillProvinces().then(() => {
    if (auth.profile && auth.profile.region_id) form.region_id.value = auth.profile.region_id;
  });
  renderPhotos();
  renderSingle(avatar, 'avatar-frame', 'avatar-clear');
  renderSingle(cover, 'cover-frame', 'cover-clear');
});
