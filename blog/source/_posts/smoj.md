---
title: smoj 优化插件
date: 2026-11-25 19:36:00
categories:
  - 其他
tags:
  - SM
---
:::success[code]
```
// ==UserScript==
// @name         Hydro UI Beautifier
// @namespace    https://zsoj.gbfish.cn/
// @version      1.7.5
// @description  Hydro 全站 Glass 美化：修复页脚吸底与菜单选中/悬停圆角
// @author       ChatGPT
// @match        https://zsoj.gbfish.cn/*
// @match        http://10.3.44.224/*
// @match        https://10.3.44.224/*
// @match        https://hydro.ac/*
// @match        https://oier.group/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';
    // 沿用 v1.7 的保护标记、存储键，保留现有配置和自定义方案。
    if (window.__HYDRO_BEAUTIFIER_V170__) return;
    window.__HYDRO_BEAUTIFIER_V170__ = true;

    const VERSION = '1.7.5';
    const KEY = 'hydro_beautifier_v170';
    const OLD_KEYS = ['hydro_beautifier_v160', 'hydro_beautifier_v150', 'hydro_beautifier_v141', 'hydro_beautifier_v14', 'hydro_beautifier_v13', 'hydro_beautifier_v12', 'hydro_beautifier_v11'];
    const PRESET_KEY = KEY + '_presets';
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const clone = x => JSON.parse(JSON.stringify(x));
    const GROUPS = ['native', 'table', 'side', 'academic'];
    const DEFAULTS = {
        enabled: true, image: '', background: '#171923', backgroundMode: 'image',
        gradientA: '#202b48', gradientB: '#11131e', gradientAngle: 135,
        opacity: 100, bgBlur: 0, overlay: 18, overlayColor: '#000000',
        bgPosition: 'center', bgSize: 'cover', saturation: 100, brightness: 100, contrast: 100, noise: false,
        dark: true, accent: '#7186f5', transparent: true, border: true, borderOpacity: 12, borderWidth: 1,
        shadow: true, shadowStrength: 28, hover: true, hoverLift: 3, hoverBrightness: 108,
        radius: 16, cardOpacity: 86, blur: 12, cardPadding: 16, mediaFrames: true, mediaFramePadding: 5,
        nativeFollowGlobal: true, nativeOpacity: 86, nativeBlur: 12, nativeRadius: 16,
        tableFollowGlobal: true, tableOpacity: 86, tableBlur: 12, tableRadius: 16,
        sideFollowGlobal: true, sideOpacity: 86, sideBlur: 12, sideRadius: 16,
        academicFollowGlobal: true, academicOpacity: 86, academicBlur: 12, academicRadius: 16,
        layoutEnabled: true, width: 1440, gap: 18, sideWidth: 27, layoutMode: 'auto', compact: false,
        striped: true, fontScale: 100, preset: 'midnight'
    };
    const THEMES = {
        midnight: { accent: '#7186f5', background: '#171923', dark: true, cardOpacity: 86, blur: 12, overlay: 18 },
        oled: { accent: '#a78bfa', background: '#050505', dark: true, cardOpacity: 94, blur: 8, overlay: 5 },
        forest: { accent: '#55aa85', background: '#182c29', dark: true, cardOpacity: 86, blur: 16, overlay: 20 },
        ocean: { accent: '#45a9dc', background: '#102332', dark: true, cardOpacity: 82, blur: 16, overlay: 20 },
        light: { accent: '#4778d5', background: '#e9edf5', dark: false, cardOpacity: 90, blur: 12, overlay: 0 }
    };

    function mergedSettings(src) {
        const s = { ...DEFAULTS, ...src };
        for (const g of GROUPS) {
            if (!Object.prototype.hasOwnProperty.call(src, g + 'FollowGlobal')) s[g + 'FollowGlobal'] = true;
        }
        return s;
    }
    function loadSettings() {
        for (const k of [KEY, ...OLD_KEYS]) {
            try {
                const raw = localStorage.getItem(k);
                if (!raw) continue;
                const obj = JSON.parse(raw);
                const src = obj?.settings && typeof obj.settings === 'object' ? obj.settings : obj;
                if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
                const s = mergedSettings(src);
                if (k !== KEY) {
                    const legacy = { native: [86,12,14], table: [82,10,14], side: [82,12,14], academic: [86,12,14] };
                    for (const [g, values] of Object.entries(legacy)) {
                        if (['Opacity','Blur','Radius'].every((p, i) => Number(s[g+p]) === values[i])) s[g+'FollowGlobal'] = true;
                    }
                }
                return s;
            } catch (e) { console.warn('[HB] 配置读取失败：', k, e); }
        }
        return clone(DEFAULTS);
    }
    let settings = loadSettings();
    let customPresets = {};
    try {
        const x = JSON.parse(localStorage.getItem(PRESET_KEY) || '{}');
        if (x && typeof x === 'object' && !Array.isArray(x)) customPresets = x;
    } catch (e) { console.warn('[HB] 方案读取失败', e); }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(settings)); }
        catch (e) { console.warn('[HB] 保存失败', e); toast('保存失败：浏览器存储空间可能不足'); }
    }
    function savePresets() {
        try { localStorage.setItem(PRESET_KEY, JSON.stringify(customPresets)); }
        catch (e) { console.warn('[HB] 方案保存失败', e); toast('方案保存失败'); }
    }
    function rgba(hex, alpha) {
        let h = String(hex || '#000000').replace('#', '');
        if (h.length === 3) h = h.split('').map(x => x + x).join('');
        const n = parseInt(h, 16);
        return Number.isFinite(n) ? `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${alpha})` : `rgba(0,0,0,${alpha})`;
    }
    function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

    const bg = document.createElement('div');
    bg.id = 'hb170-background';
    bg.innerHTML = '<div class="hb170-bg-image"></div><div class="hb170-bg-noise"></div><div class="hb170-bg-overlay"></div>';
    const bgImage = $('.hb170-bg-image', bg), bgOverlay = $('.hb170-bg-overlay', bg), bgNoise = $('.hb170-bg-noise', bg);
    const style = document.createElement('style');
    style.id = 'hb170-style';
    style.textContent = `
:root{--hb-accent:#7186f5;--hb-global-bg:rgba(29,32,45,.86);--hb-global-blur:12px;--hb-global-radius:16px;--hb-global-border:rgba(255,255,255,.12);--hb-global-shadow:0 8px 28px rgba(0,0,0,.28);--hb-global-padding:16px;--hb-page-width:1440px;--hb-layout-gap:18px}
#hb170-background{position:fixed!important;inset:0!important;z-index:-1!important;pointer-events:none!important;overflow:hidden!important;background:#171923}
#hb170-background .hb170-bg-image{position:absolute;inset:-2%;background-position:center;background-size:cover;background-repeat:no-repeat;will-change:filter;transform:translateZ(0)}
#hb170-background .hb170-bg-overlay{position:absolute;inset:0}
#hb170-background .hb170-bg-noise{position:absolute;inset:0;opacity:.055;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E")}
html{min-height:100%;background:transparent!important}
body{min-height:100vh;min-height:100dvh;background:transparent!important;isolation:isolate}
/* 吸底使用实际共同父容器（Hydro 通常是 #panel），不是强制 body。 */
.hb170-sticky-shell{display:flex!important;flex-direction:column!important;box-sizing:border-box!important;min-height:calc(100vh - var(--hb-shell-offset,0px))!important;min-height:calc(100dvh - var(--hb-shell-offset,0px))!important}
.hb170-sticky-shell>.hb170-sticky-main{flex:1 0 auto!important;min-height:0}
.hb170-sticky-shell>.hb170-sticky-footer{margin-top:auto!important;flex-shrink:0!important;width:100%}
body.hb170-transparent .main,body.hb170-transparent #panel,body.hb170-transparent .slideout-panel{background:transparent!important}
body.hb170-layout .main{max-width:var(--hb-page-width)!important;width:calc(100% - 32px)!important;margin-inline:auto!important}
/* Hydro 使用浮动栅格，column-gap 对 float 不生效。以半栏距作为每列的左右内边距。 */
body.hb170-layout .main .row:not(.collapse)>:is(.column,.columns){padding-left:calc(var(--hb-layout-gap) / 2)!important;padding-right:calc(var(--hb-layout-gap) / 2)!important;box-sizing:border-box!important}
body.hb170-layout.hb170-compact .main .row{row-gap:8px}
body.hb170-compact .main .section__body{padding-block:8px!important}
body.hb170-compact .main .section{margin-bottom:10px!important}
.hb170-card{box-sizing:border-box!important;border-radius:var(--hb170-radius,var(--hb-global-radius))!important;background:var(--hb170-bg,var(--hb-global-bg))!important;border:var(--hb170-border-width,1px) solid var(--hb-global-border)!important;backdrop-filter:blur(var(--hb170-blur,var(--hb-global-blur)))!important;-webkit-backdrop-filter:blur(var(--hb170-blur,var(--hb-global-blur)))!important;box-shadow:var(--hb-global-shadow)!important;background-clip:padding-box!important;transition:border-radius .18s ease,background-color .18s ease,box-shadow .18s ease,transform .18s ease,filter .18s ease!important}
.hb170-media-frame{display:inline-block!important;max-width:100%!important;box-sizing:border-box!important;padding:var(--hb-media-frame-padding,5px)!important;margin:.35em .2em!important;vertical-align:middle!important;line-height:0!important;border-radius:var(--hb-global-radius)!important;background:var(--hb-global-bg)!important;border:var(--hb170-border-width,1px) solid var(--hb-global-border)!important;backdrop-filter:blur(var(--hb-global-blur))!important;-webkit-backdrop-filter:blur(var(--hb-global-blur))!important;box-shadow:var(--hb-global-shadow)!important;overflow:hidden!important}
.hb170-media-frame>img,.hb170-media-frame>picture,.hb170-media-frame>video,.hb170-media-frame>iframe,.hb170-media-frame>object,.hb170-media-frame>embed{display:block!important;max-width:100%!important;border:0!important;border-radius:max(0px,calc(var(--hb-global-radius) - var(--hb-media-frame-padding,5px)))!important}
.hb170-media-frame>picture>img{display:block!important;max-width:100%!important;height:auto!important;border-radius:inherit!important}
.hb170-media-surface{border-radius:inherit!important;overflow:hidden!important;background-clip:padding-box!important}
.hb170-card>.contest-sidebar__bg{display:block;border-radius:inherit!important;overflow:hidden!important}
body:not(.hb170-media-frames) .hb170-media-frame{padding:0!important;background:transparent!important;border-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important}
body:not(.hb170-media-frames) .hb170-media-frame>img,body:not(.hb170-media-frames) .hb170-media-frame>picture,body:not(.hb170-media-frames) .hb170-media-frame>video,body:not(.hb170-media-frames) .hb170-media-frame>iframe{border-radius:var(--hb-global-radius)!important}
.hb170-card.hb170-no-border{border-color:transparent!important}
.hb170-card :is(.active,.selected,.is-selected,.is-active,[aria-selected="true"],[aria-checked="true"],[data-state="active"],[data-selected="true"]),.hb170-card :is(a,button,[role="button"],[role="tab"],[role="option"]):is(:active,:focus,:focus-visible){border-radius:var(--hb170-radius,var(--hb-global-radius))!important;background-clip:padding-box!important}
.hb170-card :is(.active,.selected,.is-selected,.is-active,[aria-selected="true"],[aria-checked="true"],[data-state="active"],[data-selected="true"]){overflow:hidden!important}
.hb170-card :is(tr,li,.item,.menu-item,.tab,.nav-item):is(.active,.selected,.is-selected,.is-active,[aria-selected="true"],[aria-current="true"]){border-radius:var(--hb-global-radius)!important;background-clip:padding-box!important;overflow:hidden!important}
.hb170-card :is(a,button,[role="button"],[role="tab"],[role="option"]):focus-visible{outline:2px solid var(--hb-accent)!important;outline-offset:2px!important;border-radius:var(--hb170-radius,var(--hb-global-radius))!important}
/* 浅色适配：比赛横幅的标题、信息和参加状态采用灰色；保留深色状态徽章、黄色按钮和图标的原配色。 */
:is(html.theme--light body,body.hb170-light) .main .section--contest .media__body .section__body>h1,
:is(html.theme--light body,body.hb170-light) .main .section--contest .info,
:is(html.theme--light body,body.hb170-light) .main .section--contest .info li,
:is(html.theme--light body,body.hb170-light) .main .section--contest .media__right .typo,
:is(html.theme--light body,body.hb170-light) .main .section--contest .media__right .typo p,
:is(html.theme--light body,body.hb170-light) .main .section--contest .media__right .typo .icon{color:#6b7280!important;text-shadow:none!important}
/* Hydro 将高亮画在 menu__link / messagepad__list-item 本身；包括 hover。 */
.main :is(a,button).menu__link:is(:hover,:active,:focus-visible,.active,.selected,[aria-current="page"]),.main .menu__item:is(.active,.selected,.is-active)>.menu__link,.main .messagepad__list-item:is(:hover,:active,:focus-visible,.active,.selected,[aria-selected="true"]){border-radius:var(--hb170-radius,var(--hb-global-radius))!important;background-clip:padding-box!important}
body.hb170-hover .hb170-card:hover{transform:translateY(calc(-1 * var(--hb-hover-lift,3px)))!important;filter:brightness(var(--hb-hover-brightness,108%))!important}
.hb170-card .section__header,.hb170-card .section__body{background:transparent!important;border-radius:inherit}
/* 站点本身有 first-child / last-child 等更具体的 padding 规则，需要提升优先级。保留明确标记 no-padding 的表格等区域。 */
body:not(.hb170-compact) .main .hb170-card .section__body:not(.no-padding),body:not(.hb170-compact) #academic-root .hb170-card .section__body:not(.no-padding){padding:var(--hb-global-padding)!important}
.hb170-table-wrap{border-radius:var(--hb170-radius,var(--hb-global-radius))!important;overflow:hidden!important}
.hb170-table-wrap table{border-collapse:separate!important;border-spacing:0!important;background:transparent!important;border-radius:inherit!important}
.hb170-table-wrap th,.hb170-table-wrap td{background:transparent!important;border-color:var(--hb-global-border)!important}
body.hb170-striped .hb170-table-wrap tbody tr:nth-child(odd){background:rgba(255,255,255,.035)!important}
body.hb170-striped .hb170-table-wrap tbody tr:nth-child(even){background:rgba(0,0,0,.10)!important}
.hb170-card.hb170-side{--hb170-bg:var(--hb-side-bg);--hb170-blur:var(--hb-side-blur);--hb170-radius:var(--hb-side-radius)}
.hb170-card.hb170-native{--hb170-bg:var(--hb-native-bg);--hb170-blur:var(--hb-native-blur);--hb170-radius:var(--hb-native-radius)}
.hb170-card.hb170-table{--hb170-bg:var(--hb-table-bg);--hb170-blur:var(--hb-table-blur);--hb170-radius:var(--hb-table-radius)}
.hb170-card.hb170-academic{--hb170-bg:var(--hb-academic-bg);--hb170-blur:var(--hb-academic-blur);--hb170-radius:var(--hb-academic-radius)}
.hb170-card.hb170-side.hb170-follow,.hb170-card.hb170-native.hb170-follow,.hb170-card.hb170-table.hb170-follow,.hb170-card.hb170-academic.hb170-follow{--hb170-bg:var(--hb-global-bg);--hb170-blur:var(--hb-global-blur);--hb170-radius:var(--hb-global-radius)}
body.hb170-shadow .hb170-card{box-shadow:var(--hb-global-shadow)!important}
body:not(.hb170-shadow) .hb170-card{box-shadow:none!important}
body.hb170-border-off .hb170-card{border-color:transparent!important}
/* Hydro 的大量字号使用 rem，仅修改 body 无法影响这些元素。以原有根字号为基准缩放。 */
html.hb170-font-scale{font-size:calc(var(--hb-base-font-size,13px) * var(--hb-font-scale,1))!important}
.main .section.hb170-card,.main .section__table-container.hb170-card,#academic-root .ac-card.hb170-card{isolation:isolate}
.main .section__table-container.hb170-card{padding:0!important}
.main .section__table-container.hb170-card table{margin:0!important}
.hb170-card .section__table-container{border-radius:inherit!important;overflow:hidden!important}
#hb170-trigger{position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483000!important;width:48px;height:48px;border:0!important;border-radius:16px!important;background:var(--hb-accent)!important;color:#fff!important;font-size:21px;cursor:pointer;box-shadow:0 6px 24px #0005}
#hb170-panel{position:fixed!important;right:20px!important;bottom:80px!important;z-index:2147483001!important;width:min(440px,calc(100vw - 24px));max-height:86vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid #ffffff24;border-radius:20px!important;background:var(--hb-panel-bg,#1e2130f7)!important;color:var(--hb-text,#f0f0f5)!important;box-shadow:0 18px 60px #0008;backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);font:13px/1.45 system-ui,sans-serif}
#hb170-panel[hidden]{display:none!important}#hb170-panel *{box-sizing:border-box}
#hb170-head{padding:16px 18px 12px;border-bottom:1px solid #ffffff18}#hb170-head strong{font-size:18px}#hb170-head small{display:block;color:#9ba1b3;margin-top:3px}
#hb170-tabs{display:flex;gap:5px;padding:10px 12px;overflow:auto;flex-shrink:0}#hb170-tabs button{white-space:nowrap;border:0;border-radius:9px!important;padding:8px 11px;background:#ffffff12;color:inherit;cursor:pointer}#hb170-tabs button.active{background:var(--hb-accent);color:#fff}
#hb170-content{padding:0 17px 18px;overflow:auto;min-height:0;flex:1}#hb170-content [data-page][hidden]{display:none!important}#hb170-content h3{font-size:13px;margin:17px 0 10px;padding-bottom:8px;border-bottom:1px solid #ffffff20}#hb170-content .item{margin:12px 0}#hb170-content .label{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;font-weight:650}
#hb170-content input[type=range]{width:100%;accent-color:var(--hb-accent)}#hb170-content input[type=color]{width:44px;height:30px;border:0;background:transparent}#hb170-content input[type=text],#hb170-content input[type=number],#hb170-content select,#hb170-content textarea{width:100%;padding:9px;border:1px solid #ffffff2c;border-radius:8px!important;background:#ffffff12;color:inherit}#hb170-content select option{background:#252938;color:#fff}#hb170-content input[type=checkbox]{accent-color:var(--hb-accent)}#hb170-content .check{display:flex;align-items:center;gap:8px;margin:9px 0;cursor:pointer}#hb170-content .hint{font-size:11px;color:#9ba1b3;line-height:1.55;margin-top:5px}#hb170-content .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#hb170-content button.action{width:100%;padding:10px;border:0;border-radius:9px!important;background:var(--hb-accent);color:#fff;font-weight:700;cursor:pointer}#hb170-content button.secondary{background:#ffffff18;color:inherit}#hb170-content button:disabled,#hb170-content input:disabled{opacity:.42;cursor:not-allowed}#hb170-content .preset{padding:11px;border:1px solid #ffffff25;border-radius:10px!important;background:#ffffff0d;color:inherit;text-align:left;cursor:pointer}#hb170-content .preset.active{border-color:var(--hb-accent);box-shadow:inset 0 0 0 1px var(--hb-accent)}#hb170-content .status{padding:9px;border-radius:8px;background:#ffffff12;font-size:11px;overflow-wrap:anywhere;white-space:pre-wrap}
#hb170-foot{padding:10px 16px;border-top:1px solid #ffffff20;display:flex;justify-content:space-between;align-items:center}#hb170-foot button{border:0;border-radius:8px!important;padding:8px 14px;background:var(--hb-accent);color:#fff;cursor:pointer}
#hb170-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;padding:10px 16px;border-radius:10px;background:#202536;color:#fff;box-shadow:0 6px 24px #0006;font:13px system-ui;opacity:0;pointer-events:none;transition:opacity .2s}#hb170-toast.show{opacity:1}
.hb170-inspector-highlight{outline:3px solid #ffca58!important;outline-offset:2px!important}
@media(max-width:520px){#hb170-panel{right:10px!important;bottom:72px!important;max-height:82vh}#hb170-trigger{right:14px!important}}
`;
    document.head.appendChild(style);
    function toast(message) {
        let el = $('#hb170-toast');
        if (!el) { el = document.createElement('div'); el.id = 'hb170-toast'; document.body.append(el); }
        el.textContent = message; el.classList.add('show');
        clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
    }

    const trigger = document.createElement('button');
    trigger.id = 'hb170-trigger'; trigger.type = 'button'; trigger.textContent = '⚙'; trigger.title = 'Hydro 美化设置';
    const panel = document.createElement('section');
    panel.id = 'hb170-panel'; panel.hidden = true;
    const range = (key, label, min, max, step = 1) => `<div class="item"><div class="label"><span>${label}</span><b id="v-${key}"></b></div><input data-range="${key}" type="range" min="${min}" max="${max}" step="${step}"></div>`;
    const check = (key, label) => `<label class="check"><input data-check="${key}" type="checkbox">${label}</label>`;
    const color = (key, label) => `<div class="item"><div class="label">${label}</div><input data-color="${key}" type="color"></div>`;
    panel.innerHTML = `
<header id="hb170-head"><strong>Hydro UI Beautifier</strong><small>v${VERSION} · Glass Design System</small></header>
<nav id="hb170-tabs"><button class="active" data-tab="global">全局</button><button data-tab="cards">卡片</button><button data-tab="layout">布局</button><button data-tab="background">背景</button><button data-tab="themes">主题</button><button data-tab="tools">诊断/配置</button></nav>
<main id="hb170-content">
<section data-page="global"><h3>全局卡片样式</h3>
${range('cardOpacity','全局透明度',10,100)}${range('blur','全局毛玻璃',0,30)}${range('radius','全局圆角',0,32)}${range('cardPadding','卡片内部间距',0,36)}
${check('dark','深色卡片')}${check('transparent','页面背景透明化')}<h3>边框与阴影</h3>
${check('border','显示卡片边框')}${range('borderOpacity','边框透明度',0,50)}${range('borderWidth','边框宽度',0,3,.5)}${check('shadow','卡片阴影')}${range('shadowStrength','阴影强度',0,60)}${check('hover','悬停动效')}${range('hoverLift','悬停浮起',0,10)}${range('hoverBrightness','悬停亮度',100,125)}</section>
<section data-page="cards" hidden><h3>板块继承关系</h3><p class="hint">默认所有板块继承全局设置。关闭某个板块的跟随开关后，才启用该板块的独立参数。</p><h3>图片与嵌入内容</h3>${check('mediaFrames','为正文图片、贴图和嵌入内容添加圆角外框')}${range('mediaFramePadding','媒体外框内边距',0,16)}<p class="hint">自动排除导航 Logo、头像和图标；带背景图的作业/比赛侧栏封面也会裁切到卡片圆角内。</p>
${['native:普通卡片','table:题目表格','side:右侧栏','academic:学术板块'].map(x => { const [g,label] = x.split(':'); return `<h3>${label}</h3>${check(g+'FollowGlobal','跟随全局卡片设置')}${range(g+'Opacity','透明度',10,100)}${range(g+'Blur','毛玻璃',0,30)}${range(g+'Radius','圆角',0,32)}`; }).join('')}
<div class="grid"><button class="action secondary" id="hb-follow-all">全部跟随全局</button><button class="action secondary" id="hb-reset-groups">重置独立参数</button></div></section>
<section data-page="layout" hidden><h3>页面布局</h3>${check('layoutEnabled','启用布局控制')}${range('width','内容最大宽度',900,2200,20)}${range('gap','栏间距',0,48)}${range('sideWidth','侧栏宽度比例',15,45)}<div class="item"><div class="label">布局模式</div><select data-select="layoutMode"><option value="auto">自动（保持 Hydro 原布局）</option><option value="wide">宽屏双栏</option><option value="single">单栏</option></select></div>${check('compact','紧凑模式')}<div class="hint">栏间距作用于 Hydro 的标准列布局；宽屏双栏和单栏只对检测到的主内容布局容器生效。</div><h3>字体</h3>${range('fontScale','全局字号比例',85,115)}<div class="hint">缩放以 rem 和继承字号为主；网页中固定像素字号或编辑器字号可能不受影响。</div></section>
<section data-page="background" hidden><h3>背景模式</h3><div class="item"><select data-select="backgroundMode"><option value="image">图片/纯色</option><option value="gradient">渐变</option></select></div><div class="item"><label class="label">图片 URL</label><input id="hb-image-url" type="text" placeholder="https://..."></div><div class="grid"><button class="action" id="hb-image-apply">应用图片</button><button class="action secondary" id="hb-image-clear">清除图片</button></div><div class="status" id="hb-image-status">背景尚未加载</div>
${color('background','纯色背景')}${color('gradientA','渐变颜色 A')}${color('gradientB','渐变颜色 B')}${range('gradientAngle','渐变角度',0,360)}<h3>背景效果</h3>${range('opacity','图片透明度',0,100)}${range('bgBlur','背景模糊',0,20)}${range('overlay','遮罩强度',0,90)}${color('overlayColor','遮罩颜色')}${range('saturation','饱和度',0,200)}${range('brightness','亮度',20,180)}${range('contrast','对比度',20,180)}${check('noise','细微噪点纹理')}${check('enabled','启用背景层')}<div class="item"><div class="label">背景尺寸</div><select data-select="bgSize"><option>cover</option><option>contain</option><option>100% 100%</option></select></div><div class="item"><div class="label">背景位置</div><select data-select="bgPosition"><option>center</option><option>top</option><option>bottom</option><option>left</option><option>right</option></select></div></section>
<section data-page="themes" hidden><h3>内置主题</h3><div class="grid">${Object.keys(THEMES).map(k => `<button class="preset" data-theme="${k}">${k.toUpperCase()}</button>`).join('')}</div><h3>自定义主题</h3><div class="item"><input id="hb-preset-name" type="text" placeholder="方案名称"></div><div class="grid"><button class="action" id="hb-preset-save">保存当前方案</button><button class="action secondary" id="hb-preset-delete">删除选中方案</button></div><div id="hb-custom-presets"></div>${color('accent','强调色')}<div class="hint">主题切换不会覆盖背景图片 URL 和独立板块参数。</div></section>
<section data-page="tools" hidden><h3>页面诊断</h3><div class="grid"><button class="action" id="hb-scan">重新扫描卡片</button><button class="action secondary" id="hb-highlight">高亮识别结果</button></div><div class="status" id="hb-diagnostics">等待扫描</div><h3>配置管理</h3><div class="grid"><button class="action" id="hb-export">导出 JSON</button><button class="action secondary" id="hb-import">导入 JSON</button></div><input id="hb-file" type="file" accept=".json,application/json" hidden><div class="grid" style="margin-top:8px"><button class="action secondary" id="hb-copy">复制配置</button><button class="action secondary" id="hb-reset">恢复默认</button></div><h3>撤销/重做</h3><div class="grid"><button class="action secondary" id="hb-undo">撤销</button><button class="action secondary" id="hb-redo">重做</button></div><p class="hint">配置只保存在当前站点浏览器本地，不会修改 Hydro 服务端数据。</p></section>
</main><footer id="hb170-foot"><span style="font-size:11px;opacity:.65">更改自动保存</span><button id="hb-close">完成</button></footer>`;

    const history = [clone(settings)];
    let historyIndex = 0;
    function recordHistory() {
        if (JSON.stringify(history[historyIndex]) === JSON.stringify(settings)) return;
        history.splice(historyIndex + 1); history.push(clone(settings));
        if (history.length > 40) history.shift();
        historyIndex = history.length - 1;
    }
    function restoreHistory(i) {
        if (i < 0 || i >= history.length) return;
        historyIndex = i; imageToken++; settings = clone(history[i]); syncUI(); applyAll();
    }
    function groupValues(g) {
        const f = settings[g+'FollowGlobal'];
        return { opacity: f ? settings.cardOpacity : settings[g+'Opacity'], blur: f ? settings.blur : settings[g+'Blur'], radius: f ? settings.radius : settings[g+'Radius'] };
    }
    const CARD_SELECTORS = {
        academic: ['#academic-root .ac-card','.academic-root .ac-card'],
        table: ['.main .section__table-container','.main .section__table','.main table.data-table'],
        side: ['.main .section.side','.main .side.section','.main aside .section','.main .columns.medium-3 .section','.main .column--sidebar .section','.main [class*="sidebar"] .section'],
        native: ['.main .section','.main .card','.main .ui.segment','.main .panel']
    };
    const recognized = new Map();
    const counts = {academic:0,table:0,side:0,native:0};
    function classify(el) {
        if (el.closest('#hb170-panel,#hb170-trigger,#hb170-background')) return null;
        if (el.matches('#academic-root .ac-card,.academic-root .ac-card')) return 'academic';
        if (el.matches('.section__table-container,.section__table') || el.tagName === 'TABLE') return 'table';
        if (el.matches('.section.side,.side.section') || (el.closest('aside,[class*="sidebar"],.medium-3.columns,.column--sidebar') && el.matches('.section,.card,.panel,.ui.segment'))) return 'side';
        if (el.matches('.section,.card,.panel,.ui.segment,.ac-card')) return 'native';
        return null;
    }
    function setCardStyle(el, group) {
        for (const g of GROUPS) el.classList.toggle('hb170-'+g, g === group);
        el.classList.add('hb170-card');
        el.classList.toggle('hb170-follow', !!settings[group+'FollowGlobal']);
        el.classList.toggle('hb170-no-border', !settings.border);
        el.classList.toggle('hb170-table-wrap', group === 'table');
        el.style.removeProperty('--hb170-bg'); el.style.removeProperty('--hb170-blur'); el.style.removeProperty('--hb170-radius');
        el.style.setProperty('--hb170-border-width', settings.borderWidth + 'px');
        recognized.set(el, group);
    }
    function scanCards() {
        Object.keys(counts).forEach(k => counts[k] = 0);
        recognized.clear();
        const seen = new Set();
        for (const [category, selectors] of Object.entries(CARD_SELECTORS)) {
            for (const selector of selectors) for (const el of $$(selector)) {
                if (el.closest('#hb170-panel')) continue;
                const target = category === 'table' && el.tagName === 'TABLE' && el.parentElement ? el.parentElement : el;
                if (seen.has(target)) continue;
                const actual = category === 'native' ? (classify(target) || 'native') : category;
                if (actual === 'native' && target.matches('.section__table-container')) continue;
                seen.add(target); setCardStyle(target, actual); counts[actual]++;
            }
        }
        const diag = $('#hb-diagnostics', panel);
        if (diag) diag.textContent = `扫描完成：${new Date().toLocaleTimeString()}\n普通卡片：${counts.native}\n题目表格：${counts.table}\n右侧栏：${counts.side}\n学术卡片：${counts.academic}\n总计：${Object.values(counts).reduce((a,b)=>a+b,0)}\n\n提示：若某个区域没有被识别，请展开该区域并重新扫描；也可提供该元素的 HTML class 以便增加适配规则。`;
        return { ...counts };
    }
    function scanMediaFrames() {
        const roots = $$('.main .typo,.main .section__body,#academic-root .typo,.main .problem-content,.main .content');
        for (const root of roots) {
            if (root.closest('#hb170-panel,#hb170-background')) continue;
            for (const media of $$('img,video,iframe,object,embed', root)) {
                if (media.closest('.hb170-media-frame,nav,.nav,.header--mobile,.avatar,.user-avatar,.user__avatar,.problem__avatar,.icon')) continue;
                if (media.matches('.nav__logo,.header--mobile img,[class*="avatar"],[class*="logo"],[class*="icon"]')) continue;
                if (media.tagName === 'IMG' && media.closest('a')?.matches('.nav__item,.menu__link')) continue;
                const target = media.tagName === 'IMG' && media.parentElement?.tagName === 'PICTURE' ? media.parentElement : media;
                if (!target.parentNode) continue;
                const frame = document.createElement('span'); frame.className = 'hb170-media-frame'; frame.dataset.hbMediaFrame = '1';
                target.parentNode.insertBefore(frame, target); frame.appendChild(target);
            }
        }
        $$('.contest-sidebar__bg').forEach(el => el.classList.add('hb170-media-surface'));
    }
    function highlightCards() {
        const els = [...recognized.keys()]; els.forEach(el => el.classList.add('hb170-inspector-highlight'));
        setTimeout(() => els.forEach(el => el.classList.remove('hb170-inspector-highlight')), 1800);
        toast(`已高亮 ${els.length} 个识别到的卡片`);
    }
    function applyBackground() {
        bg.style.display = settings.enabled ? 'block' : 'none';
        bg.style.background = settings.backgroundMode === 'gradient' ? `linear-gradient(${settings.gradientAngle}deg,${settings.gradientA},${settings.gradientB})` : settings.background;
        bgImage.style.backgroundImage = settings.image ? `url("${String(settings.image).replace(/["\\]/g, '\\$&')}")` : 'none';
        bgImage.style.backgroundPosition = settings.bgPosition; bgImage.style.backgroundSize = settings.bgSize;
        bgImage.style.opacity = settings.opacity / 100;
        bgImage.style.filter = `blur(${settings.bgBlur}px) saturate(${settings.saturation}%) brightness(${settings.brightness}%) contrast(${settings.contrast}%)`;
        bgImage.style.display = settings.backgroundMode === 'gradient' ? 'none' : 'block';
        bgOverlay.style.background = rgba(settings.overlayColor, settings.overlay / 100);
        bgNoise.style.display = settings.noise ? 'block' : 'none';
    }
    // 保存并恢复原本的内联布局，而不直接抹掉站点自己的内联样式。
    const layoutOriginal = new Map();
    function rememberLayout(el) {
        if (!layoutOriginal.has(el)) layoutOriginal.set(el, {display:el.style.getPropertyValue('display'), displayPriority:el.style.getPropertyPriority('display'), width:el.style.getPropertyValue('width'), widthPriority:el.style.getPropertyPriority('width'), maxWidth:el.style.getPropertyValue('max-width'), maxWidthPriority:el.style.getPropertyPriority('max-width')});
    }
    function restoreLayout() {
        for (const [el, s] of layoutOriginal) {
            for (const [prop, value, priority] of [['display',s.display,s.displayPriority],['width',s.width,s.widthPriority],['max-width',s.maxWidth,s.maxWidthPriority]]) {
                if (value) el.style.setProperty(prop,value,priority); else el.style.removeProperty(prop);
            }
        }
        layoutOriginal.clear();
    }
    function applyLayoutMode() {
        restoreLayout();
        if (!settings.layoutEnabled || settings.layoutMode === 'auto') return;
        const row = $('.main .row'); if (!row) return;
        if (settings.layoutMode === 'single') {
            rememberLayout(row); row.style.display = 'block';
            [...row.children].filter(x => x.matches('.columns,[class*="column"]')).forEach(x => { rememberLayout(x); x.style.width = '100%'; x.style.maxWidth = '100%'; });
        } else if (settings.layoutMode === 'wide') {
            const side = $('.main aside,.main .medium-3.columns,.main [class*="sidebar"]');
            if (side) { rememberLayout(side); side.style.width = settings.sideWidth + '%'; }
        }
    }
    function applyAll(rescan = true) {
        const root = document.documentElement, body = document.body, darkRGB = settings.dark ? '29,32,45' : '255,255,255';
        const vars = {
            '--hb-accent':settings.accent, '--hb-global-bg':`rgba(${darkRGB},${settings.cardOpacity/100})`, '--hb-global-blur':settings.blur+'px', '--hb-global-radius':settings.radius+'px',
            '--hb-global-border':rgba(settings.dark?'#ffffff':'#465069',settings.borderOpacity/100), '--hb-global-shadow':`0 8px 28px rgba(0,0,0,${settings.shadowStrength/100})`,
            '--hb-global-padding':settings.cardPadding+'px', '--hb-media-frame-padding':settings.mediaFramePadding+'px', '--hb-page-width':settings.width+'px', '--hb-layout-gap':settings.gap+'px',
            '--hb-panel-bg':settings.dark?'rgba(30,33,46,.97)':'rgba(250,251,255,.97)', '--hb-text':settings.dark?'#f0f0f5':'#303444',
            '--hb-hover-lift':settings.hoverLift+'px', '--hb-hover-brightness':settings.hoverBrightness+'%', '--hb-font-scale':settings.fontScale/100
        };
        for (const g of GROUPS) { const v = groupValues(g); vars[`--hb-${g}-bg`] = `rgba(${darkRGB},${v.opacity/100})`; vars[`--hb-${g}-blur`] = v.blur+'px'; vars[`--hb-${g}-radius`] = v.radius+'px'; }
        Object.entries(vars).forEach(([k,v]) => root.style.setProperty(k,v));
        for (const [cls,val] of Object.entries({'transparent':settings.transparent,'layout':settings.layoutEnabled,'compact':settings.compact,'striped':settings.striped,'shadow':settings.shadow,'border-off':!settings.border,'hover':settings.hover,'media-frames':settings.mediaFrames,'light':!settings.dark})) body.classList.toggle('hb170-'+cls,!!val);
        root.classList.toggle('hb170-font-scale', Number(settings.fontScale)!==100);
        applyBackground();
        // 更新跟随状态，不必每次滑动都重新搜索 DOM。
        if (rescan) scanCards(); else for (const [el,g] of recognized) if (el.isConnected) setCardStyle(el,g);
        if (settings.mediaFrames) scanMediaFrames();
        applyLayoutMode(); save();
    }
    const units = {cardOpacity:'%',blur:'px',radius:'px',cardPadding:'px',borderOpacity:'%',borderWidth:'px',shadowStrength:'%',hoverLift:'px',hoverBrightness:'%',width:'px',gap:'px',sideWidth:'%',fontScale:'%',opacity:'%',bgBlur:'px',overlay:'%',saturation:'%',brightness:'%',contrast:'%',gradientAngle:'°',mediaFramePadding:'px'};
    function updateLabels() {
        for (const [k,u] of Object.entries(units)) { const el = $('#v-'+k,panel); if (el) el.textContent = settings[k]+u; }
        for (const g of GROUPS) for (const p of ['Opacity','Blur','Radius']) { const el = $('#v-'+g+p,panel); if (el) el.textContent = settings[g+p]+(p === 'Opacity'?'%':'px'); }
    }
    function updateGroupInputs() { for (const g of GROUPS) for (const p of ['Opacity','Blur','Radius']) { const el = $(`[data-range="${g+p}"]`,panel); if (el) el.disabled = !!settings[g+'FollowGlobal']; } }
    function updatePresetButtons() { $$('[data-theme]',panel).forEach(el => el.classList.toggle('active',el.dataset.theme===settings.preset)); }
    function renderCustomPresets() {
        const box = $('#hb-custom-presets',panel);
        box.innerHTML = Object.keys(customPresets).length ? Object.keys(customPresets).map(name => `<div class="item grid"><button class="preset" data-custom-load="${escapeHTML(name)}">${escapeHTML(name)}</button><button class="action secondary" data-custom-delete="${escapeHTML(name)}">删除</button></div>`).join('') : '<p class="hint">暂无自定义方案</p>';
        $$('[data-custom-load]',box).forEach(b => b.addEventListener('click', () => { Object.assign(settings,clone(customPresets[b.dataset.customLoad]),{preset:'custom'}); syncUI(); changed(); toast('已加载方案：'+b.dataset.customLoad); }));
        $$('[data-custom-delete]',box).forEach(b => b.addEventListener('click', () => { delete customPresets[b.dataset.customDelete]; savePresets(); renderCustomPresets(); }));
    }
    function syncUI() {
        $$('[data-range]',panel).forEach(el => el.value = settings[el.dataset.range]);
        $$('[data-check]',panel).forEach(el => el.checked = !!settings[el.dataset.check]);
        $$('[data-color]',panel).forEach(el => el.value = settings[el.dataset.color]);
        $$('[data-select]',panel).forEach(el => el.value = settings[el.dataset.select]);
        $('#hb-image-url',panel).value = settings.image || '';
        updateLabels(); updatePresetButtons(); updateGroupInputs(); renderCustomPresets();
    }
    function changed() { updateLabels(); updateGroupInputs(); applyAll(); recordHistory(); }
    panel.addEventListener('input', e => {
        const el = e.target;
        if (el.matches('[data-range]')) { settings[el.dataset.range] = Number(el.value); updateLabels(); applyAll(false); }
        else if (el.matches('[data-check]')) { settings[el.dataset.check] = el.checked; updateGroupInputs(); applyAll(false); }
        else if (el.matches('[data-color]')) { settings[el.dataset.color] = el.value; settings.preset = 'custom'; applyAll(false); updatePresetButtons(); }
    });
    panel.addEventListener('change', e => {
        const el = e.target;
        if (el.matches('[data-select]')) { settings[el.dataset.select] = el.value; applyAll(); }
        if (el.matches('[data-range],[data-check],[data-color],[data-select]')) recordHistory();
    });
    $$('[data-tab]',panel).forEach(btn => btn.addEventListener('click', () => { $$('[data-tab]',panel).forEach(x => x.classList.toggle('active',x===btn)); $$('[data-page]',panel).forEach(x => x.hidden = x.dataset.page!==btn.dataset.tab); }));
    $('#hb-follow-all',panel).addEventListener('click', () => { GROUPS.forEach(g => settings[g+'FollowGlobal']=true); syncUI(); changed(); toast('所有板块已改为跟随全局'); });
    $('#hb-reset-groups',panel).addEventListener('click', () => { GROUPS.forEach(g => {settings[g+'Opacity']=settings.cardOpacity;settings[g+'Blur']=settings.blur;settings[g+'Radius']=settings.radius;}); syncUI(); changed(); toast('独立参数已重置为当前全局值'); });
    let imageToken = 0;
    function applyImage(url) {
        const status = $('#hb-image-status',panel), token = ++imageToken, value = String(url||'').trim();
        if (!value) { settings.image=''; applyAll(false); recordHistory(); status.textContent='已清除背景图片'; return; }
        let parsed;
        try { parsed = new URL(value,location.href); } catch { status.textContent='URL 格式不正确'; return; }
        if (!['http:','https:'].includes(parsed.protocol)) { status.textContent='仅支持 HTTP/HTTPS 图片'; return; }
        status.textContent='正在检查图片...'; const img = new Image();
        img.onload = () => { if (token!==imageToken) return; settings.image=parsed.href; settings.backgroundMode='image'; syncUI(); applyAll(); recordHistory(); status.textContent=`加载成功：${img.naturalWidth} × ${img.naturalHeight}`; toast('背景图片已应用'); };
        img.onerror = () => { if (token===imageToken) status.textContent='图片加载失败，原背景保持不变'; }; img.src=parsed.href;
    }
    $('#hb-image-apply',panel).addEventListener('click', () => applyImage($('#hb-image-url',panel).value));
    $('#hb-image-clear',panel).addEventListener('click', () => { applyImage(''); $('#hb-image-url',panel).value=''; });
    $$('[data-theme]',panel).forEach(btn => btn.addEventListener('click', () => { const name=btn.dataset.theme; if (!THEMES[name]) return; Object.assign(settings,THEMES[name],{preset:name}); syncUI(); changed(); toast('已切换主题：'+name); }));
    $('#hb-preset-save',panel).addEventListener('click', () => { const name=$('#hb-preset-name',panel).value.trim(); if (!name) return toast('请先输入方案名称'); Object.defineProperty(customPresets,name,{value:clone(settings),writable:true,enumerable:true,configurable:true}); savePresets(); renderCustomPresets(); toast('方案已保存'); });
    $('#hb-preset-delete',panel).addEventListener('click', () => { const name=$('#hb-preset-name',panel).value.trim(); if (!name || !Object.prototype.hasOwnProperty.call(customPresets,name)) return toast('请输入已存在的方案名称'); delete customPresets[name]; savePresets(); renderCustomPresets(); toast('方案已删除'); });
    function downloadJSON(filename,data) { const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1200); }
    $('#hb-export',panel).addEventListener('click', () => { downloadJSON('hydro-ui-beautifier-v1.7-config.json',{app:'Hydro UI Beautifier',version:VERSION,exportedAt:new Date().toISOString(),settings,customPresets}); toast('配置已导出'); });
    const file=$('#hb-file',panel);
    $('#hb-import',panel).addEventListener('click',()=>file.click());
    file.addEventListener('change',async()=>{
        const f=file.files?.[0]; if(!f)return;
        try { const data=JSON.parse(await f.text()); const src=data.settings && typeof data.settings==='object'?data.settings:data; if(!src||typeof src!=='object'||Array.isArray(src)) throw new Error('配置结构无效'); imageToken++; settings=mergedSettings(src); if(data.customPresets && typeof data.customPresets==='object' && !Array.isArray(data.customPresets)){customPresets=data.customPresets;savePresets();} syncUI();applyAll();recordHistory();toast('配置导入成功'); }
        catch(e){toast('导入失败：'+e.message);} file.value='';
    });
    $('#hb-copy',panel).addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify({settings,customPresets},null,2));toast('配置已复制');}catch{toast('复制失败，请使用导出 JSON');}});
    $('#hb-reset',panel).addEventListener('click',()=>{if(!confirm('确定恢复全部默认设置？背景图片和自定义方案也会清空。'))return;settings=clone(DEFAULTS);customPresets={};savePresets();imageToken++;syncUI();applyAll();recordHistory();toast('已恢复默认设置');});
    $('#hb-undo',panel).addEventListener('click',()=>restoreHistory(historyIndex-1));
    $('#hb-redo',panel).addEventListener('click',()=>restoreHistory(historyIndex+1));
    $('#hb-scan',panel).addEventListener('click',()=>{scanCards();if(settings.mediaFrames)scanMediaFrames();toast('页面卡片扫描完成');});
    $('#hb-highlight',panel).addEventListener('click',highlightCards);
    trigger.addEventListener('click',()=>{panel.hidden=!panel.hidden;if(!panel.hidden)scanCards();});
    $('#hb-close',panel).addEventListener('click',()=>panel.hidden=true);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')panel.hidden=true;});

    // 修复吸底：查找 main 和页脚的共同父容器，然后在这个容器内布局。
    function applyStickyFooter() {
        const body=document.body; if(!body)return;
        const mainEl=$('#panel .main')||$('.main')||$('#main');
        const candidates=$$('#panel .footer,#panel footer,.footer,#footer,.page-footer,.footer-container').filter(el=>!el.closest('#hb170-panel'));
        const footerEl=candidates.find(el=>/Powered by Hydro|Worker|Language/i.test(el.textContent||''))||candidates[0];
        let shell=mainEl?.parentElement || null;
        while(shell && footerEl && !shell.contains(footerEl)) shell=shell.parentElement;
        const directChild=el=>{let n=el;while(n && n.parentElement!==shell)n=n.parentElement;return n;};
        let mainItem=null,footerItem=null;
        if(shell && shell!==document.documentElement && mainEl && footerEl){mainItem=directChild(mainEl);footerItem=directChild(footerEl);}
        if(!mainItem||!footerItem||mainItem===footerItem){shell=null;mainItem=null;footerItem=null;}
        $$('.hb170-sticky-shell').forEach(el=>{if(el!==shell){el.classList.remove('hb170-sticky-shell');el.style.removeProperty('--hb-shell-offset');}});
        $$('.hb170-sticky-main').forEach(el=>{if(el!==mainItem)el.classList.remove('hb170-sticky-main');});
        $$('.hb170-sticky-footer').forEach(el=>{if(el!==footerItem)el.classList.remove('hb170-sticky-footer');});
        if(!shell)return;
        const offset=shell===body?0:Math.max(0,shell.getBoundingClientRect().top+window.scrollY);
        shell.style.setProperty('--hb-shell-offset',`${offset}px`);
        shell.classList.add('hb170-sticky-shell');mainItem.classList.add('hb170-sticky-main');footerItem.classList.add('hb170-sticky-footer');
    }
    function mount() {
        if(!document.body)return;
        if(bg.parentNode!==document.body)document.body.prepend(bg);
        if(trigger.parentNode!==document.body)document.body.append(trigger);
        if(panel.parentNode!==document.body)document.body.append(panel);
    }
    // 获取 Hydro 当前响应式根字号（不把之前的缩放再计入基准）。
    function refreshBaseFontSize() {
        const root = document.documentElement;
        const scaled = root.classList.contains('hb170-font-scale');
        if (scaled) root.classList.remove('hb170-font-scale');
        const size = parseFloat(getComputedStyle(root).fontSize);
        if (scaled) root.classList.add('hb170-font-scale');
        if (Number.isFinite(size) && size > 0) root.style.setProperty('--hb-base-font-size', size + 'px');
    }
    mount(); applyStickyFooter(); syncUI(); refreshBaseFontSize(); applyAll();
    window.addEventListener('resize',()=>{refreshBaseFontSize();applyStickyFooter();});
    // 只监听页面子节点变动；忽略自己的面板和媒体包装引起的内部变化。
    let scanTimer=0;
    const observer=new MutationObserver(records=>{
        if(!records.some(r=>!r.target.closest?.('#hb170-panel,#hb170-trigger,#hb170-background,#hb170-toast')))return;
        mount(); clearTimeout(scanTimer);
        scanTimer=setTimeout(()=>{scanCards();if(settings.mediaFrames)scanMediaFrames();applyLayoutMode();applyStickyFooter();},180);
    });
    observer.observe(document.body,{childList:true,subtree:true});
    console.info(`[Hydro UI Beautifier] v${VERSION} loaded`,{initialCards:{...counts},settings});
})();

```
:::

[链接](https://zsoj.gbfish.cn/file/239/Hydro-UI-Beautifier-extension-v1.7.4%20%281%29.zip)

