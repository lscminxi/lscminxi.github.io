'use strict';

/*
 * 函数图像（```plot）与可视化图（```graph）的共享实现：
 * Hexo 正式渲染（scripts/katex.js）与后台实时预览（client/preview.js）共用同一份，
 * 两边都把围栏代码块直接生成静态 SVG —— 不依赖前端脚本，
 * 因此无脚本的预览 iframe、RSS 等场景也能看到图。
 *
 * 语法（每行一条指令，# 或 // 开头为注释，写错的行会被忽略，不会让构建失败）：
 *
 * ```plot
 * f: x^2 - 2x + 1 ; color=red ; label=抛物线
 * f: sin(x) ; color=#0f7a6a
 * points: (0,1), (1,0), (2,1) ; connect=true ; color=blue
 * x: -5, 5
 * y: -2, 10
 * grid: on
 * ```
 *
 * ```graph
 * directed: true
 * node: A ; label=起点 ; color=red
 * node: B ; x=100 ; y=60
 * edge: A -> B ; color=blue ; label=路径
 * edge: B -- A
 * ```
 * graph 里不写 x/y 的点会自动按圆环布局；边引用未声明的点会自动建点。
 * 表达式只支持 x、数字、四则运算与 ^、括号和常用函数（sin/cos/sqrt/ln…），
 * 用手写解析器求值，绝不使用 eval，恶意输入最多让这一行不画。
 */

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/* ---------------- 颜色 ---------------- */

const NAMED_COLORS = {
  red: '#e03131', 红: '#e03131', 红色: '#e03131',
  blue: '#1971c2', 蓝: '#1971c2', 蓝色: '#1971c2',
  green: '#2f9e44', 绿: '#2f9e44', 绿色: '#2f9e44',
  orange: '#e8590c', 橙: '#e8590c', 橙色: '#e8590c',
  purple: '#7048e8', 紫: '#7048e8', 紫色: '#7048e8',
  pink: '#d6336c', 粉: '#d6336c', 粉色: '#d6336c',
  teal: '#0ca678', 青: '#0ca678', 青色: '#0ca678',
  gray: '#868e96', grey: '#868e96', 灰: '#868e96', 灰色: '#868e96',
  black: '#212529', 黑: '#212529', 黑色: '#212529',
  yellow: '#f08c00', 黄: '#f08c00', 黄色: '#f08c00',
  brown: '#a0522d', 棕: '#a0522d', 棕色: '#a0522d',
};
const PALETTE = ['#4dabf7', '#ff6b6b', '#51cf66', '#ffa94d', '#b197fc', '#3bc9db', '#f06595', '#a9e34b'];

function parseColor(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim().toLowerCase();
  if (NAMED_COLORS[text]) return NAMED_COLORS[text];
  if (/^#[0-9a-f]{3}$/.test(text) || /^#[0-9a-f]{6}$/.test(text)) return text;
  return '';
}

/* ---------------- 安全的数学表达式解析（不用 eval） ---------------- */

const FUNCTIONS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log10, log10: Math.log10,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
};
const CONSTANTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
const MAX_EXPR_LENGTH = 200;
const MAX_DEPTH = 60;

function tokenizeExpression(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t') { i += 1; continue; }
    if ('+-*/^(),'.includes(ch)) { tokens.push({ type: ch }); i += 1; continue; }
    const number = /^(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(source.slice(i));
    if (number) { tokens.push({ type: 'num', value: Number(number[0]) }); i += number[0].length; continue; }
    const ident = /^[A-Za-z]+/.exec(source.slice(i));
    if (ident) { tokens.push({ type: 'ident', value: ident[0].toLowerCase() }); i += ident[0].length; continue; }
    throw new Error(`表达式里有不支持的字符：${ch}`);
  }
  return tokens;
}

/** 把表达式编译成 (x) => y；语法或名字不合法时抛错，调用方忽略该行即可。 */
function compileExpression(source) {
  if (typeof source !== 'string' || !source.trim() || source.length > MAX_EXPR_LENGTH) {
    throw new Error('表达式为空或过长');
  }
  const tokens = tokenizeExpression(source);
  let pos = 0;
  let depth = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr() {
    let value = parseTerm();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = next().type;
      value = makeBinary(op, value, parseTerm());
    }
    return value;
  }
  function makeBinary(op, left, right) {
    if (op === '+') return (x) => left(x) + right(x);
    if (op === '-') return (x) => left(x) - right(x);
    if (op === '*') return (x) => left(x) * right(x);
    if (op === '/') return (x) => left(x) / right(x);
    return (x) => Math.pow(left(x), right(x));
  }
  function parseTerm() {
    let value = parseFactor();
    for (;;) {
      const token = peek();
      if (token && (token.type === '*' || token.type === '/')) {
        const op = next().type;
        value = makeBinary(op, value, parseFactor());
      } else if (token && (token.type === 'num' || token.type === 'ident' || token.type === '(')) {
        value = makeBinary('*', value, parseFactor()); // 隐式乘法：2x、2(x+1)、(x+1)(x-1)
      } else break;
    }
    return value;
  }
  function parseFactor() {
    if (++depth > MAX_DEPTH) throw new Error('表达式嵌套过深');
    try {
      const token = peek();
      if (token && (token.type === '-' || token.type === '+')) {
        next();
        const inner = parseFactor();
        return token.type === '-' ? (x) => -inner(x) : inner;
      }
      const base = parsePrimary();
      if (peek() && peek().type === '^') {
        next();
        return makeBinary('^', base, parseFactor());
      }
      return base;
    } finally { depth -= 1; }
  }
  function parsePrimary() {
    const token = next();
    if (!token) throw new Error('表达式不完整');
    if (token.type === 'num') return () => token.value;
    if (token.type === '(') {
      const inner = parseExpr();
      if (!next() || tokens[pos - 1].type !== ')') throw new Error('括号不配对');
      return inner;
    }
    if (token.type === 'ident') {
      if (token.value === 'x') return (x) => x;
      if (Object.hasOwn(CONSTANTS, token.value)) return () => CONSTANTS[token.value];
      if (Object.hasOwn(FUNCTIONS, token.value)) {
        if (!next() || tokens[pos - 1].type !== '(') throw new Error(`函数 ${token.value} 后面需要括号`);
        const arg = parseExpr();
        if (!next() || tokens[pos - 1].type !== ')') throw new Error('括号不配对');
        const fn = FUNCTIONS[token.value];
        return (x) => fn(arg(x));
      }
      throw new Error(`不认识的名字：${token.value}`);
    }
    throw new Error('表达式语法错误');
  }

  const fn = parseExpr();
  if (pos !== tokens.length) throw new Error('表达式后面有多余内容');
  return fn;
}

/* ---------------- 规格解析的公共小工具 ---------------- */

function splitOptions(text) {
  // `内容 ; color=red ; label=名称` → [内容, {color, label}]
  const parts = String(text).split(';');
  const options = {};
  for (const part of parts.slice(1)) {
    const match = /^\s*([A-Za-z\u4e00-\u9fa5]+)\s*=\s*(.*?)\s*$/.exec(part);
    if (match) options[match[1].toLowerCase()] = match[2];
  }
  return [parts[0].trim(), options];
}

const truthy = (value, fallback) => {
  if (value === undefined) return fallback;
  return !/^(0|false|off|no|否|关)$/i.test(String(value).trim());
};
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const finitePair = (text) => {
  const match = /(-?\d+\.?\d*)\s*(?:,|\.\.|~|到)\s*(-?\d+\.?\d*)/.exec(String(text));
  if (!match) return null;
  const a = Number(match[1]); const b = Number(match[2]);
  return a < b ? [a, b] : null;
};
const parsePoints = (text) => {
  const points = [];
  for (const match of String(text).matchAll(/\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)/g)) {
    points.push([Number(match[1]), Number(match[2])]);
    if (points.length >= 100) break;
  }
  return points;
};
const fmt = (value) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
const labelText = (value, max = 40) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/* ---------------- 函数图像 ```plot ---------------- */

const PLOT_W = 680; const PLOT_H = 420;
const PLOT_PAD = { left: 50, right: 16, top: 16, bottom: 38 };

function parsePlotSpec(source) {
  const spec = { functions: [], pointSets: [], xRange: [-10, 10], yRange: null, grid: true, title: '' };
  for (const rawLine of String(source).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    let match;
    if ((match = /^title\s*[:：]\s*(.+)$/i.exec(line))) { spec.title = labelText(match[1]); continue; }
    if ((match = /^grid\s*[:：]\s*(.+)$/i.exec(line))) { spec.grid = truthy(match[1], true); continue; }
    if ((match = /^[xX]\s*[:：]\s*(.+)$/.exec(line))) { spec.xRange = finitePair(match[1]) || spec.xRange; continue; }
    if ((match = /^[yY]\s*[:：]\s*(.+)$/.exec(line))) { spec.yRange = finitePair(match[1]) || spec.yRange; continue; }
    if ((match = /^(?:points?|pts|点)\s*[:：]\s*(.+)$/i.exec(line))) {
      const [body, options] = splitOptions(match[1]);
      const points = parsePoints(body);
      if (points.length) {
        spec.pointSets.push({
          points,
          connect: truthy(options.connect ?? options.line, false),
          color: parseColor(options.color) || '',
          size: clamp(options.size, 2, 9, 4),
          label: labelText(options.label || ''),
        });
      }
      continue;
    }
    if ((match = /^line\s*[:：]\s*(.+)$/i.exec(line))) {
      const [body, options] = splitOptions(match[1]);
      const points = parsePoints(body);
      if (points.length > 1) {
        spec.pointSets.push({
          points, connect: true,
          color: parseColor(options.color) || '',
          size: clamp(options.size, 0, 9, 0),
          label: labelText(options.label || ''),
        });
      }
      continue;
    }
    if ((match = /^(?:f(?:\(x\))?|y)\s*[:=：]\s*(.+)$/i.exec(line))) {
      const [expr, options] = splitOptions(match[1]);
      try {
        spec.functions.push({
          fn: compileExpression(expr),
          expr,
          color: parseColor(options.color) || '',
          label: labelText(options.label || ''),
          width: clamp(options.width, 1, 6, 2.5),
          dash: truthy(options.dash, false),
        });
      } catch { /* 这一行表达式写错了：忽略，不画也不报错 */ }
      if (spec.functions.length >= 8) break;
      continue;
    }
    // 不认识的行当作函数表达式试一次（允许直接写 `x^2+1` 一行一个函数）
    if (!line.includes(':') && !line.includes('：')) {
      try {
        spec.functions.push({ fn: compileExpression(line), expr: line, color: '', label: '', width: 2.5, dash: false });
        if (spec.functions.length >= 8) break;
      } catch { /* 忽略 */ }
    }
  }
  spec.functions.forEach((item, index) => { item.color = item.color || PALETTE[index % PALETTE.length]; });
  spec.pointSets.forEach((item, index) => { item.color = item.color || PALETTE[(spec.functions.length + index) % PALETTE.length]; });
  return spec;
}

function niceStep(range, target = 5) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const step of [1, 2, 5, 10]) if (raw <= step * mag) return step * mag;
  return 10 * mag;
}

function renderPlotSvg(spec) {
  const [xMin, xMax] = spec.xRange;
  const plotW = PLOT_W - PLOT_PAD.left - PLOT_PAD.right;
  const plotH = PLOT_H - PLOT_PAD.top - PLOT_PAD.bottom;
  const SAMPLES = 240;

  // 先采样定 y 范围（没写 y: 时自动）
  const sampled = spec.functions.map((item) => {
    const values = [];
    for (let i = 0; i <= SAMPLES; i += 1) {
      const x = xMin + (xMax - xMin) * (i / SAMPLES);
      let y = NaN;
      try { y = item.fn(x); } catch { y = NaN; }
      values.push([x, y]);
    }
    return values;
  });
  let [yMin, yMax] = spec.yRange || [Infinity, -Infinity];
  if (!spec.yRange) {
    for (const values of sampled) for (const [, y] of values) {
      if (Number.isFinite(y)) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
    }
    for (const set of spec.pointSets) for (const [, y] of set.points) {
      yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) { yMin = -10; yMax = 10; }
    if (yMax - yMin < 1e-9) { yMin -= 1; yMax += 1; }
    const pad = (yMax - yMin) * 0.12;
    yMin -= pad; yMax += pad;
  }

  const px = (x) => PLOT_PAD.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const py = (y) => PLOT_PAD.top + ((yMax - y) / (yMax - yMin)) * plotH;
  const out = [`<svg class="md-plot-svg" viewBox="0 0 ${PLOT_W} ${PLOT_H}" role="img" aria-label="${escape(spec.title || '函数图像')}" preserveAspectRatio="xMidYMid meet">`];

  // 网格与刻度
  const xStep = niceStep(xMax - xMin); const yStep = niceStep(yMax - yMin);
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    const sx = px(x);
    if (spec.grid) out.push(`<line class="plot-grid" x1="${fmt(sx)}" y1="${PLOT_PAD.top}" x2="${fmt(sx)}" y2="${PLOT_PAD.top + plotH}"/>`);
    if (Math.abs(x) > xStep / 100) out.push(`<text class="plot-tick" x="${fmt(sx)}" y="${PLOT_PAD.top + plotH + 16}" text-anchor="middle">${fmt(Math.round(x * 1e6) / 1e6)}</text>`);
  }
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    const sy = py(y);
    if (spec.grid) out.push(`<line class="plot-grid" x1="${PLOT_PAD.left}" y1="${fmt(sy)}" x2="${PLOT_PAD.left + plotW}" y2="${fmt(sy)}"/>`);
    if (Math.abs(y) > yStep / 100) out.push(`<text class="plot-tick" x="${PLOT_PAD.left - 6}" y="${fmt(sy + 3)}" text-anchor="end">${fmt(Math.round(y * 1e6) / 1e6)}</text>`);
  }
  // 坐标轴
  if (yMin < 0 && yMax > 0) out.push(`<line class="plot-axis" x1="${PLOT_PAD.left}" y1="${fmt(py(0))}" x2="${PLOT_PAD.left + plotW}" y2="${fmt(py(0))}"/>`);
  if (xMin < 0 && xMax > 0) out.push(`<line class="plot-axis" x1="${fmt(px(0))}" y1="${PLOT_PAD.top}" x2="${fmt(px(0))}" y2="${PLOT_PAD.top + plotH}"/>`);
  out.push(`<text class="plot-tick" x="${fmt(PLOT_PAD.left + plotW)}" y="${fmt(PLOT_PAD.top + plotH + 16)}" text-anchor="end">x</text>`);
  out.push(`<text class="plot-tick" x="${fmt(PLOT_PAD.left - 6)}" y="${fmt(PLOT_PAD.top - 4)}" text-anchor="end">y</text>`);

  // 函数曲线：不连续处断开（跳变超过画布高度就另起一段）
  spec.functions.forEach((item, index) => {
    const values = sampled[index];
    let path = '';
    let prev = null;
    for (const [x, y] of values) {
      if (!Number.isFinite(y) || y < yMin || y > yMax) { prev = null; continue; }
      const sx = px(x); const sy = py(y);
      if (!prev || Math.abs(sy - prev[1]) > plotH * 1.2) path += `M${fmt(sx)} ${fmt(sy)}`;
      else path += `L${fmt(sx)} ${fmt(sy)}`;
      prev = [sx, sy];
    }
    if (path) {
      out.push(`<path class="plot-curve" d="${path}" fill="none" stroke="${item.color}" stroke-width="${item.width}"${item.dash ? ' stroke-dasharray="7 5"' : ''}/>`);
    }
    if (item.label) {
      // 标签放在曲线在 x=75% 处附近（取最近采样点）
      const probe = values[Math.floor(SAMPLES * 0.75)];
      const anchor = Number.isFinite(probe?.[1]) && probe[1] >= yMin && probe[1] <= yMax ? probe : values.find(([, y]) => Number.isFinite(y) && y >= yMin && y <= yMax);
      if (anchor) out.push(`<text class="plot-label" x="${fmt(px(anchor[0]) + 6)}" y="${fmt(py(anchor[1]) - 6)}" fill="${item.color}">${escape(item.label)}</text>`);
    }
  });

  // 散点 / 连点成线
  for (const set of spec.pointSets) {
    const inside = set.points.filter(([x, y]) => x >= xMin && x <= xMax && y >= yMin && y <= yMax);
    if (set.connect && inside.length > 1) {
      const d = inside.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(px(x))} ${fmt(py(y))}`).join('');
      out.push(`<path d="${d}" fill="none" stroke="${set.color}" stroke-width="2"/>`);
    }
    if (set.size > 0) {
      for (const [x, y] of inside) out.push(`<circle cx="${fmt(px(x))}" cy="${fmt(py(y))}" r="${set.size}" fill="${set.color}"/>`);
    }
    if (set.label && inside.length) {
      const [x, y] = inside[0];
      out.push(`<text class="plot-label" x="${fmt(px(x) + 8)}" y="${fmt(py(y) - 8)}" fill="${set.color}">${escape(set.label)}</text>`);
    }
  }

  out.push('</svg>');
  const caption = spec.title ? `<figcaption>${escape(spec.title)}</figcaption>` : '';
  return `<figure class="md-plot">${out.join('')}${caption}</figure>\n`;
}

/* ---------------- 可视化图 ```graph ---------------- */

const NODE_ID = /^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/;

function parseGraphSpec(source) {
  const spec = { directed: false, nodes: new Map(), edges: [], title: '' };
  const ensureNode = (id) => {
    if (!spec.nodes.has(id)) spec.nodes.set(id, { id, label: '', x: null, y: null, color: '', size: 16 });
    return spec.nodes.get(id);
  };
  const addEdge = (from, to, arrow, options) => {
    if (spec.edges.length >= 120) return;
    ensureNode(from); ensureNode(to);
    spec.edges.push({
      from, to,
      directed: spec.directed && arrow,
      color: parseColor(options.color) || '',
      label: labelText(options.label || ''),
      dash: truthy(options.dash, false),
    });
  };
  for (const rawLine of String(source).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    let match;
    if ((match = /^title\s*[:：]\s*(.+)$/i.exec(line))) { spec.title = labelText(match[1]); continue; }
    if ((match = /^(?:directed|type|有向)\s*[:：]\s*(.+)$/i.exec(line))) {
      spec.directed = /directed|true|on|yes|有向/i.test(match[1]);
      continue;
    }
    if ((match = /^(?:node|点|顶点)\s*[:：]\s*(.+)$/i.exec(line))) {
      const [body, options] = splitOptions(match[1]);
      const id = body.trim();
      if (NODE_ID.test(id) && spec.nodes.size < 60) {
        const node = ensureNode(id);
        node.label = labelText(options.label || '');
        node.color = parseColor(options.color) || node.color;
        node.size = clamp(options.size ?? options.r, 10, 30, node.size);
        const x = Number(options.x); const y = Number(options.y);
        if (options.x !== undefined && Number.isFinite(x)) node.x = x;
        if (options.y !== undefined && Number.isFinite(y)) node.y = y;
      }
      continue;
    }
    if ((match = /^(?:edge|边)\s*[:：]\s*(.+)$/i.exec(line))) {
      const [body, options] = splitOptions(match[1]);
      const edgeMatch = /^(\S+)\s*(->|-->|—>|--|-)\s*(\S+)$/.exec(body.trim());
      if (edgeMatch && NODE_ID.test(edgeMatch[1]) && NODE_ID.test(edgeMatch[3])) {
        addEdge(edgeMatch[1], edgeMatch[3], edgeMatch[2].includes('>'), options);
      }
      continue;
    }
    // 简写：单独一行 `A -> B` / `A -- B`
    const shorthand = /^(\S+)\s*(->|-->|--|-)\s*(\S+)$/.exec(line);
    if (shorthand && NODE_ID.test(shorthand[1]) && NODE_ID.test(shorthand[3])) {
      addEdge(shorthand[1], shorthand[3], shorthand[2].includes('>'), {});
    }
  }
  return spec;
}

function layoutGraph(spec) {
  const nodes = [...spec.nodes.values()];
  const placed = nodes.filter((node) => node.x !== null && node.y !== null);
  const unplaced = nodes.filter((node) => node.x === null || node.y === null);
  if (unplaced.length) {
    const cx = placed.length ? placed.reduce((sum, n) => sum + n.x, 0) / placed.length : 0;
    const cy = placed.length ? placed.reduce((sum, n) => sum + n.y, 0) / placed.length : 0;
    let radius = 110;
    if (placed.length) {
      radius = Math.max(90, ...placed.map((n) => Math.hypot(n.x - cx, n.y - cy) + 70));
    }
    unplaced.forEach((node, index) => {
      const angle = (index / unplaced.length) * Math.PI * 2 - Math.PI / 2;
      node.x = cx + radius * Math.cos(angle);
      node.y = cy + radius * Math.sin(angle);
    });
  }
  return nodes;
}

function renderGraphSvg(spec) {
  const nodes = layoutGraph(spec);
  if (!nodes.length) return `<figure class="md-graph"><svg class="md-graph-svg" viewBox="0 0 200 60" role="img" aria-label="空图"></svg></figure>\n`;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const pad = 52;
  let minX = Math.min(...nodes.map((n) => n.x)); let maxX = Math.max(...nodes.map((n) => n.x));
  let minY = Math.min(...nodes.map((n) => n.y)); let maxY = Math.max(...nodes.map((n) => n.y));
  if (maxX - minX < 1) { minX -= 60; maxX += 60; }
  if (maxY - minY < 1) { minY -= 60; maxY += 60; }
  const W = 680;
  const scale = (W - pad * 2) / (maxX - minX);
  const H = Math.min(560, Math.max(220, (maxY - minY) * scale + pad * 2));
  const yScale = (H - pad * 2) / (maxY - minY);
  const sx = (x) => pad + (x - minX) * scale;
  const sy = (y) => pad + (y - minY) * yScale; // 屏幕坐标：y 越大越靠下（与画图习惯一致，声明坐标即屏幕方向）

  const out = [`<svg class="md-graph-svg" viewBox="0 0 ${W} ${fmt(H)}" role="img" aria-label="${escape(spec.title || '可视化图')}" preserveAspectRatio="xMidYMid meet">`];

  // 边（同对点的多条边用弧线错开）
  const pairCount = new Map();
  const arrow = (x, y, angle, color) => {
    const size = 9;
    const a1 = angle + Math.PI * 0.82; const a2 = angle - Math.PI * 0.82;
    const fill = color ? ` fill="${color}"` : ' class="graph-arrow"';
    return `<polygon points="${fmt(x)},${fmt(y)} ${fmt(x + size * Math.cos(a1))},${fmt(y + size * Math.sin(a1))} ${fmt(x + size * Math.cos(a2))},${fmt(y + size * Math.sin(a2))}"${fill}/>`;
  };
  for (const edge of spec.edges) {
    const a = byId.get(edge.from); const b = byId.get(edge.to);
    if (!a || !b) continue;
    const color = edge.color || '';
    const strokeAttr = edge.color ? ` stroke="${edge.color}"` : ' class="graph-edge"';
    const dash = edge.dash ? ' stroke-dasharray="6 5"' : '';
    const x1 = sx(a.x); const y1 = sy(a.y); const x2 = sx(b.x); const y2 = sy(b.y);
    if (edge.from === edge.to) {
      // 自环：点上方画一个小圆
      const r = a.size + 8;
      out.push(`<circle cx="${fmt(x1)}" cy="${fmt(y1 - a.size - r + 6)}" r="${fmt(r - 4)}" fill="none"${edge.color ? ` stroke="${edge.color}"` : ' class="graph-edge"'} stroke-width="2"${dash}/>`);
      if (edge.directed) out.push(arrow(x1 + (r - 4) * 0.72, y1 - a.size - r + 6 - (r - 4) * 0.72, Math.PI / 4, color));
      if (edge.label) out.push(`<text class="graph-edge-label" x="${fmt(x1)}" y="${fmt(y1 - a.size - 2 * r - 2)}" text-anchor="middle">${escape(edge.label)}</text>`);
      continue;
    }
    const key = edge.directed ? `${edge.from}>${edge.to}` : [edge.from, edge.to].sort().join('|');
    const count = pairCount.get(key) || 0;
    pairCount.set(key, count + 1);
    const dx = x2 - x1; const dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist; const uy = dy / dist;
    const offset = count === 0 ? 0 : Math.ceil(count / 2) * 22 * (count % 2 ? 1 : -1);
    const mx = (x1 + x2) / 2 - uy * offset; const my = (y1 + y2) / 2 + ux * offset;
    // 端点收到圆边上
    const startX = x1 + ux * a.size; const startY = y1 + uy * a.size;
    let endX = x2 - ux * b.size; let endY = y2 - uy * b.size;
    let labelX = mx; let labelY = my;
    if (offset === 0) {
      out.push(`<line x1="${fmt(startX)}" y1="${fmt(startY)}" x2="${fmt(endX)}" y2="${fmt(endY)}"${strokeAttr} stroke-width="2"${dash}/>`);
      if (edge.directed) out.push(arrow(endX, endY, Math.atan2(uy, ux), color));
      labelX = (startX + endX) / 2; labelY = (startY + endY) / 2 - 5;
    } else {
      // 弧线：二次贝塞尔，终点方向按曲线在 t=1 的切线
      const cxp = (x1 + x2) / 2 - uy * offset * 2; const cyp = (y1 + y2) / 2 + ux * offset * 2;
      const tx = endX - cxp; const ty = endY - cyp; const tl = Math.hypot(tx, ty) || 1;
      endX = x2 - (tx / tl) * b.size; endY = y2 - (ty / tl) * b.size;
      out.push(`<path d="M${fmt(startX)} ${fmt(startY)} Q${fmt(cxp)} ${fmt(cyp)} ${fmt(endX)} ${fmt(endY)}" fill="none"${strokeAttr} stroke-width="2"${dash}/>`);
      if (edge.directed) out.push(arrow(endX, endY, Math.atan2(ty, tx), color));
      labelX = 0.25 * startX + 0.5 * cxp + 0.25 * endX; labelY = 0.25 * startY + 0.5 * cyp + 0.25 * endY - 5;
    }
    if (edge.label) out.push(`<text class="graph-edge-label" x="${fmt(labelX)}" y="${fmt(labelY)}" text-anchor="middle">${escape(edge.label)}</text>`);
  }

  // 点（画在边上面）
  for (const node of nodes) {
    const x = sx(node.x); const y = sy(node.y);
    const fillAttr = node.color ? ` fill="${node.color}"` : '';
    out.push(`<circle class="graph-node"${fillAttr} cx="${fmt(x)}" cy="${fmt(y)}" r="${node.size}"/>`);
    const text = node.label || node.id;
    out.push(`<text class="graph-node-label${node.color ? ' on-color' : ''}" x="${fmt(x)}" y="${fmt(y + 4)}" text-anchor="middle">${escape(text.slice(0, 8))}</text>`);
    if (node.label && node.label !== node.id && node.id !== text) {
      out.push(`<text class="graph-node-sub" x="${fmt(x)}" y="${fmt(y + node.size + 15)}" text-anchor="middle">${escape(node.id)}</text>`);
    }
  }

  out.push('</svg>');
  const caption = spec.title ? `<figcaption>${escape(spec.title)}</figcaption>` : '';
  return `<figure class="md-graph">${out.join('')}${caption}</figure>\n`;
}

/* ---------------- Marked 扩展：```plot / ```graph 围栏 ---------------- */

const FENCE_OPEN = /^```(plot|graph)[ \t]*(?:\n|$)/;
const FENCE_CLOSE = /^```[ \t]*$/;

function makeExtension(kind) {
  return {
    name: `${kind}Block`,
    level: 'block',
    start(src) {
      const match = new RegExp(`(?:^|\\n)\`\`\`${kind}[ \\t]*(?=\\n|$)`).exec(src);
      if (match) return match.index + (match[0].startsWith('\n') ? 1 : 0);
      return undefined;
    },
    tokenizer(src) {
      const open = FENCE_OPEN.exec(src);
      if (!open || open[1] !== kind) return undefined;
      const lines = src.slice(open[0].length).split('\n');
      let consumed = open[0].length;
      const body = [];
      for (const line of lines) {
        if (FENCE_CLOSE.test(line)) {
          const raw = src.slice(0, consumed + line.length + 1);
          return { type: `${kind}Block`, raw, text: body.join('\n') };
        }
        body.push(line);
        consumed += line.length + 1;
        if (body.length > 300) break;
      }
      return undefined; // 没写结束围栏：当普通代码块处理，别吞掉后文
    },
    renderer(token) {
      try {
        return kind === 'plot' ? renderPlotSvg(parsePlotSpec(token.text)) : renderGraphSvg(parseGraphSpec(token.text));
      } catch {
        return '<figure class="md-plot md-plot-error"><p>图形生成失败，请检查语法。</p></figure>\n';
      }
    },
  };
}

module.exports = function plotExtensions() {
  return { extensions: [makeExtension('plot'), makeExtension('graph')] };
};
module.exports.compileExpression = compileExpression;
module.exports.parsePlotSpec = parsePlotSpec;
module.exports.renderPlotSvg = renderPlotSvg;
module.exports.parseGraphSpec = parseGraphSpec;
module.exports.renderGraphSvg = renderGraphSvg;
module.exports.parseColor = parseColor;
