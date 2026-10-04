// Connection to the GoLocal Supabase project.
// The publishable key is safe to use in the browser.
// Never put the secret key (sb_secret_...) in any website file.

const SUPABASE_URL = 'https://vnsugpvuiqycktmiuduv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IkonjoA9ffHCN5sLViDJLg_Bj5QVj83';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Returns the full URL of an image stored in the public-images bucket.
function imageUrl(path) {
  if (!path) return 'assets/images/placeholder.svg';
  if (path.startsWith('assets/') || path.startsWith('http')) return path;
  return db.storage.from('public-images').getPublicUrl(path).data.publicUrl;
}

function formatMoney(amount, currency) {
  if (currency === 'KHR') return Number(amount).toLocaleString('en-US') + ' ៛';
  return '$' + Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Shows a price range such as "$12 - $18", or a single price.
function formatPrice(min, max, currency = 'USD') {
  if (min == null && max == null) return null;
  if (min == null || max == null || Number(min) === Number(max)) {
    return formatMoney(min ?? max, currency);
  }
  return formatMoney(min, currency) + ' - ' + formatMoney(max, currency);
}

function formatNumber(n) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Shows a date as dd/mm/yyyy.
function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
}
