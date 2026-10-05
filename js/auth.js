// Keeps track of who is signed in, and their profile row.
// Pages read auth.user and auth.profile, and listen for the "authchange" event.

const auth = {
  user: null,
  profile: null,
  ready: false,
};

async function loadSession() {
  const { data } = await db.auth.getSession();
  auth.user = data.session ? data.session.user : null;
  auth.profile = null;

  if (auth.user) {
    const { data: profile } = await db
      .from('profiles')
      .select('*')
      .eq('id', auth.user.id)
      .single();
    auth.profile = profile || null;
  }

  auth.ready = true;
  window.dispatchEvent(new Event('authchange'));
}

// Someone who signed up as a producer or business counts as a seller for
// navigation, even before an admin approves them. platform_role is only
// granted on approval, so without this a new seller could never reach the
// page where they apply.
function isSeller() {
  if (!auth.profile) return false;
  return ['PRODUCER', 'BUSINESS'].includes(auth.profile.platform_role)
      || ['PRODUCER', 'BUSINESS'].includes(auth.profile.signup_type);
}

// True only once an administrator has granted the role.
function isApprovedSeller() {
  return !!auth.profile && ['PRODUCER', 'BUSINESS'].includes(auth.profile.platform_role);
}

function isVerifiedSeller() {
  return isApprovedSeller() && auth.profile.verification_status === 'VERIFIED' && auth.profile.is_active;
}

function isAdmin() {
  return !!auth.profile && auth.profile.platform_role === 'ADMIN';
}

// The person's own name, used by the header. The farm name belongs
// to the profile page, not to the account menu.
function accountName() {
  if (!auth.profile) return '';
  return auth.profile.display_name || auth.profile.business_name || '';
}

async function signUp({ email, password, displayName, accountType }) {
  const { error } = await db.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, signup_type: accountType } },
  });
  if (error) throw error;
  await loadSession();
}

async function signIn(email, password) {
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await loadSession();
}

// Sends the visitor to Google, which returns them to auth-callback.html.
// Where they were heading is saved first, because the round trip through
// Google loses everything the page was holding. The account type is saved
// the same way: Google tells us nothing about it, so a new account is made
// a buyer and the callback page records what they chose.
async function signInWithGoogle({ next, accountType } = {}) {
  if (next) sessionStorage.setItem('afterSignIn', next);
  if (accountType) sessionStorage.setItem('wantedAccountType', accountType);

  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: new URL('auth-callback.html', location.href).href,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

async function signOut() {
  await db.auth.signOut();
  auth.user = null;
  auth.profile = null;
  location.href = 'index.html';
}

// Sends visitors to the login page when a page needs an account.
// Pass 'seller' to require a producer or business account. Admins are let
// through as well, because the header offers them the dashboard and the
// seller pages already check for them.
async function requireAccount(level = 'user') {
  if (!auth.ready) await loadSession();
  if (!auth.user) {
    location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop());
    return false;
  }
  if (level === 'seller' && !isSeller() && !isAdmin()) {
    location.href = 'index.html';
    return false;
  }
  return true;
}

// Turns Supabase sign-in errors into plain messages.
function authErrorText(error) {
  const message = (error && error.message ? error.message : '').toLowerCase();
  if (message.includes('invalid login')) return t('auth.errWrong');
  if (message.includes('already registered') || message.includes('already exists')) return t('auth.errTaken');
  if (message.includes('password')) return t('auth.errPassword');
  if (message.includes('email')) return t('auth.errEmail');
  return error && error.message ? error.message : t('error.load');
}

db.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') loadSession();
});

loadSession();
