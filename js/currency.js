// Which currency the visitor wants to see prices in.
// Works like the language switch: saved in the browser, and pages listen
// for the "currencychange" event to redraw their prices.

// National Bank of Cambodia rate, used only to fill in the second price
// box on the product form. Saved prices are whatever the seller approved.
const KHR_PER_USD = 4057;

function getCurrency() {
  try {
    return localStorage.getItem('golocal-currency') === 'KHR' ? 'KHR' : 'USD';
  } catch {
    return 'USD';
  }
}

function setCurrency(currency) {
  try {
    localStorage.setItem('golocal-currency', currency);
  } catch {}
  window.dispatchEvent(new Event('currencychange'));
}

// Picks the price pair that matches the chosen currency, and falls back
// to the currency the seller typed in if that pair is missing.
function priceInCurrency(item) {
  const wanted = getCurrency();
  const usd = { min: item.price_usd_min, max: item.price_usd_max, currency: 'USD' };
  const khr = { min: item.price_khr_min, max: item.price_khr_max, currency: 'KHR' };
  const chosen = wanted === 'KHR' ? khr : usd;

  if (chosen.min != null || chosen.max != null) return chosen;
  const other = wanted === 'KHR' ? usd : khr;
  if (other.min != null || other.max != null) return other;
  return { min: item.price_min, max: item.price_max, currency: item.currency || 'USD' };
}

// The column the browse page filters and sorts on.
function priceColumn(field) {
  return getCurrency() === 'KHR' ? `price_khr_${field}` : `price_usd_${field}`;
}

// Converts between the two currencies for the product form.
function toKhr(amount) {
  const exact = Number(amount) * KHR_PER_USD;
  if (!(exact > 0)) return 0;
  // Riel prices are written in round hundreds, so offer one.
  return Math.max(100, Math.round(exact / 100) * 100);
}

function toUsd(amount) {
  return Math.round((Number(amount) / KHR_PER_USD) * 100) / 100;
}
