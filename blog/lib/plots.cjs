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
  const spec = {
    functions: [], pointSets: [], xRange: [-10, 10], yRange: null,
    grid: true, coords: true, intersections: true, equations: true, interactive: true, title: '',
  };
  for (const rawLine of String(source).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    let match;
    if ((match = /^title\s*[:：]\s*(.+)$/i.exec(line))) { spec.title = labelText(match[1]); continue; }
    if ((match = /^grid\s*[:：]\s*(.+)$/i.exec(line))) { spec.grid = truthy(match[1], true); continue; }
    if ((match = /^(?:coords?|coordinates|坐标)\s*[:：]\s*(.+)$/i.exec(line))) { spec.coords = truthy(match[1], true); continue; }
    if ((match = /^(?:intersections?|交点)\s*[:：]\s*(.+)$/i.exec(line))) { spec.intersections = truthy(match[1], true); continue; }
    if ((match = /^(?:equations?|方程)\s*[:：]\s*(.+)$/i.exec(line))) { spec.equations = truthy(match[1], true); continue; }
    if ((match = /^(?:interactive|交互)\s*[:：]\s*(.+)$/i.exec(line))) { spec.interactive = truthy(match[1], true); continue; }
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
          size: clamp(options.size, 2, 9, 5),
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

function formatNumber(value, digits = 4) {
  if (!Number.isFinite(value)) return '';
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

const coordinateText = (x, y) => `(${formatNumber(x)}, ${formatNumber(y)})`;

function lineEquation([x1, y1], [x2, y2]) {
  if (![x1, y1, x2, y2].every(Number.isFinite) || (x1 === x2 && y1 === y2)) return '';
  if (Math.abs(x2 - x1) < 1e-12) return `x = ${formatNumber(x1)}`;
  const slope = (y2 - y1) / (x2 - x1);
  const intercept = y1 - slope * x1;
  if (Math.abs(slope) < 1e-12) return `y = ${formatNumber(y1)}`;
  const slopeText = Math.abs(slope - 1) < 1e-12 ? 'x' : Math.abs(slope + 1) < 1e-12 ? '-x' : `${formatNumber(slope)}x`;
  if (Math.abs(intercept) < 1e-12) return `y = ${slopeText}`;
  return `y = ${slopeText} ${intercept > 0 ? '+' : '-'} ${formatNumber(Math.abs(intercept))}`;
}

function getPlotSegments(spec) {
  const segments = [];
  spec.pointSets.forEach((set, setIndex) => {
    if (!set.connect) return;
    for (let index = 0; index < set.points.length - 1; index += 1) {
      const from = set.points[index];
      const to = set.points[index + 1];
      if (from[0] === to[0] && from[1] === to[1]) continue;
      segments.push({ setIndex, segmentIndex: index, from, to, color: set.color, label: set.label || '' });
    }
  });
  return segments;
}

function getPlotEquations(spec) {
  const equations = [];
  spec.functions.forEach((item, index) => {
    equations.push({ type: 'function', index, color: item.color, label: item.label || '', text: `y = ${item.expr}` });
  });
  for (const segment of getPlotSegments(spec)) {
    const text = lineEquation(segment.from, segment.to);
    if (text) equations.push({ type: 'segment', ...segment, text });
  }
  return equations;
}

function resolvePlotRanges(spec) {
  const xRange = [...spec.xRange];
  if (spec.yRange) return { xRange, yRange: [...spec.yRange] };
  let yMin = Infinity;
  let yMax = -Infinity;
  const SAMPLES = 240;
  for (const item of spec.functions) {
    for (let index = 0; index <= SAMPLES; index += 1) {
      const x = xRange[0] + (xRange[1] - xRange[0]) * (index / SAMPLES);
      let y = NaN;
      try { y = item.fn(x); } catch { y = NaN; }
      if (Number.isFinite(y)) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
    }
  }
  for (const set of spec.pointSets) {
    for (const [, y] of set.points) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) { yMin = -10; yMax = 10; }
  if (yMax - yMin < 1e-9) { yMin -= 1; yMax += 1; }
  const pad = (yMax - yMin) * 0.12;
  return { xRange, yRange: [yMin - pad, yMax + pad] };
}

const safeY = (fn, x) => {
  try {
    const y = fn(x);
    return Number.isFinite(y) ? y : NaN;
  } catch { return NaN; }
};

function dedupePlotPoints(points, xRange, yRange) {
  const xTolerance = Math.max((xRange[1] - xRange[0]) * 0.004, 1e-8);
  const yTolerance = Math.max((yRange[1] - yRange[0]) * 0.004, 1e-8);
  const out = [];
  for (const point of [...points].sort((a, b) => a.x - b.x || a.y - b.y)) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (point.x < xRange[0] - xTolerance || point.x > xRange[1] + xTolerance) continue;
    if (point.y < yRange[0] - yTolerance || point.y > yRange[1] + yTolerance) continue;
    if (out.some((item) => Math.abs(item.x - point.x) <= xTolerance && Math.abs(item.y - point.y) <= yTolerance)) continue;
    out.push(point);
    if (out.length >= 50) break;
  }
  return out;
}

function scanDifference(diff, yAt, xMin, xMax, yRange, kind, label, points) {
  const steps = 420;
  const tolerance = Math.max((yRange[1] - yRange[0]) * 0.0015, 1e-7);
  let prevX = xMin;
  let prevDiff = diff(prevX);
  let inZeroRun = false;
  const accept = (x, currentDiff = diff(x)) => {
    let candidate = x;
    // 采样点只是接近零点时，用前后两点做一次线性插值，避免坐标差出一个采样步长。
    if (Number.isFinite(prevDiff) && Math.abs(currentDiff - prevDiff) > 1e-12) {
      const estimate = prevX - (prevDiff * (x - prevX)) / (currentDiff - prevDiff);
      if (estimate >= Math.min(prevX, x) - (xMax - xMin) / steps && estimate <= Math.max(prevX, x) + (xMax - xMin) / steps) candidate = estimate;
    }
    const y = yAt(candidate);
    if (!Number.isFinite(y) || Math.abs(diff(candidate)) > Math.max(tolerance * 20, 1e-5)) return;
    points.push({ x: candidate, y, kind, label });
  };
  for (let index = 1; index <= steps; index += 1) {
    const x = xMin + (xMax - xMin) * (index / steps);
    const currentDiff = diff(x);
    if (!Number.isFinite(currentDiff)) { prevX = x; prevDiff = NaN; inZeroRun = false; continue; }
    if (Math.abs(currentDiff) <= tolerance) {
      if (!inZeroRun) accept(x, currentDiff);
      inZeroRun = true;
    } else {
      if (Number.isFinite(prevDiff) && Math.abs(prevDiff) > tolerance && currentDiff * prevDiff < 0) {
        let low = prevX;
        let high = x;
        let lowDiff = prevDiff;
        for (let iteration = 0; iteration < 56; iteration += 1) {
          const middle = (low + high) / 2;
          const middleDiff = diff(middle);
          if (!Number.isFinite(middleDiff)) break;
          if (lowDiff * middleDiff <= 0) high = middle;
          else { low = middle; lowDiff = middleDiff; }
        }
        accept((low + high) / 2);
      }
      inZeroRun = false;
    }
    prevX = x;
    prevDiff = currentDiff;
  }
}

function segmentYAt(segment, x) {
  const [x1, y1] = segment.from;
  const [x2, y2] = segment.to;
  if (Math.abs(x2 - x1) < 1e-12) return NaN;
  return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
}

function findPlotIntersections(spec, xRange, yRange) {
  const [xMin, xMax] = xRange;
  const points = [];
  const segments = getPlotSegments(spec);

  // 曲线与坐标轴的交点（零点 / y 轴截距）
  for (const item of spec.functions) {
    scanDifference((x) => safeY(item.fn, x), () => 0, xMin, xMax, yRange, 'axis', '与 x 轴交点', points);
    if (xMin <= 0 && xMax >= 0) {
      const y = safeY(item.fn, 0);
      if (Number.isFinite(y)) points.push({ x: 0, y, kind: 'axis', label: '与 y 轴交点' });
    }
  }

  // 曲线之间
  for (let left = 0; left < spec.functions.length; left += 1) {
    for (let right = left + 1; right < spec.functions.length; right += 1) {
      const a = spec.functions[left].fn;
      const b = spec.functions[right].fn;
      scanDifference((x) => safeY(a, x) - safeY(b, x), (x) => safeY(a, x), xMin, xMax, yRange, 'intersection', '曲线交点', points);
    }
  }

  // 曲线与连点线段、线段与坐标轴
  for (const segment of segments) {
    const [sx1, sy1] = segment.from;
    const [sx2, sy2] = segment.to;
    const segMinX = Math.min(sx1, sx2);
    const segMaxX = Math.max(sx1, sx2);
    if (Math.min(sy1, sy2) <= 0 && Math.max(sy1, sy2) >= 0 && Math.abs(sy2 - sy1) > 1e-12) {
      const x = sx1 + ((0 - sy1) * (sx2 - sx1)) / (sy2 - sy1);
      points.push({ x, y: 0, kind: 'axis', label: '线段与 x 轴交点' });
    }
    if (segMinX <= 0 && segMaxX >= 0 && Math.abs(sx2 - sx1) > 1e-12) {
      points.push({ x: 0, y: segmentYAt(segment, 0), kind: 'axis', label: '线段与 y 轴交点' });
    }
    for (const item of spec.functions) {
      if (Math.abs(sx2 - sx1) < 1e-12) {
        const y = safeY(item.fn, sx1);
        if (Number.isFinite(y) && y >= Math.min(sy1, sy2) && y <= Math.max(sy1, sy2)) {
          points.push({ x: sx1, y, kind: 'intersection', label: '曲线与线段交点' });
        }
        continue;
      }
      scanDifference(
        (x) => safeY(item.fn, x) - segmentYAt(segment, x),
        (x) => safeY(item.fn, x),
        Math.max(xMin, segMinX), Math.min(xMax, segMaxX), yRange, 'intersection', '曲线与线段交点', points,
      );
    }
  }

  // 线段之间（标准两线段求交）
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      const a = segments[left];
      const b = segments[right];
      const x1 = a.from[0]; const y1 = a.from[1]; const x2 = a.to[0]; const y2 = a.to[1];
      const x3 = b.from[0]; const y3 = b.from[1]; const x4 = b.to[0]; const y4 = b.to[1];
      const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(denominator) < 1e-12) continue;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
      const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      points.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), kind: 'intersection', label: '线段交点' });
    }
  }

  return dedupePlotPoints(points, xRange, yRange);
}

function clipSegmentToRange(segment, xRange, yRange) {
  let [x1, y1] = segment.from;
  const [x2, y2] = segment.to;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;
  const edges = [
    [-dx, x1 - xRange[0]], [dx, xRange[1] - x1],
    [-dy, y1 - yRange[0]], [dy, yRange[1] - y1],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
    const ratio = q / p;
    if (p < 0) tMin = Math.max(tMin, ratio);
    else tMax = Math.min(tMax, ratio);
    if (tMin > tMax) return null;
  }
  return [
    [x1 + dx * tMin, y1 + dy * tMin],
    [x1 + dx * tMax, y1 + dy * tMax],
  ];
}

function renderPlotSvgInner(spec, options = {}) {
  const initialRanges = resolvePlotRanges(spec);
  const [xMin, xMax] = options.xRange || initialRanges.xRange;
  const [yMin, yMax] = options.yRange || initialRanges.yRange;
  const showCoords = options.showCoords ?? spec.coords;
  const showIntersections = options.showIntersections ?? spec.intersections;
  const plotW = PLOT_W - PLOT_PAD.left - PLOT_PAD.right;
  const plotH = PLOT_H - PLOT_PAD.top - PLOT_PAD.bottom;
  const SAMPLES = 260;

  const sampled = spec.functions.map((item) => {
    const values = [];
    for (let index = 0; index <= SAMPLES; index += 1) {
      const x = xMin + (xMax - xMin) * (index / SAMPLES);
      values.push([x, safeY(item.fn, x)]);
    }
    return values;
  });

  const px = (x) => PLOT_PAD.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const py = (y) => PLOT_PAD.top + ((yMax - y) / (yMax - yMin)) * plotH;
  const out = [`<svg class="md-plot-svg" viewBox="0 0 ${PLOT_W} ${PLOT_H}" role="img" aria-label="${escape(spec.title || '函数图像')}" preserveAspectRatio="xMidYMid meet" data-x-min="${xMin}" data-x-max="${xMax}" data-y-min="${yMin}" data-y-max="${yMax}">`];

  // 网格与刻度：使用主题专用变量，保证深色和浅色都有足够对比度。
  const xStep = niceStep(xMax - xMin); const yStep = niceStep(yMax - yMin);
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax + xStep * 1e-9; x += xStep) {
    const sx = px(x);
    if (spec.grid) out.push(`<line class="plot-grid" style="stroke:var(--plot-grid,#66758c);opacity:.62" x1="${fmt(sx)}" y1="${PLOT_PAD.top}" x2="${fmt(sx)}" y2="${PLOT_PAD.top + plotH}"/>`);
    if (Math.abs(x) > xStep / 100) out.push(`<text class="plot-tick" style="fill:var(--plot-text,#c3cedd)" font-size="10" x="${fmt(sx)}" y="${PLOT_PAD.top + plotH + 16}" text-anchor="middle">${formatNumber(x, 6)}</text>`);
  }
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax + yStep * 1e-9; y += yStep) {
    const sy = py(y);
    if (spec.grid) out.push(`<line class="plot-grid" style="stroke:var(--plot-grid,#66758c);opacity:.62" x1="${PLOT_PAD.left}" y1="${fmt(sy)}" x2="${PLOT_PAD.left + plotW}" y2="${fmt(sy)}"/>`);
    if (Math.abs(y) > yStep / 100) out.push(`<text class="plot-tick" style="fill:var(--plot-text,#c3cedd)" font-size="10" x="${PLOT_PAD.left - 6}" y="${fmt(sy + 3)}" text-anchor="end">${formatNumber(y, 6)}</text>`);
  }
  if (yMin <= 0 && yMax >= 0) out.push(`<line class="plot-axis" style="stroke:var(--plot-axis,#eef3f9);opacity:.92" stroke-width="1.7" x1="${PLOT_PAD.left}" y1="${fmt(py(0))}" x2="${PLOT_PAD.left + plotW}" y2="${fmt(py(0))}"/>`);
  if (xMin <= 0 && xMax >= 0) out.push(`<line class="plot-axis" style="stroke:var(--plot-axis,#eef3f9);opacity:.92" stroke-width="1.7" x1="${fmt(px(0))}" y1="${PLOT_PAD.top}" x2="${fmt(px(0))}" y2="${PLOT_PAD.top + plotH}"/>`);
  out.push(`<text class="plot-tick" style="fill:var(--plot-text,#c3cedd)" font-size="10" x="${fmt(PLOT_PAD.left + plotW)}" y="${fmt(PLOT_PAD.top + plotH + 16)}" text-anchor="end">x</text>`);
  out.push(`<text class="plot-tick" style="fill:var(--plot-text,#c3cedd)" font-size="10" x="${fmt(PLOT_PAD.left - 6)}" y="${fmt(PLOT_PAD.top - 4)}" text-anchor="end">y</text>`);
  out.push(`<rect class="plot-frame" style="fill:none;stroke:var(--plot-grid,#66758c);opacity:.95" stroke-width="1.2" x="${PLOT_PAD.left}" y="${PLOT_PAD.top}" width="${plotW}" height="${plotH}"/>`);

  // 连点线段（按线段分开，方便显示每段方程与交互命中）
  for (const segment of getPlotSegments(spec)) {
    const clipped = clipSegmentToRange(segment, [xMin, xMax], [yMin, yMax]);
    if (!clipped) continue;
    const [[cx1, cy1], [cx2, cy2]] = clipped;
    const equation = lineEquation(segment.from, segment.to);
    out.push(`<path class="plot-segment" data-kind="segment" data-x1="${segment.from[0]}" data-y1="${segment.from[1]}" data-x2="${segment.to[0]}" data-y2="${segment.to[1]}" data-equation="${escape(equation)}" d="M${fmt(px(cx1))} ${fmt(py(cy1))}L${fmt(px(cx2))} ${fmt(py(cy2))}" fill="none" stroke="${segment.color}" stroke-width="2"><title>${escape(equation || '线段')}</title></path>`);
  }

  // 函数曲线：不连续处断开
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
      out.push(`<path class="plot-curve" data-kind="function" data-function-index="${index}" data-equation="${escape(`y = ${item.expr}`)}" d="${path}" fill="none" stroke="${item.color}" stroke-width="${item.width}"${item.dash ? ' stroke-dasharray="7 5"' : ''}><title>${escape(`y = ${item.expr}`)}</title></path>`);
    }
    if (item.label) {
      const probe = values[Math.floor(SAMPLES * 0.75)];
      const anchor = Number.isFinite(probe?.[1]) && probe[1] >= yMin && probe[1] <= yMax ? probe : values.find(([, y]) => Number.isFinite(y) && y >= yMin && y <= yMax);
      if (anchor) out.push(`<text class="plot-label" font-size="12" font-weight="600" x="${fmt(px(anchor[0]) + 6)}" y="${fmt(py(anchor[1]) - 6)}" fill="${item.color}">${escape(item.label)}</text>`);
    }
  });

  // 明确给出的点与坐标
  const totalPoints = spec.pointSets.reduce((sum, set) => sum + set.points.length, 0);
  for (const set of spec.pointSets) {
    for (const [x, y] of set.points) {
      if (x < xMin || x > xMax || y < yMin || y > yMax) continue;
      const sx = px(x); const sy = py(y);
      const labelX = sx > PLOT_PAD.left + plotW - 92 ? sx - 8 : sx + 8;
      const anchor = sx > PLOT_PAD.left + plotW - 92 ? 'end' : 'start';
      const labelY = sy < PLOT_PAD.top + 24 ? sy + 16 : sy - 8;
      const coord = showCoords && totalPoints <= 30
        ? `<text class="plot-coord" style="fill:${set.color};paint-order:stroke;stroke:var(--panel,#11151d);stroke-width:3px" font-size="10" x="${fmt(labelX)}" y="${fmt(labelY)}" text-anchor="${anchor}">${coordinateText(x, y)}</text>`
        : '';
      out.push(`<g class="plot-point" data-kind="point" data-x="${x}" data-y="${y}" data-label="${escape(set.label || '点')}"><title>${escape(`点 ${coordinateText(x, y)}`)}</title><circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="${Math.max(set.size, 2)}" fill="${set.color}"/>${coord}</g>`);
    }
    if (set.label) {
      const first = set.points.find(([x, y]) => x >= xMin && x <= xMax && y >= yMin && y <= yMax);
      if (first) out.push(`<text class="plot-label" font-size="12" font-weight="600" x="${fmt(px(first[0]) + 8)}" y="${fmt(py(first[1]) - 12)}" fill="${set.color}">${escape(set.label)}</text>`);
    }
  }

  // 交点：曲线之间、曲线与线段、线段之间、以及与坐标轴的交点
  if (showIntersections) {
    const intersections = findPlotIntersections(spec, [xMin, xMax], [yMin, yMax]);
    for (const point of intersections) {
      const sx = px(point.x); const sy = py(point.y);
      const labelX = sx > PLOT_PAD.left + plotW - 92 ? sx - 9 : sx + 9;
      const anchor = sx > PLOT_PAD.left + plotW - 92 ? 'end' : 'start';
      const labelY = sy < PLOT_PAD.top + 24 ? sy + 17 : sy - 9;
      const coordLabel = intersections.length <= 20
        ? `<text class="plot-intersection-label" style="fill:var(--plot-text,#c3cedd);paint-order:stroke;stroke:var(--panel,#11151d);stroke-width:3px" font-size="10" x="${fmt(labelX)}" y="${fmt(labelY)}" text-anchor="${anchor}">${coordinateText(point.x, point.y)}</text>`
        : '';
      out.push(`<g class="plot-intersection" data-kind="intersection" data-x="${point.x}" data-y="${point.y}" data-label="${escape(point.label)}"><title>${escape(`${point.label} ${coordinateText(point.x, point.y)}`)}</title><path d="M${fmt(sx)} ${fmt(sy - 6)}L${fmt(sx + 6)} ${fmt(sy)}L${fmt(sx)} ${fmt(sy + 6)}L${fmt(sx - 6)} ${fmt(sy)}Z" style="fill:var(--plot-marker,#ffd43b);stroke:var(--plot-axis,#eef3f9)" stroke-width="1.4"/>${coordLabel}</g>`);
    }
  }

  out.push('</svg>');
  return out.join('');
}

function renderPlotEquations(spec) {
  const equations = getPlotEquations(spec);
  if (!equations.length) return '';
  const items = equations.map((item) => {
    const name = item.label ? `${escape(item.label)}：` : '';
    const range = item.type === 'segment' ? ` <span class="plot-equation-range">${coordinateText(item.from[0], item.from[1])} → ${coordinateText(item.to[0], item.to[1])}</span>` : '';
    return `<li><span class="plot-equation-swatch" style="background:${item.color}"></span><span>${name}${escape(item.text)}${range}</span></li>`;
  }).join('');
  return `<div class="plot-equations"${spec.equations ? '' : ' hidden'}><h3>方程</h3><ul>${items}</ul></div>`;
}

function renderPlotSvg(spec, options = {}) {
  const svg = renderPlotSvgInner(spec, options);
  const caption = spec.title ? `<figcaption>${escape(spec.title)}</figcaption>` : '';
  const pressed = (value) => value ? 'true' : 'false';
  return `<figure class="md-plot" data-plot-source="${escape(options.source || '')}" data-plot-interactive="${spec.interactive ? 'true' : 'false'}"><div class="plot-toolbar" aria-label="函数图像工具"><div class="plot-tools" role="group" aria-label="缩放"><button type="button" data-plot-action="zoom-out" aria-label="缩小">−</button><button type="button" data-plot-action="zoom-in" aria-label="放大">＋</button><button type="button" data-plot-action="reset">重置</button></div><div class="plot-tools" role="group" aria-label="显示选项"><button type="button" data-plot-toggle="coords" aria-pressed="${pressed(spec.coords)}">坐标</button><button type="button" data-plot-toggle="intersections" aria-pressed="${pressed(spec.intersections)}">交点</button><button type="button" data-plot-toggle="equations" aria-pressed="${pressed(spec.equations)}">方程</button></div></div><div class="plot-stage">${svg}</div><p class="plot-readout" aria-live="polite">拖动平移，滚轮或双指缩放；把指针移到点、交点或曲线上可查看坐标与方程。</p>${renderPlotEquations(spec)}${caption}</figure>\n`;
}

/* ---------------- 可视化图 ```graph ---------------- */

const NODE_ID = /^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/;

function parseGraphSpec(source) {
  const spec = { directed: false, nodes: new Map(), edges: [], title: '' };
  const ensureNode = (id) => {
    if (!spec.nodes.has(id)) spec.nodes.set(id, { id, label: '', x: null, y: null, color: '', size: 20 });
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
        node.size = clamp(options.size ?? options.r, 10, 34, node.size);
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
    const fill = color ? ` fill="${color}"` : ' class="graph-arrow" style="fill:var(--text,#e6eaf0);opacity:.6"';
    return `<polygon points="${fmt(x)},${fmt(y)} ${fmt(x + size * Math.cos(a1))},${fmt(y + size * Math.sin(a1))} ${fmt(x + size * Math.cos(a2))},${fmt(y + size * Math.sin(a2))}"${fill}/>`;
  };
  for (const edge of spec.edges) {
    const a = byId.get(edge.from); const b = byId.get(edge.to);
    if (!a || !b) continue;
    const color = edge.color || '';
    const strokeAttr = edge.color ? ` stroke="${edge.color}"` : ' class="graph-edge" style="stroke:var(--text,#e6eaf0);opacity:.55"';
    const dash = edge.dash ? ' stroke-dasharray="6 5"' : '';
    const x1 = sx(a.x); const y1 = sy(a.y); const x2 = sx(b.x); const y2 = sy(b.y);
    if (edge.from === edge.to) {
      // 自环：点上方画一个小圆
      const r = a.size + 8;
      out.push(`<circle cx="${fmt(x1)}" cy="${fmt(y1 - a.size - r + 6)}" r="${fmt(r - 4)}" fill="none"${edge.color ? ` stroke="${edge.color}"` : ' class="graph-edge" style="stroke:var(--text,#e6eaf0);opacity:.55"'} stroke-width="2.5"${dash}/>`);
      if (edge.directed) out.push(arrow(x1 + (r - 4) * 0.72, y1 - a.size - r + 6 - (r - 4) * 0.72, Math.PI / 4, color));
      if (edge.label) out.push(`<text class="graph-edge-label" style="fill:var(--text,#e6eaf0);paint-order:stroke;stroke:var(--panel,#11151d);stroke-width:3px" font-size="11" x="${fmt(x1)}" y="${fmt(y1 - a.size - 2 * r - 2)}" text-anchor="middle">${escape(edge.label)}</text>`);
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
      out.push(`<line x1="${fmt(startX)}" y1="${fmt(startY)}" x2="${fmt(endX)}" y2="${fmt(endY)}"${strokeAttr} stroke-width="2.5"${dash}/>`);
      if (edge.directed) out.push(arrow(endX, endY, Math.atan2(uy, ux), color));
      labelX = (startX + endX) / 2; labelY = (startY + endY) / 2 - 5;
    } else {
      // 弧线：二次贝塞尔，终点方向按曲线在 t=1 的切线
      const cxp = (x1 + x2) / 2 - uy * offset * 2; const cyp = (y1 + y2) / 2 + ux * offset * 2;
      const tx = endX - cxp; const ty = endY - cyp; const tl = Math.hypot(tx, ty) || 1;
      endX = x2 - (tx / tl) * b.size; endY = y2 - (ty / tl) * b.size;
      out.push(`<path d="M${fmt(startX)} ${fmt(startY)} Q${fmt(cxp)} ${fmt(cyp)} ${fmt(endX)} ${fmt(endY)}" fill="none"${strokeAttr} stroke-width="2.5"${dash}/>`);
      if (edge.directed) out.push(arrow(endX, endY, Math.atan2(ty, tx), color));
      labelX = 0.25 * startX + 0.5 * cxp + 0.25 * endX; labelY = 0.25 * startY + 0.5 * cyp + 0.25 * endY - 5;
    }
    if (edge.label) out.push(`<text class="graph-edge-label" style="fill:var(--text,#e6eaf0);paint-order:stroke;stroke:var(--panel,#11151d);stroke-width:3px" font-size="11" x="${fmt(labelX)}" y="${fmt(labelY)}" text-anchor="middle">${escape(edge.label)}</text>`);
  }

  // 点（画在边上面）；包成一组并带布局坐标，方便交互时显示
  for (const node of nodes) {
    const x = sx(node.x); const y = sy(node.y);
    const fillAttr = node.color ? ` fill="${node.color}"` : ' style="fill:var(--panel-raised,#151a23);stroke:var(--accent,#5ce0c4)" stroke-width="2"';
    const text = node.label || node.id;
    const sub = node.label && node.label !== node.id && node.id !== text
      ? `<text class="graph-node-sub" style="fill:var(--muted,#919ba9)" font-size="10" x="${fmt(x)}" y="${fmt(y + node.size + 15)}" text-anchor="middle">${escape(node.id)}</text>`
      : '';
    out.push(`<g class="graph-node-group" data-node-id="${escape(node.id)}" data-x="${formatNumber(node.x)}" data-y="${formatNumber(node.y)}"><title>${escape(`${text} (${formatNumber(node.x)}, ${formatNumber(node.y)})`)}</title><circle class="graph-node"${fillAttr} cx="${fmt(x)}" cy="${fmt(y)}" r="${node.size}"/><text class="graph-node-label${node.color ? ' on-color' : ''}" style="fill:${node.color ? '#ffffff' : 'var(--text,#e6eaf0)'}" font-size="12" font-weight="600" x="${fmt(x)}" y="${fmt(y + 4)}" text-anchor="middle">${escape(text.slice(0, 8))}</text>${sub}</g>`);
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
        return kind === 'plot' ? renderPlotSvg(parsePlotSpec(token.text), { source: token.text }) : renderGraphSvg(parseGraphSpec(token.text));
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
module.exports.renderPlotSvgInner = renderPlotSvgInner;
module.exports.resolvePlotRanges = resolvePlotRanges;
module.exports.findPlotIntersections = findPlotIntersections;
module.exports.getPlotEquations = getPlotEquations;
module.exports.getPlotSegments = getPlotSegments;
module.exports.lineEquation = lineEquation;
module.exports.PLOT_GEOMETRY = { width: PLOT_W, height: PLOT_H, pad: PLOT_PAD };
module.exports.parseGraphSpec = parseGraphSpec;
module.exports.renderGraphSvg = renderGraphSvg;
module.exports.parseColor = parseColor;
