// Verification application: the form a producer or business fills in to
// get the Verified badge. Documents go to a private storage bucket that
// only the applicant and administrators can read.

const KINDS = ['NATIONAL_ID', 'FARM_OR_WORKSHOP', 'PRODUCTION_PROCESS', 'BUSINESS_REGISTRATION'];
const REQUIRED_KINDS = ['NATIONAL_ID', 'FARM_OR_WORKSHOP'];
const MAX_PER_KIND = 5;

const form = document.getElementById('apply-form');
const errorBox = document.getElementById('form-error');

let application = null;            // the open application, if there is one
const savedFiles = {};             // kind -> rows already stored
const newFiles = {};               // kind -> files just picked
KINDS.forEach((kind) => { savedFiles[kind] = []; newFiles[kind] = []; });

// A buyer has no dashboard, so anyone without a seller account goes home.
function afterApplyPage() {
  return isSeller() ? 'dashboard.html' : 'index.html';
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

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

// Evidence lives in a private bucket, so it is read back through a signed link.
async function signedUrl(path) {
  const { data } = await db.storage
    .from('verification-evidence')
    .createSignedUrl(path, 3600);
  return data ? data.signedUrl : '';
}

function renderGrid(kind) {
  const grid = document.getElementById('grid-' + kind);
  const all = [
    ...savedFiles[kind].map((row) => ({ url: row.url || '', saved: true })),
    ...newFiles[kind].map((item) => ({ url: item.url })),
  ];

  grid.innerHTML = all.map((item, index) => `
    <div class="photo-item">
      <img src="${esc(item.url)}" alt="" onerror="${FALLBACK_IMAGE}">
      <button type="button" data-kind="${kind}" data-index="${index}"
              aria-label="${t('acct.remove')}">&times;</button>
    </div>`).join('')
    + (all.length < MAX_PER_KIND
      ? `<div class="photo-add" data-add="${kind}">+<br>${t('form.addPhoto')}</div>`
      : '');

  const addBox = grid.querySelector('[data-add]');
  if (addBox) {
    addBox.addEventListener('click', () => document.getElementById('input-' + kind).click());
  }

  grid.querySelectorAll('.photo-item button').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      if (index < savedFiles[kind].length) savedFiles[kind].splice(index, 1);
      else newFiles[kind].splice(index - savedFiles[kind].length, 1);
      renderGrid(kind);
    });
  });
}

document.querySelectorAll('.evidence-input').forEach((input) => {
  input.addEventListener('change', (event) => {
    const kind = input.dataset.kind;
    const room = MAX_PER_KIND - (savedFiles[kind].length + newFiles[kind].length);
    Array.from(event.target.files).slice(0, room).forEach((file) => {
      newFiles[kind].push({ file, url: URL.createObjectURL(file) });
    });
    event.target.value = '';
    renderGrid(kind);
  });
});

async function fillProvinces() {
  const { data } = await db.from('regions')
    .select('id, name_en, name_km').eq('is_active', true).order('name_en');
  form.region_id.innerHTML = `<option value="" disabled selected>${t('acct.noProvince')}</option>`
    + (data || []).map((r) => `<option value="${r.id}">${esc(localName(r))}</option>`).join('');
}

// A seller only ever has one open application, so look for it first.
async function loadApplication() {
  const { data } = await db
    .from('verification_applications')
    .select('*, verification_evidence(id, evidence_type, storage_path)')
    .eq('applicant_id', auth.user.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  application = data || null;
  if (!application) return;

  for (const row of application.verification_evidence || []) {
    if (!savedFiles[row.evidence_type]) continue;
    savedFiles[row.evidence_type].push({
      id: row.id,
      storage_path: row.storage_path,
      url: await signedUrl(row.storage_path),
    });
  }
}

function fillForm() {
  if (!application) return;
  ['legal_name', 'business_or_farm_name', 'phone_number', 'address_summary',
   'about_business'].forEach((field) => {
    if (application[field] != null) form[field].value = application[field];
  });
  if (application.region_id) form.region_id.value = application.region_id;
  const role = form.querySelector(`input[name="requested_role"][value="${application.requested_role}"]`);
  if (role) role.checked = true;
}

// Fills the name boxes from the profile the first time someone applies.
function prefillFromProfile() {
  const profile = auth.profile || {};
  if (!form.legal_name.value) form.legal_name.value = profile.display_name || '';
  if (!form.business_or_farm_name.value) form.business_or_farm_name.value = profile.business_name || '';
  if (!form.phone_number.value) form.phone_number.value = profile.contact_phone || '';
  if (!form.region_id.value && profile.region_id) form.region_id.value = profile.region_id;
}

function showStatus(titleKey, textKey, mark, actions = '', note = '') {
  const card = document.getElementById('status-card');
  document.getElementById('form-wrap').hidden = true;
  card.hidden = false;
  document.getElementById('status-mark').textContent = mark;
  document.getElementById('status-mark').className = 'status-mark mark-' + mark;
  document.getElementById('status-title').textContent = t(titleKey);
  document.getElementById('status-text').textContent = t(textKey);
  document.getElementById('status-actions').innerHTML = actions;

  const noteBox = document.getElementById('admin-note');
  noteBox.hidden = !note;
  noteBox.textContent = note ? `${t('apply.adminNote')} ${note}` : '';
}

function showForm(isFix) {
  document.getElementById('status-card').hidden = true;
  document.getElementById('form-wrap').hidden = false;

  const fixNote = document.getElementById('fix-note');
  fixNote.hidden = !isFix;
  if (isFix) {
    fixNote.textContent = application.admin_note
      ? `${t('apply.pleaseFix')} ${application.admin_note}`
      : t('apply.pleaseFix');
  }
  document.getElementById('submit-button').textContent = t(isFix ? 'apply.resend' : 'apply.send');
}

async function uploadEvidence(applicationId) {
  const rows = [];
  for (const kind of KINDS) {
    for (let i = 0; i < newFiles[kind].length; i++) {
      const picture = await shrinkImage(newFiles[kind][i].file);
      const ending = picture.type === 'image/png' ? 'png' : 'jpg';
      const path = `${auth.user.id}/verification/${Date.now()}-${kind}-${i}.${ending}`;
      const { error } = await db.storage
        .from('verification-evidence')
        .upload(path, picture, { contentType: picture.type, upsert: false });
      if (error) throw error;
      rows.push({ application_id: applicationId, evidence_type: kind, storage_path: path });
    }
  }
  if (rows.length) {
    const { error } = await db.from('verification_evidence').insert(rows);
    if (error) throw error;
  }
}

async function removeDroppedEvidence() {
  if (!application) return;
  const keptIds = KINDS.flatMap((kind) => savedFiles[kind].map((row) => row.id));
  const dropped = (application.verification_evidence || []).filter((row) => !keptIds.includes(row.id));
  if (!dropped.length) return;
  await db.storage.from('verification-evidence').remove(dropped.map((row) => row.storage_path));
  await db.from('verification_evidence').delete().in('id', dropped.map((row) => row.id));
}

function missingRequired() {
  return REQUIRED_KINDS.filter((kind) => !savedFiles[kind].length && !newFiles[kind].length);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  if (missingRequired().length) {
    showError(t('apply.needDocuments'));
    return;
  }

  const button = document.getElementById('submit-button');
  button.disabled = true;
  button.textContent = t('form.saving');

  const fields = {
    applicant_id: auth.user.id,
    requested_role: form.requested_role.value,
    legal_name: form.legal_name.value.trim(),
    business_or_farm_name: form.business_or_farm_name.value.trim(),
    phone_number: form.phone_number.value.trim(),
    region_id: form.region_id.value,
    address_summary: form.address_summary.value.trim(),
    about_business: form.about_business.value.trim(),
    status: 'PENDING',
    updated_at: new Date().toISOString(),
  };

  try {
    let id;
    if (application && ['PENDING', 'NEEDS_MORE_INFO'].includes(application.status)) {
      const { error } = await db.from('verification_applications')
        .update(fields).eq('id', application.id);
      if (error) throw error;
      id = application.id;
      await removeDroppedEvidence();
    } else {
      const { data, error } = await db.from('verification_applications')
        .insert(fields).select('id').single();
      if (error) throw error;
      id = data.id;
    }

    await uploadEvidence(id);
    await loadSession();
    location.href = 'apply.html';
  } catch (error) {
    showError((error && error.message) ? error.message : t('form.required'));
    button.disabled = false;
    button.textContent = t('apply.send');
  }
});

document.getElementById('back-button').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = afterApplyPage();
});

async function initApplyPage() {
  if (!(await requireAccount())) return;

  // Already approved, so there is nothing to fill in.
  if (auth.profile.verification_status === 'VERIFIED') {
    showStatus('apply.verifiedTitle', 'apply.verifiedText', 'ok',
      `<a class="btn btn-gold" href="producer.html?id=${auth.user.id}">${t('acct.viewProfile')}</a>`);
    applyTranslations();
    return;
  }

  await fillProvinces();
  await loadApplication();

  const status = application ? application.status : null;

  if (status === 'PENDING') {
    showStatus('apply.waitingTitle', 'apply.waitingText', 'wait',
      `<a class="btn btn-outline" href="${afterApplyPage()}">${t('detail.back')}</a>`);
  } else if (status === 'REJECTED') {
    showStatus('apply.rejectedTitle', 'apply.rejectedText', 'no', '', application.admin_note || '');
  } else {
    fillForm();
    prefillFromProfile();
    showForm(status === 'NEEDS_MORE_INFO');
  }

  KINDS.forEach(renderGrid);
  applyTranslations();
}

initApplyPage();

// The province names come from the database, so the list has to be
// rebuilt when the language changes. The chosen province is kept.
window.addEventListener('langchange', async () => {
  KINDS.forEach(renderGrid);

  const chosen = form.region_id ? form.region_id.value : '';
  if (form.region_id) {
    await fillProvinces();
    if (chosen) form.region_id.value = chosen;
  }
  applyTranslations();
});
