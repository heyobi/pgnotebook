// Tuple Pro: one-time in-app purchase that unlocks every extension (PostGIS, pgvector, AGE, …).
// The PostgreSQL core (all built-in types, functions, PL/pgSQL, notebooks, terminal) is free.
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { h, icon, modal, native, toast } from './ui';
import { EXTENSIONS } from './extensions';

export const PRODUCT_ID = 'com.heyobi.pgnotebook.pro';
const KEY = 'pgn-pro';

let pro = false;
let price = '';
const listeners = new Set<(v: boolean) => void>();

try { pro = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }

export const isPro = () => pro;
export const onPro = (fn: (v: boolean) => void) => (listeners.add(fn), () => listeners.delete(fn));

function setPro(v: boolean) {
  pro = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach((l) => l(v));
}

export async function initPro() {
  if (!native) return; // desktop browser (development): everything unlocked via ?pro in the URL
  await refreshPrice();
  try {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    if (purchases.some((p) => p.productIdentifier === PRODUCT_ID)) setPro(true);
  } catch { /* keep cached value */ }
}
if (!native && new URLSearchParams(location.search).has('pro')) setPro(true);

/**
 * Localised price from StoreKit. Read fresh each time the paywall opens: StoreKit can report the US price before the
 * storefront is known (seen in TestFlight with a Turkish account: button said $4.99, the Apple sheet ₺249,99).
 * If the storefront is not the US but the price is still in USD, show no price rather than a wrong one —
 * Apple's purchase sheet always shows the real amount.
 */
async function refreshPrice() {
  try {
    const { products } = await NativePurchases.getProducts({ productIdentifiers: [PRODUCT_ID], productType: PURCHASE_TYPE.INAPP });
    const p = products[0];
    let country = '';
    try { country = (await NativePurchases.getStorefront()).countryCode; } catch { /* older iOS */ }
    const mismatch = !!p && p.currencyCode === 'USD' && !!country && !['USA', 'US'].includes(country);
    price = p && !mismatch ? p.priceString : '';
  } catch { /* offline / not configured */ }
}

async function buy(): Promise<boolean> {
  if (!native) { setPro(true); return true; }
  try {
    await NativePurchases.purchaseProduct({ productIdentifier: PRODUCT_ID, productType: PURCHASE_TYPE.INAPP, quantity: 1 } as never);
    setPro(true);
    return true;
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (!/cancel/i.test(msg)) toast(msg || 'Purchase failed', 'err');
    return false;
  }
}

async function restore(): Promise<boolean> {
  if (!native) return false;
  try {
    await NativePurchases.restorePurchases();
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    const ok = purchases.some((p) => p.productIdentifier === PRODUCT_ID);
    if (ok) setPro(true);
    toast(ok ? 'Pro restored' : 'No previous purchase found', ok ? 'ok' : 'err');
    return ok;
  } catch (e) {
    toast((e as Error)?.message || 'Restore failed', 'err');
    return false;
  }
}

/** Resolves true when Pro is (now) active. Shows the paywall otherwise. */
export function requirePro(reason?: string): Promise<boolean> {
  if (pro) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => { if (!done) { done = true; resolve(v); } };
    const featured = ['postgis', 'vector', 'age', 'pgcrypto', 'pg_trgm', 'pgtap'];
    const buyBtn = h('button', { class: 'btn primary big', onclick: async () => {
      buyBtn.setAttribute('disabled', '');
      if (await buy()) { close(); finish(true); toast('Pro unlocked — thank you!'); }
      buyBtn.removeAttribute('disabled');
    } }, price ? `Unlock Pro · ${price}` : 'Unlock Pro');
    if (native) void refreshPrice().then(() => { if (!buyBtn.hasAttribute('disabled')) buyBtn.textContent = price ? `Unlock Pro · ${price}` : 'Unlock Pro'; });
    const content = h('div', { class: 'paywall' },
      h('div', { class: 'pw-badge' }, 'PRO'),
      h('h1', {}, 'Every extension, unlocked'),
      reason && h('p', { class: 'muted center' }, reason),
      h('div', { class: 'pw-grid' },
        featured.map((id) => {
          const e = EXTENSIONS.find((x) => x.id === id)!;
          return h('div', { class: 'pw-item' }, h('b', {}, e.title), h('span', {}, e.tagline));
        })),
      h('ul', { class: 'pw-list' },
        h('li', {}, icon('check'), `${EXTENSIONS.length} extensions on PostgreSQL 16, 17 and 18`),
        h('li', {}, icon('check'), 'Maps for PostGIS results, plots for vectors'),
        h('li', {}, icon('check'), 'Example notebooks for each extension'),
        h('li', {}, icon('check'), 'One-time purchase. No subscription, no account.')),
      buyBtn,
      h('button', { class: 'link', onclick: async () => { if (await restore()) { close(); finish(true); } } }, 'Restore purchase'),
      h('p', { class: 'muted small center' }, 'PostgreSQL itself, notebooks, the terminal and charts stay free forever.'));
    const close = modal(content, () => finish(pro));
  });
}
