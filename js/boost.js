// Product promotion. A verified seller picks a product and a length,
// pays the amount with the KHQR code shown on the page, then uploads the
// payment screenshot. An admin checks the screenshot and approves, which
// is what sets boosted_until on the product and lifts it into Featured.

// Prices come from the producer survey, where most sellers picked the
// 3 to 5 dollar band for a week of promotion.
const PLANS = [
  { days: 7, usd: 3 },
  { days: 14, usd: 5 },
  { days: 30, usd: 9 },
];

const PAY_NAME = 'SO SEREY VEASNA';

const wantedProductId = new URLSearchParams(location.search).get('id');

const form = document.getElementById('boost-form');
const errorBox = document.getElementById('form-error');

let myProducts = [];
let myBoosts = [];
let chosenDays = PLANS[0].days;
let proof = null;            // { file, url }

function chosenPlan() {
  return PLANS.find((p) => p.days === chosenDays) || PLANS[0];
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Screenshots from a phone are often large, so make a smaller JPEG first.
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

// Only published products can be promoted, which is also what the
// database policy checks.
async function loadMyProducts() {
  const { data, error } = await db
    .from('products')
    .select('id, name, name_km, boosted_until')
    .eq('owner_id', auth.user.id)
    .eq('status', 'PUBLISHED')
    .order('created_at', { ascending: false });

  if (error) throw error;
  myProducts = data || [];
}

async function loadMyBoosts() {
  const { data } = await db
    .from('product_boosts')
    .select('id, product_id, duration_days, amount_usd, status, starts_at, ends_at, admin_note, created_at')
    .eq('seller_id', auth.user.id)
    .order('created_at', { ascending: false });
  myBoosts = data || [];
}

function renderProducts() {
  const select = document.getElementById('product_id');
  const kept = select.value;

  if (!myProducts.length) {
    select.innerHTML = `<option value="">${t('boost.noProducts')}</option>`;
    select.disabled = true;
    document.getElementById('send-button').disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = myProducts
    .map((p) => `<option value="${esc(p.id)}">${esc(localName(p))}</option>`)
    .join('');

  const wanted = kept || wantedProductId;
  if (wanted && myProducts.some((p) => p.id === wanted)) select.value = wanted;
}

function renderPlans() {
  const row = document.getElementById('plan-row');
  row.innerHTML = PLANS.map((plan) => `
    <label class="plan-card${plan.days === chosenDays ? ' plan-on' : ''}">
      <input type="radio" name="duration_days" value="${plan.days}"
             ${plan.days === chosenDays ? 'checked' : ''}>
      <span class="plan-days">${plan.days} ${t('boost.days')}</span>
      <span class="plan-price">$${plan.usd.toFixed(2)}</span>
      <span class="plan-khr">${formatMoney(toKhr(plan.usd), 'KHR')}</span>
    </label>`).join('');

  row.querySelectorAll('input[name="duration_days"]').forEach((input) => {
    input.addEventListener('change', () => {
      chosenDays = Number(input.value);
      renderPlans();
      renderPayBox();
    });
  });
}

function renderPayBox() {
  const plan = chosenPlan();
  document.getElementById('pay-amount').textContent = `$${plan.usd.toFixed(2)}`;
  document.getElementById('pay-khr').textContent = formatMoney(toKhr(plan.usd), 'KHR');
  document.getElementById('pay-name').textContent = PAY_NAME;
  document.getElementById('pay-days').textContent = `${plan.days} ${t('boost.days')}`;
}

function renderProof() {
  const grid = document.getElementById('proof-grid');
  grid.innerHTML = proof
    ? `<div class="photo-item">
         <img src="${esc(proof.url)}" alt="">
         <button type="button" id="proof-clear" aria-label="${t('acct.remove')}">&times;</button>
       </div>`
    : `<div class="photo-add" id="proof-add">+<br>${t('boost.addProof')}</div>`;

  const addBox = document.getElementById('proof-add');
  if (addBox) addBox.addEventListener('click', () => document.getElementById('proof-input').click());

  const clearButton = document.getElementById('proof-clear');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      proof = null;
      renderProof();
    });
  }
}

document.getElementById('proof-input').addEventListener('change', (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  proof = { file, url: URL.createObjectURL(file) };
  renderProof();
});

// A reminder that something is already waiting, so the seller does not
// pay twice for the same product.
function renderPendingNote() {
  const box = document.getElementById('pending-note');
  const waiting = myBoosts.filter((b) => b.status === 'PENDING');
  if (!waiting.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.textContent = t('boost.alreadyWaiting');
}

function productName(id) {
  const found = myProducts.find((p) => p.id === id);
  return found ? localName(found) : t('boost.removedProduct');
}

function renderHistory() {
  const block = document.getElementById('history-block');
  const list = document.getElementById('history-list');

  if (!myBoosts.length) {
    block.hidden = true;
    return;
  }
  block.hidden = false;

  list.innerHTML = `
    <table class="dash-table">
      <thead>
        <tr>
          <th>${t('dash.product')}</th>
          <th>${t('boost.duration')}</th>
          <th>${t('boost.paid')}</th>
          <th>${t('dash.status')}</th>
          <th>${t('boost.runs')}</th>
        </tr>
      </thead>
      <tbody>
        ${myBoosts.map((b) => `
          <tr>
            <td><strong>${esc(productName(b.product_id))}</strong>
              ${b.admin_note ? `<p class="hint">${esc(b.admin_note)}</p>` : ''}</td>
            <td>${b.duration_days} ${t('boost.days')}</td>
            <td>$${Number(b.amount_usd).toFixed(2)}</td>
            <td><span class="status-tag status-${b.status}">${b.status}</span></td>
            <td>${b.starts_at && b.ends_at
              ? `${formatDate(b.starts_at)} - ${formatDate(b.ends_at)}`
              : '-'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function uploadProof() {
  const picture = await shrinkImage(proof.file);
  const ending = picture.type === 'image/png' ? 'png' : 'jpg';
  const path = `${auth.user.id}/boosts/${Date.now()}.${ending}`;
  const { error } = await db.storage
    .from('payment-proofs')
    .upload(path, picture, { contentType: picture.type, upsert: false });
  if (error) throw error;
  return path;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const productId = document.getElementById('product_id').value;
  if (!productId) {
    showError(t('boost.pickProduct'));
    return;
  }
  if (!proof) {
    showError(t('boost.needProof'));
    return;
  }

  const button = document.getElementById('send-button');
  button.disabled = true;
  button.textContent = t('form.saving');

  try {
    const plan = chosenPlan();
    const path = await uploadProof();
    const { error } = await db.from('product_boosts').insert({
      product_id: productId,
      seller_id: auth.user.id,
      duration_days: plan.days,
      amount_usd: plan.usd,
      payment_proof_path: path,
    });
    if (error) throw error;

    proof = null;
    renderProof();
    await loadMyBoosts();
    renderPendingNote();
    renderHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    showError((error && error.message) ? error.message : t('form.required'));
  }

  button.disabled = false;
  button.textContent = t('boost.send');
});

function renderAll() {
  renderProducts();
  renderPlans();
  renderPayBox();
  renderProof();
  renderPendingNote();
  renderHistory();
  applyTranslations();
}

async function initBoostPage() {
  if (!(await requireAccount('seller'))) return;
  if (!isVerifiedSeller() && !isAdmin()) {
    location.href = 'dashboard.html';
    return;
  }

  try {
    await Promise.all([loadMyProducts(), loadMyBoosts()]);
  } catch {
    showError(t('error.load'));
  }
  renderAll();
}

initBoostPage();

window.addEventListener('langchange', renderAll);
