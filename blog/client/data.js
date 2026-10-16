/*
 * 公开外观数据的共享读取（/appearance.json）
 * --------------------------------------------------------------
 * 访客端有两个独立的小脚本（背景选择 wallpaper.js、主题 theme.js）都要读这份公开配置。
 * 它们各自被打包成独立的 <script>，但通过 window 上的同一个 Promise 复用一次请求，
 * 因此页面只会下载一次 /appearance.json。任何失败都返回 null，由调用方决定回退行为。
 */

const KEY = '__minxiAppearanceData';

export function appearanceJson(url = '/appearance.json') {
  if (!window[KEY]) {
    window[KEY] = fetch(url, { cache: 'no-cache' })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  return window[KEY];
}

/** 读取公开配置的地址：优先用页面渲染出来的 data-appearance，缺省 /appearance.json。 */
export function appearanceDataUrl(selector = '#wallpaper-dialog') {
  try {
    return document.querySelector(selector)?.dataset.appearance || '/appearance.json';
  } catch {
    return '/appearance.json';
  }
}
