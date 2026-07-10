/**
 * 正本: build-common/apple-store-review-url.js（asar 同梱用に src/main/ に複製）
 */

/**
 * App Store レビュー URL — ストアフロント（jp / us / cn 等）をロケールに合わせる。
 * 国コードなしの `https://apps.apple.com/app/id…` は Apple が /us/ 等へリダイレクトするため避ける。
 */

/**
 * @param {string} langTag BCP47（ja, en-US, zh-Hans, process.env.LANG 等）
 * @returns {string} App Store ストアフロント（小文字2文字）
 */
function appleStorefrontFromLangTag(langTag) {
  const raw = String(langTag || 'en').trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return 'us';
  if (raw.startsWith('ja')) return 'jp';
  if (raw.startsWith('zh-tw') || raw.startsWith('zh-hk') || raw.startsWith('zh-hant')) return 'tw';
  if (raw.startsWith('zh')) return 'cn';
  if (raw.startsWith('ko')) return 'kr';
  const parts = raw.split('-');
  const region = parts.length > 1 ? parts[parts.length - 1] : '';
  if (/^[a-z]{2}$/.test(region)) return region;
  return 'us';
}

/**
 * @param {string} appStoreId 数字のみの Apple App ID
 * @param {object} [opts]
 * @param {number} [opts.mt] 8=iOS, 12=Mac
 * @param {string} [opts.storefront] 省略時は langTag から推定
 * @param {string} [opts.langTag]
 * @returns {string}
 */
function buildAppleReviewUrl(appStoreId, opts = {}) {
  const id = String(appStoreId || '').replace(/\D/g, '');
  if (!id) return '';
  const langTag = opts.langTag || process.env.LC_ALL || process.env.LANG || 'en';
  const storefront = (opts.storefront || appleStorefrontFromLangTag(langTag)).toLowerCase();
  const params = new URLSearchParams({ action: 'write-review' });
  if (opts.mt != null && opts.mt !== '') {
    params.set('mt', String(opts.mt));
  }
  return `https://apps.apple.com/${storefront}/app/id${id}?${params}`;
}

/**
 * 既存 URL のストアフロント部分だけ差し替える。
 * @param {string} url
 * @param {string} [langTag]
 * @returns {string}
 */
function localizeAppleReviewUrl(url, langTag) {
  const storefront = appleStorefrontFromLangTag(
    langTag || (typeof navigator !== 'undefined' ? navigator.language : 'en'),
  );
  try {
    const u = new URL(url);
    if (!u.hostname.includes('apps.apple.com')) return url;
    const m = u.pathname.match(/\/id(\d+)/i);
    if (!m) return url;
    u.pathname = `/${storefront}/app/id${m[1]}`;
    return u.toString();
  } catch {
    return url.replace(
      /^https:\/\/apps\.apple\.com\/(?:[a-z]{2}\/)?app\//i,
      `https://apps.apple.com/${storefront}/app/`,
    );
  }
}

module.exports = {
  appleStorefrontFromLangTag,
  buildAppleReviewUrl,
  localizeAppleReviewUrl,
};
