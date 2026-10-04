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

function isSeller() {
  return !!auth.profile && ['PRODUCER', 'BUSINESS'].includes(auth.profile.platform_role);
}

function isVerifiedSeller() {
  return isSeller() && auth.profile.verification_status === 'VERIFIED' && auth.profile.is_active;
}

function isAdmin() {
  return !!auth.profile && auth.profile.platform_role === 'ADMIN';
}

function accountName() {
  if (!auth.profile) return '';
  return auth.profile.business_name || auth.profile.display_name;
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

async function signOut() {
  await db.auth.signOut();
  auth.user = null;
  auth.profile = null;
  location.href = 'index.html';
}

// Sends visitors to the login page when a page needs an account.
// Pass 'seller' to also require a verified producer or business account.
async function requireAccount(level = 'user') {
  if (!auth.ready) await loadSession();
  if (!auth.user) {
    location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop());
    return false;
  }
  if (level === 'seller' && !isSeller()) {
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
