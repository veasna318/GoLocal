// Seller dashboard. A producer manages products here; a business manages
// sourcing requests, since the database will not let it create products.

function isBusinessAccount() {
  return auth.profile.platform_role === 'BUSINESS'
    || (auth.profile.platform_role === 'BUYER' && auth.profile.signup_type === 'BUSINESS');
}

// Points the heading and the Add button at whichever thing this
// account actually owns.
function renderDashboardKind() {
  const business = isBusinessAccount();
  const addButton = document.getElementById('add-button');

  document.getElementById('dash-heading').textContent = t(business ? 'dash.myRequests' : 'dash.myProducts');
  document.getElementById('dash-sub').textContent = t(business ? 'dash.subBusiness' : 'dash.sub');
  addButton.textContent = t(business ? 'dash.addRequest' : 'dash.addProduct');
  addButton.href = business ? 'request-form.html' : 'product-form.html';
}

async function loadMyRequests() {
  const list = document.getElementById('product-list');
  list.innerHTML = skeletonCards(1, 'request');

  const { data, error } = await db
    .from('sourcing_requests')
    .select('id, title, status, quantity_min, quantity_max, quantity_unit, deadline, urgency')
    .eq('business_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (error) { list.innerHTML = emptyMessage('error.load'); return; }
  if (!data.length) { list.innerHTML = emptyMessage('dash.noRequests'); return; }

  list.innerHTML = `
    <table class="dash-table">
      <thead>
        <tr>
          <th>${t('dash.request')}</th>
          <th>${t('req.quantity')}</th>
          <th>${t('req.deadline')}</th>
          <th>${t('dash.status')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${data.map((r) => {
          const quantity = r.quantity_min && r.quantity_max && Number(r.quantity_min) !== Number(r.quantity_max)
            ? `${formatNumber(r.quantity_min)} - ${formatNumber(r.quantity_max)}`
            : formatNumber(r.quantity_min || r.quantity_max || 0);
          return `
            <tr>
              <td>
                <strong>${esc(r.title)}</strong>
                ${r.urgency === 'URGENT' ? `<span class="tag tag-red">${t('req.urgent')}</span>` : ''}
              </td>
              <td>${esc(quantity)} ${esc(r.quantity_unit || 'kg')}</td>
              <td>${r.deadline ? formatDate(r.deadline) : t('req.noDeadline')}</td>
              <td><span class="status-tag status-${r.status}">${r.status}</span></td>
              <td>
                <div class="row-actions">
                  <a class="btn btn-outline btn-sm" href="requests.html?id=${esc(r.id)}">${t('adm.view')}</a>
                  <a class="btn btn-outline btn-sm" href="request-form.html?id=${esc(r.id)}">${t('dash.edit')}</a>
                  <button class="btn btn-outline btn-sm delete-request" data-id="${esc(r.id)}">${t('dash.delete')}</button>
                </div>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  list.querySelectorAll('.delete-request').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm(t('dash.confirmDeleteRequest'))) return;
      await db.from('sourcing_requests').delete().eq('id', button.dataset.id);
      loadMyRequests();
    });
  });
}

function loadMyThings() {
  return isBusinessAccount() ? loadMyRequests() : loadMyProducts();
}

async function loadMyProducts() {
  const list = document.getElementById('product-list');
  list.innerHTML = skeletonCards(1, 'request');

  const { data, error } = await db
    .from('products')
    .select('id, name, name_km, status, price_min, price_max, currency, unit, product_images(storage_path, is_cover)')
    .eq('owner_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = emptyMessage('error.load');
    return;
  }
  if (data.length === 0) {
    list.innerHTML = emptyMessage('dash.noProducts');
    return;
  }

  list.innerHTML = `
    <table class="dash-table">
      <thead>
        <tr>
          <th colspan="2">${t('dash.product')}</th>
          <th>${t('dash.price')}</th>
          <th>${t('dash.status')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${data.map((p) => {
          const images = p.product_images || [];
          const cover = (images.find((i) => i.is_cover) || images[0] || {}).storage_path;
          const price = formatPrice(p.price_min, p.price_max, p.currency);
          return `
            <tr>
              <td><img src="${esc(imageUrl(cover))}" alt="" onerror="${FALLBACK_IMAGE}"></td>
              <td><strong>${esc(localName(p))}</strong></td>
              <td>${price ? esc(price) + ' / ' + esc(p.unit) : t('card.contactPrice')}</td>
              <td><span class="status-tag status-${p.status}">${p.status}</span></td>
              <td>
                <div class="row-actions">
                  <a class="btn btn-outline btn-sm" href="product-form.html?id=${esc(p.id)}">${t('dash.edit')}</a>
                  <button class="btn btn-outline btn-sm delete-button" data-id="${esc(p.id)}">${t('dash.delete')}</button>
                </div>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  list.querySelectorAll('.delete-button').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm(t('dash.confirmDelete'))) return;
      await db.from('products').delete().eq('id', button.dataset.id);
      loadMyProducts();
    });
  });
}

// Sellers who are not verified yet see a notice instead of the add button.
function renderVerificationNotice() {
  const box = document.getElementById('verification-notice');
  const addButton = document.getElementById('add-button');
  const status = auth.profile.verification_status;

  if (isVerifiedSeller() || isAdmin()) {
    box.innerHTML = '';
    addButton.hidden = false;
    return;
  }

  addButton.hidden = true;
  const pending = status === 'PENDING';
  const needsFix = status === 'NEEDS_MORE_INFO';
  box.innerHTML = `
    <div class="alert alert-info">
      <strong>${t(pending ? 'dash.pendingTitle' : 'dash.notAppliedTitle')}</strong><br>
      ${t(pending ? 'dash.pendingText' : 'dash.notAppliedText')}
      <div class="notice-actions">
        <a class="btn btn-gold btn-sm" href="apply.html">
          ${t(pending || needsFix ? 'dash.viewApplication' : 'dash.apply')}
        </a>
      </div>
    </div>`;
}

async function initDashboard() {
  if (!(await requireAccount('seller'))) return;
  renderDashboardKind();
  renderVerificationNotice();
  loadMyThings();
  window.addEventListener('langchange', () => {
    renderDashboardKind();
    renderVerificationNotice();
    loadMyThings();
  });
}

initDashboard();
