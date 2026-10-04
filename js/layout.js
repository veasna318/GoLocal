// Shared header and footer. Each page has <div id="site-header"></div>
// and <div id="site-footer"></div>, and this file fills them in.

const NAV_LINKS = [
  { href: 'index.html', key: 'nav.home' },
  { href: 'products.html', key: 'nav.products' },
  { href: 'requests.html', key: 'nav.requests' },
  { href: 'about.html', key: 'nav.about' },
];

// The right side of the header changes depending on who is signed in.
function headerAccountArea() {
  const signedIn = typeof auth !== 'undefined' && auth.user && auth.profile;
  if (!signedIn) {
    return `
      <a href="login.html" class="btn btn-outline btn-light">${t('auth.login')}</a>
      <a href="signup.html" class="btn btn-gold">${t('header.become')}</a>`;
  }

  const seller = isSeller() || isAdmin();
  return `
    <div class="account-menu">
      <button class="account-button">
        ${auth.profile.avatar_path
          ? `<img class="avatar-letter" src="${esc(imageUrl(auth.profile.avatar_path))}" alt=""
                  onerror="this.replaceWith(Object.assign(document.createElement('span'),
                  { className: 'avatar-letter', textContent: '${esc(accountName().trim().charAt(0).toUpperCase())}' }))">`
          : `<span class="avatar-letter">${esc(accountName().trim().charAt(0).toUpperCase())}</span>`}
        <span class="account-name">${esc(accountName())}</span>
      </button>
      <div class="account-dropdown">
        ${seller ? `<a href="dashboard.html">${t('dash.dashboard')}</a>` : ''}
        <a href="${seller ? `producer.html?id=${auth.user.id}` : 'account.html'}">${t('dash.account')}</a>
        <div class="divider"></div>
        <button type="button" class="logout-button">${t('auth.logout')}</button>
      </div>
    </div>`;
}

function renderHeader() {
  const el = document.getElementById('site-header');
  if (!el) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  const lang = getLang();
  const money = getCurrency();

  el.innerHTML = `
    <header class="site-header">
      <div class="container header-inner">
        <a href="index.html" class="brand">
          <img class="brand-logo" src="assets/images/logo.png" alt="GoLocal">
          <small class="brand-tagline">${t('header.tagline')}</small>
        </a>

        <button class="menu-toggle" aria-label="Menu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>

        <div class="header-menu">
          <nav class="main-nav">
            ${NAV_LINKS.map((link) => `
              <a href="${link.href}" class="${page === link.href ? 'active' : ''}">${t(link.key)}</a>
            `).join('')}
          </nav>
          <div class="header-actions">
            <div class="lang-switch" role="group" aria-label="Language">
              <button data-lang="en" class="${lang === 'en' ? 'active' : ''}">EN</button>
              <button data-lang="km" class="${lang === 'km' ? 'active' : ''}">ខ្មែរ</button>
            </div>
            <div class="lang-switch money-switch" role="group" aria-label="Currency">
              <button data-money="USD" class="${money === 'USD' ? 'active' : ''}">$</button>
              <button data-money="KHR" class="${money === 'KHR' ? 'active' : ''}">៛</button>
            </div>
            ${headerAccountArea()}
          </div>
        </div>
      </div>
    </header>`;

  el.querySelectorAll('.lang-switch button[data-lang]').forEach((button) => {
    button.addEventListener('click', () => setLang(button.dataset.lang));
  });

  el.querySelectorAll('.money-switch button').forEach((button) => {
    button.addEventListener('click', () => setCurrency(button.dataset.money));
  });

  const toggle = el.querySelector('.menu-toggle');
  toggle.addEventListener('click', () => {
    const open = el.querySelector('.site-header').classList.toggle('menu-open');
    toggle.setAttribute('aria-expanded', open);
  });

  const accountButton = el.querySelector('.account-button');
  if (accountButton) {
    accountButton.addEventListener('click', (e) => {
      e.stopPropagation();
      accountButton.closest('.account-menu').classList.toggle('open');
    });
    el.querySelector('.logout-button').addEventListener('click', signOut);
    document.addEventListener('click', () => {
      const menu = el.querySelector('.account-menu');
      if (menu) menu.classList.remove('open');
    });
  }
}

function renderFooter() {
  const el = document.getElementById('site-footer');
  if (!el) return;

  el.innerHTML = `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <img class="brand-logo footer-logo" src="assets/images/logo.png" alt="GoLocal">
            <p>${t('footer.about')}</p>
          </div>
          <div>
            <h4>${t('footer.explore')}</h4>
            <a href="products.html">${t('nav.products')}</a>
            <a href="requests.html">${t('nav.requests')}</a>
            <a href="about.html">${t('nav.about')}</a>
          </div>
          <div>
            <h4>${t('footer.sellers')}</h4>
            <a href="signup.html">${t('header.become')}</a>
            <a href="login.html">${t('auth.login')}</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>&copy; ${new Date().getFullYear()} GoLocal. ${t('footer.rights')}</span>
          <span>${t('footer.made')}</span>
        </div>
      </div>
    </footer>`;
}

// A small button that appears once the visitor has scrolled a long way down.
function setUpToTop() {
  let button = document.getElementById('to-top');
  if (!button) {
    button = document.createElement('button');
    button.id = 'to-top';
    button.type = 'button';
    button.className = 'to-top';
    button.innerHTML = icon('up');
    document.body.appendChild(button);

    button.addEventListener('click', () => {
      const gentle = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: gentle ? 'smooth' : 'auto' });
    });

    const update = () => button.classList.toggle('show', window.scrollY > 600);
    window.addEventListener('scroll', update, { passive: true });
    update();
  }
  button.setAttribute('aria-label', t('common.toTop'));
  button.title = t('common.toTop');
}

function renderLayout() {
  renderHeader();
  renderFooter();
  setUpToTop();
  applyTranslations();
}

renderLayout();
window.addEventListener('langchange', renderLayout);
window.addEventListener('authchange', renderHeader);
window.addEventListener('currencychange', renderHeader);
