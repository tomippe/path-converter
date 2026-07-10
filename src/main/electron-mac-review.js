/**
 * 正本: build-common/electron-mac-review.js（asar 同梱用に src/main/ に複製）
 */

const { buildAppleReviewUrl } = require('./apple-store-review-url');

/**
 * Electron Mac App Store 向け — アプリメニューにレビュー導線を追加する共通ヘルパー。
 * Electron からは SKStoreReviewController を直接呼べないため、MAS では App Store レビュー URL を開く。
 *
 * @param {object} opts
 * @param {import('electron').shell} opts.shell
 * @param {string} opts.appStoreId Apple App ID（数字のみ）
 * @param {object} [opts.labels] ja / en / zh
 * @returns {import('electron').MenuItemConstructorOptions | null}
 */
function buildMacAppStoreReviewMenuItem({ shell, appStoreId, labels }) {
  if (process.platform !== 'darwin' || !process.mas) {
    return null;
  }
  const id = String(appStoreId || '').trim();
  if (!id) return null;

  const locale = (typeof process !== 'undefined' && (process.env?.LC_ALL || process.env?.LANG)) || '';
  const lang = (locale.split('.')[0] || 'en').split('_')[0].toLowerCase();
  const defaultLabels = {
    ja: 'フィードバックを送る...',
    en: 'Send Feedback...',
    zh: '发送反馈...',
  };
  const merged = { ...defaultLabels, ...(labels || {}) };
  const label = merged[lang] || merged[lang?.startsWith('zh') ? 'zh' : 'en'] || merged.en;

  return {
    label,
    click: async () => {
      const url = buildAppleReviewUrl(id, { mt: 12, langTag: locale || lang });
      await shell.openExternal(url);
    },
  };
}

/**
 * macOS アプリメニュー（About の直後）にレビュー項目を差し込む。
 *
 * @param {import('electron').MenuItemConstructorOptions[]} submenu
 * @param {object} opts shell, appStoreId, labels
 * @returns {boolean} 追加したか
 */
function insertMacReviewAfterAbout(submenu, opts) {
  const item = buildMacAppStoreReviewMenuItem(opts);
  if (!item) return false;
  const aboutIndex = submenu.findIndex((entry) => entry.role === 'about');
  const insertAt = aboutIndex >= 0 ? aboutIndex + 1 : 0;
  submenu.splice(insertAt, 0, item, { type: 'separator' });
  return true;
}

module.exports = {
  buildMacAppStoreReviewMenuItem,
  insertMacReviewAfterAbout,
};
