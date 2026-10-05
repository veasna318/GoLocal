// Where Google sends the visitor back to. The Supabase library reads the
// sign-in result out of the address on its own, so this page only has to
// wait for the session, tidy the new account, and move them along.

function showProblem(message) {
  document.getElementById('state-title').textContent = t('auth.signInFailed');
  document.getElementById('state-text').hidden = true;
  const box = document.getElementById('form-error');
  box.textContent = message;
  box.hidden = false;
  document.getElementById('retry').hidden = false;
}

// Google sends the name and picture under a few different keys, so take
// whichever one arrived.
function googleDetails(user) {
  const info = user.user_metadata || {};
  return {
    name: (info.full_name || info.name || '').trim(),
    avatar: info.avatar_url || info.picture || '',
  };
}

// A Google account arrives with no account type and a placeholder name,
// because the sign-up form never ran. Fill those in once, on the first
// visit, without touching anything the person has set themselves.
async function completeNewProfile() {
  const { data: profile } = await db
    .from('profiles')
    .select('display_name, signup_type, avatar_path')
    .eq('id', auth.user.id)
    .single();

  if (!profile) return;

  const { name, avatar } = googleDetails(auth.user);
  const wanted = sessionStorage.getItem('wantedAccountType');
  sessionStorage.removeItem('wantedAccountType');

  const changes = {};
  if (name && profile.display_name === 'New member') changes.display_name = name.slice(0, 100);
  if (avatar && !profile.avatar_path) changes.avatar_path = avatar;
  if (wanted && profile.signup_type === 'BUYER' && wanted !== 'BUYER') changes.signup_type = wanted;

  if (Object.keys(changes).length) {
    await db.from('profiles').update(changes).eq('id', auth.user.id);
  }
}

async function finishSignIn() {
  // The sign-in result is handled by the library as the page loads, so
  // give it a moment before deciding that nothing arrived.
  for (let tries = 0; tries < 20; tries++) {
    const { data } = await db.auth.getSession();
    if (data.session) break;
    await new Promise((done) => setTimeout(done, 150));
  }

  await loadSession();

  if (!auth.user) {
    const reason = new URLSearchParams(location.hash.slice(1)).get('error_description')
      || new URLSearchParams(location.search).get('error_description');
    showProblem(reason || t('auth.signInFailed'));
    return;
  }

  try {
    await completeNewProfile();
    await loadSession();
  } catch {
    // A profile that could not be tidied is not worth blocking sign-in.
  }

  const next = sessionStorage.getItem('afterSignIn');
  sessionStorage.removeItem('afterSignIn');

  // Clear the sign-in result out of the address before moving on.
  history.replaceState(null, '', 'auth-callback.html');
  location.replace(next || (isSeller() || isAdmin() ? 'dashboard.html' : 'index.html'));
}

applyTranslations();
finishSignIn();
