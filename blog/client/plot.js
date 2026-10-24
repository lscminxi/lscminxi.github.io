import plots from '../lib/plots.cjs';

const { parsePlotSpec, renderPlotSvgInner, resolvePlotRanges, analyzeGraphData, lineEquation } = plots;

const number = (value) => {
  const rounded = Number(Number(value).toFixed(4));
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const raf = (callback) => (window.requestAnimationFrame ? window.requestAnimationFrame(callback) : window.setTimeout(callback, 0));

/* ---------------- 图形下载为 PNG ----------------
   导出的是用户当前看到的视图（平移/缩放后的范围、图算法高亮都会保留）。
   页面里的 SVG 大量样式来自主题 CSS 与 CSS 变量，直接序列化会丢色；
   因此先把每个 SVG 元素最终生效的计算样式内联，再交给画布转 PNG。 */
const FIGURE_PNG_STYLE_PROPERTIES = [
  'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'opacity', 'visibility', 'display', 'color',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
  'text-anchor', 'paint-order', 'dominant-baseline',
];

function figurePngFilename(figure) {
  const doc = figure.ownerDocument;
  const typeLabel = figure.classList.contains('md-graph') ? '可视化图' : '函数图像';
  const title = figure.querySelector('figcaption')?.textContent?.trim()
    || figure.querySelector('svg')?.getAttribute('aria-label')?.trim()
    || typeLabel;
  const figures = [...doc.querySelectorAll('.md-plot, .md-graph')];
  const index = Math.max(1, figures.indexOf(figure) + 1);
  const base = title.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || typeLabel;
  return `${base}-${index}.png`;
}

function downloadFigureAsPng(figure, button = null) {
  const doc = figure?.ownerDocument;
  const view = doc?.defaultView;
  const svg = figure?.querySelector('svg');
  if (!doc || !view || !svg) return false;
  const restoreButton = () => {
    if (!button) return;
    button.disabled = false;
    button.textContent = '下载 PNG';
  };
  if (button) {
    button.disabled = true;
    button.textContent = '生成中…';
  }
  let objectUrl = '';
  try {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const viewBox = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const [minX, minY, width, height] = viewBox.length === 4 && viewBox.every(Number.isFinite)
      ? viewBox
      : [0, 0, Number(svg.getAttribute('width')) || 680, Number(svg.getAttribute('height')) || 420];
    if (!(width > 0) || !(height > 0)) throw new Error('图形尺寸不可用');

    const sourceNodes = [svg, ...svg.querySelectorAll('*')];
    const cloneNodes = [clone, ...clone.querySelectorAll('*')];
    sourceNodes.forEach((source, index) => {
      const target = cloneNodes[index];
      if (!target) return;
      const computed = view.getComputedStyle(source);
      const styles = FIGURE_PNG_STYLE_PROPERTIES
        .map((property) => {
          const value = computed?.getPropertyValue(property);
          return value ? `${property}:${value}` : '';
        })
        .filter(Boolean);
      if (styles.length) target.setAttribute('style', styles.join(';'));
      target.removeAttribute('class');
    });

    const stage = figure.querySelector('.plot-stage');
    const background = [figure, stage, doc.body]
      .map((element) => {
        if (!element) return '';
        try { return view.getComputedStyle(element).backgroundColor || ''; } catch { return ''; }
      })
      .find((color) => color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') || '#11151d';
    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(minX));
    rect.setAttribute('y', String(minY));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('fill', background);
    clone.insertBefore(rect, clone.firstChild);

    const scale = Math.min(3, Math.max(1.5, 1600 / width));
    const outputWidth = Math.max(1, Math.round(width * scale));
    const outputHeight = Math.max(1, Math.round(height * scale));
    clone.setAttribute('width', String(outputWidth));
    clone.setAttribute('height', String(outputHeight));

    // 导出用的图片/画布/下载链接统一在脚本所在的主页面窗口创建：后台预览
    // 的图位于沙盒 iframe 中，若用 iframe 的窗口加载 blob: 图片会被其 CSP
    // 拦截，下载也会被沙盒拦下；样式计算仍用图所在文档的窗口，不受影响。
    const svgText = new window.XMLSerializer().serializeToString(clone);
    objectUrl = window.URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('浏览器无法创建画布');
        context.fillStyle = background;
        context.fillRect(0, 0, outputWidth, outputHeight);
        context.drawImage(image, 0, 0, outputWidth, outputHeight);
        canvas.toBlob((blob) => {
          try {
            if (!blob) throw new Error('PNG 生成失败');
            const pngUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = figurePngFilename(figure);
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => window.URL.revokeObjectURL(pngUrl), 1000);
            if (button) {
              button.disabled = false;
              button.textContent = '已下载 PNG';
              window.setTimeout(restoreButton, 1600);
            }
          } catch {
            if (button) button.textContent = '下载失败';
            window.setTimeout(restoreButton, 1600);
          } finally {
            if (objectUrl) window.URL.revokeObjectURL(objectUrl);
          }
        }, 'image/png');
      } catch {
        if (button) button.textContent = '下载失败';
        window.setTimeout(restoreButton, 1600);
        if (objectUrl) window.URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      if (button) button.textContent = '下载失败';
      window.setTimeout(restoreButton, 1600);
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
    return true;
  } catch {
    if (objectUrl) {
      try { window.URL.revokeObjectURL(objectUrl); } catch { /* 忽略回收失败 */ }
    }
    if (button) button.textContent = '下载失败';
    window.setTimeout(restoreButton, 1600);
    return false;
  }
}

function addFigureDownloadButton(figure, toolbar) {
  if (!toolbar || toolbar.querySelector('[data-download-figure]')) return null;
  const doc = figure.ownerDocument;
  const group = doc.createElement('div');
  group.className = 'plot-tools figure-download-tools';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', '下载图像');
  const button = doc.createElement('button');
  button.type = 'button';
  button.dataset.downloadFigure = figure.classList.contains('md-graph') ? 'graph' : 'plot';
  button.textContent = '下载 PNG';
  button.title = '把当前图形下载为 PNG 图片';
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', () => downloadFigureAsPng(figure, button));
  group.append(button);
  toolbar.append(group);
  return button;
}

/* ---------------- 函数图像：拖动平移 / 滚轮与双指缩放 / 坐标读数 ---------------- */

function initPlot(figure) {
  addFigureDownloadButton(figure, figure.querySelector(':scope > .plot-toolbar'));
  if (figure.dataset.plotInteractive !== 'true' || figure.classList.contains('is-interactive')) return;
  const source = figure.dataset.plotSource || '';
  const stage = figure.querySelector('.plot-stage');
  if (!source || !stage) return;

  let spec;
  try { spec = parsePlotSpec(source); } catch { return; }
  if (!spec.functions.length && !spec.pointSets.length) return;

  const initial = resolvePlotRanges(spec);
  // 后台编辑预览重渲染时会把上次的视图范围写回 data-view-*，这里恢复它，
  // 这样一边改文字一边平移/缩放预览，视图不会每次跳回原样。
  const savedRange = (min, max, fallback) => {
    const lo = Number(min); const hi = Number(max);
    return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [lo, hi] : [...fallback];
  };
  const state = {
    x: savedRange(figure.dataset.viewXMin, figure.dataset.viewXMax, initial.xRange),
    y: savedRange(figure.dataset.viewYMin, figure.dataset.viewYMax, initial.yRange),
    coords: figure.dataset.viewCoords === undefined ? spec.coords : figure.dataset.viewCoords === 'true',
    intersections: figure.dataset.viewIntersections === undefined ? spec.intersections : figure.dataset.viewIntersections === 'true',
  };
  const readout = figure.querySelector('.plot-readout');
  // 跟随鼠标的坐标显示框（悬浮小卡片），与底部读数框显示同一份信息。
  const tooltip = figure.ownerDocument.createElement('div');
  tooltip.className = 'plot-tooltip';
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.innerHTML = '<strong></strong><span></span>';
  const tooltipTitle = tooltip.querySelector('strong');
  const tooltipDetail = tooltip.querySelector('span');
  const hideTooltip = () => tooltip.classList.remove('is-visible');
  const positionTooltip = (event) => {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    tooltip.style.left = `${clamp(x, 64, Math.max(64, rect.width - 64))}px`;
    tooltip.style.top = `${y}px`;
    tooltip.classList.toggle('is-below', y < 78);
  };
  const showDisplay = (event, title, detail = '') => {
    if (readout) readout.textContent = detail ? `${title}：${detail}` : title;
    tooltipTitle.textContent = title;
    tooltipDetail.textContent = detail;
    tooltipDetail.hidden = !detail;
    tooltip.classList.add('is-visible');
    positionTooltip(event);
  };
  const clearLineHover = () => {
    stage.querySelectorAll('.plot-curve.is-hovered, .plot-segment.is-hovered').forEach((el) => el.classList.remove('is-hovered'));
  };
  figure.classList.add('is-interactive');
  stage.tabIndex = 0;
  stage.setAttribute('role', 'application');
  stage.setAttribute('aria-label', '可拖动平移、滚轮缩放的函数图像');

  const syncToggles = () => {
    figure.querySelectorAll('[data-plot-toggle]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Boolean(state[button.dataset.plotToggle])));
    });
    figure.dataset.viewCoords = String(state.coords);
    figure.dataset.viewIntersections = String(state.intersections);
  };
  // 选中的点用「类型:坐标」标识，重绘后按同一坐标找回，选中态不丢、坐标不变。
  // 未选中任何点时不显示任何坐标；一旦选中（移上、按下或点击）就显示。
  const defaultReadout = '拖动平移、滚轮缩放；选中点或交点看坐标，选中直线看方程式。';
  let selectedPointKey = null;
  let selectedPointInfo = null;
  let selectedLineKey = null;
  let selectedLineInfo = null;
  let selectionSource = '';
  const pointKey = (el) => `${el.dataset.kind}:${el.dataset.x}:${el.dataset.y}`;
  const lineKey = (el) => el.dataset.kind === 'function'
    ? `function:${el.dataset.functionIndex}`
    : `segment:${el.dataset.segmentIndex}`;
  const hasSelection = () => Boolean(selectedPointInfo || selectedLineInfo);
  const updateSelectedReadout = () => {
    if (!readout) return;
    if (selectedPointInfo) {
      readout.textContent = state.coords
        ? `(${number(selectedPointInfo.x)}, ${number(selectedPointInfo.y)})`
        : `已选中${selectedPointInfo.kind === 'intersection' ? '交点' : '点'}`;
      return;
    }
    if (selectedLineInfo) { readout.textContent = selectedLineInfo.equation; return; }
    readout.textContent = defaultReadout;
  };
  const draw = () => {
    figure.dataset.viewXMin = String(state.x[0]);
    figure.dataset.viewXMax = String(state.x[1]);
    figure.dataset.viewYMin = String(state.y[0]);
    figure.dataset.viewYMax = String(state.y[1]);
    stage.innerHTML = renderPlotSvgInner(spec, {
      xRange: state.x,
      yRange: state.y,
      showCoords: state.coords,
      showIntersections: state.intersections,
      selectedPointKey,
    });
    if (selectedPointKey) {
      stage.querySelectorAll('[data-kind="point"], [data-kind="intersection"]').forEach((el) => {
        el.classList.toggle('is-selected', pointKey(el) === selectedPointKey);
      });
    }
    if (selectedLineKey) {
      stage.querySelectorAll('[data-kind="function"], [data-kind="segment"]').forEach((el) => {
        el.classList.toggle('is-selected', lineKey(el) === selectedLineKey);
      });
    }
    stage.append(tooltip);
    syncToggles();
  };
  let drawQueued = false;
  const scheduleDraw = () => {
    if (drawQueued) return;
    drawQueued = true;
    raf(() => { drawQueued = false; draw(); });
  };

  const frameBox = () => {
    const frame = stage.querySelector('.plot-frame');
    if (!frame) return { x: 50, y: 16, width: 614, height: 366 };
    return {
      x: Number(frame.getAttribute('x')),
      y: Number(frame.getAttribute('y')),
      width: Number(frame.getAttribute('width')),
      height: Number(frame.getAttribute('height')),
    };
  };
  const svgPoint = (event) => {
    const svg = stage.querySelector('svg');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * 680,
      y: ((event.clientY - rect.top) / rect.height) * 420,
    };
  };
  const toData = (point) => {
    if (!point) return null;
    const frame = frameBox();
    return {
      x: state.x[0] + ((point.x - frame.x) / frame.width) * (state.x[1] - state.x[0]),
      y: state.y[1] - ((point.y - frame.y) / frame.height) * (state.y[1] - state.y[0]),
      inside: point.x >= frame.x && point.x <= frame.x + frame.width && point.y >= frame.y && point.y <= frame.y + frame.height,
    };
  };
  const zoomRanges = (ranges, center, factor) => {
    const initialWidth = initial.xRange[1] - initial.xRange[0];
    const initialHeight = initial.yRange[1] - initial.yRange[0];
    const width = clamp((ranges.x[1] - ranges.x[0]) * factor, initialWidth * 0.001, initialWidth * 50);
    const height = clamp((ranges.y[1] - ranges.y[0]) * factor, initialHeight * 0.001, initialHeight * 50);
    const ratioX = (center.x - ranges.x[0]) / (ranges.x[1] - ranges.x[0]);
    const ratioTop = (ranges.y[1] - center.y) / (ranges.y[1] - ranges.y[0]);
    return {
      x: [center.x - width * ratioX, center.x + width * (1 - ratioX)],
      y: [center.y - height * (1 - ratioTop), center.y + height * ratioTop],
    };
  };
  const zoomAt = (center, factor) => {
    const next = zoomRanges(state, center, factor);
    state.x = next.x;
    state.y = next.y;
    scheduleDraw();
  };
  const center = () => ({ x: (state.x[0] + state.x[1]) / 2, y: (state.y[0] + state.y[1]) / 2 });

  figure.querySelectorAll('[data-plot-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.plotAction === 'zoom-in') zoomAt(center(), 0.75);
      if (button.dataset.plotAction === 'zoom-out') zoomAt(center(), 1.333333);
      if (button.dataset.plotAction === 'reset') {
        state.x = [...initial.xRange];
        state.y = [...initial.yRange];
        draw();
        if (hasSelection()) updateSelectedReadout();
        else if (readout) readout.textContent = '已重置视图。拖动平移，滚轮或双指缩放。';
      }
    });
  });
  figure.querySelectorAll('[data-plot-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.plotToggle;
      state[key] = !state[key];
      if (key === 'intersections' && !state.intersections && selectedPointInfo?.kind === 'intersection') {
        selectedPointInfo = null;
        selectedPointKey = null;
        selectionSource = '';
      }
      if (key === 'coords') hideTooltip();
      draw();
      updateSelectedReadout();
    });
  });

  const pointers = new Map();
  let dragStart = null;
  let pinchStart = null;
  let moved = false;
  // 真实点击在按下与松开之间几乎总有几像素的指针抖动，不能一动就算拖动；
  // 记住按下时命中的点/线，松开后的 click 即使因指针捕获或重绘落到 stage 上，
  // 也能按按下时的目标完成选中（显示坐标/方程式）。
  const CLICK_DRAG_THRESHOLD = 10;
  let pressTarget = null;
  let pressClient = null;
  let handledSelection = null;

  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button > 0) return;
    const point = svgPoint(event);
    if (!point) return;
    pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY, point });
    try { stage.setPointerCapture(event.pointerId); } catch { /* 测试环境可能没有指针捕获 */ }
    moved = false;
    pressTarget = event.target?.closest?.('[data-kind="point"], [data-kind="intersection"], [data-kind="function"], [data-kind="segment"]') || null;
    if (pressTarget && !stage.contains(pressTarget)) pressTarget = null;
    pressClient = { clientX: event.clientX, clientY: event.clientY };
    if (pointers.size === 1) {
      dragStart = { point, clientX: event.clientX, clientY: event.clientY, x: [...state.x], y: [...state.y] };
      pinchStart = null;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        center: toData({ x: (a.point.x + b.point.x) / 2, y: (a.point.y + b.point.y) / 2 }),
        x: [...state.x],
        y: [...state.y],
      };
      dragStart = null;
    }
    stage.classList.add('is-dragging');
    // 一按到点/线就立即选中并显示；触摸没有 hover，这一步尤其重要。
    if (pressTarget) selectAt(event, 'press', { preservePress: true });
    else hideTooltip();
  });

  stage.addEventListener('pointermove', (event) => {
    if (pointers.has(event.pointerId)) {
      const point = svgPoint(event);
      if (!point) return;
      pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY, point });

      if (pointers.size === 1 && dragStart) {
        // 没超过点击阈值时不要平移/重绘：重绘会换掉被按下的 SVG 节点，
        // 随后 click 的目标丢失，选中（坐标/方程式）就永远触发不了。
        if (Math.hypot(event.clientX - dragStart.clientX, event.clientY - dragStart.clientY) <= CLICK_DRAG_THRESHOLD) return;
        if (!moved && selectionSource === 'press') {
          selectedPointInfo = null;
          selectedPointKey = null;
          selectedLineKey = null;
          selectedLineInfo = null;
          selectionSource = '';
          hideTooltip();
          updateSelectedReadout();
        }
        moved = true;
        const frame = frameBox();
        const dxData = ((point.x - dragStart.point.x) / frame.width) * (dragStart.x[1] - dragStart.x[0]);
        const dyData = ((point.y - dragStart.point.y) / frame.height) * (dragStart.y[1] - dragStart.y[0]);
        // 抓着画布拖：内容跟随指针（与 Desmos/GeoGebra 一致）。屏幕 y 向下、
        // 数据 y 向上，所以 y 范围要与拖动同向移动，之前写反了。
        state.x = dragStart.x.map((value) => value - dxData);
        state.y = dragStart.y.map((value) => value + dyData);
        scheduleDraw();
        return;
      }
      if (pointers.size === 2 && pinchStart?.center) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (distance > 0) {
          moved = true;
          const next = zoomRanges({ x: pinchStart.x, y: pinchStart.y }, pinchStart.center, pinchStart.distance / distance);
          state.x = next.x;
          state.y = next.y;
          scheduleDraw();
        }
        return;
      }
    }

    // 选中即显示：指针移到点/交点、曲线或线段上时立刻进入选中态并展示
    // 坐标/方程式，不再等一次完整 click。press/click 固定下来的选中不被空白 hover 清掉。
    if (!pointers.size && updateHoverSelection(event)) return;

    // 悬停读数：优先命中点/交点，其次找最近的曲线
    const data = toData(svgPoint(event));
    if (!data || !readout) return;
    const target = event.target?.closest?.('[data-kind]');
    if (target && stage.contains(target)) {
      const kind = target.dataset.kind;
      if (kind === 'point' || kind === 'intersection') {
        // 只让圆点自己突出，坐标等点击选中后再显示；也不给下面的直线加高亮。
        clearLineHover();
        hideTooltip();
        if (!hasSelection() && readout) readout.textContent = defaultReadout;
      } else if (kind === 'function' || kind === 'segment') {
        clearLineHover();
        target.classList.add('is-hovered');
        hideTooltip();
        if (!hasSelection() && readout) readout.textContent = defaultReadout;
      }
      return;
    }
    if (!data.inside) { hideTooltip(); clearLineHover(); if (!hasSelection() && readout) readout.textContent = defaultReadout; return; }
    let nearest = null;
    const frame = frameBox();
    spec.functions.forEach((item, index) => {
      let y;
      try { y = item.fn(data.x); } catch { y = NaN; }
      if (!Number.isFinite(y)) return;
      const screenY = frame.y + ((state.y[1] - y) / (state.y[1] - state.y[0])) * frame.height;
      const point = svgPoint(event);
      const distance = Math.abs(screenY - point.y);
      if (!nearest || distance < nearest.distance) nearest = { distance, index, y };
    });
    clearLineHover();
    if (nearest && nearest.distance <= 16) {
      const curve = stage.querySelectorAll('.plot-curve')[nearest.index];
      curve?.classList.add('is-hovered');
      hideTooltip();
      if (!hasSelection() && readout) readout.textContent = defaultReadout;
    } else {
      hideTooltip();
      if (!hasSelection() && readout) readout.textContent = defaultReadout;
    }
  });
  stage.addEventListener('pointerleave', () => {
    hideTooltip();
    clearLineHover();
    if (selectionSource === 'hover') clearSelection();
  });

  // 选中即显示：点/交点被选中时固定显示坐标，曲线/线段被选中时显示方程式。
  // “选中”不再只靠 click 完成：指针移上去（hover）、手指/鼠标按下去（press）
  // 都会立刻进入选中态；click 与 pointerup 只作为兜底，避免真实浏览器里
  // click 丢失时只剩 SVG 原生「交点」提示、坐标与方程永远不出现。
  const clearSelection = () => {
    selectedPointInfo = null;
    selectedPointKey = null;
    selectedLineKey = null;
    selectedLineInfo = null;
    selectionSource = '';
    draw();
    hideTooltip();
    updateSelectedReadout();
  };
  const infoForLine = (lineTarget) => lineTarget.dataset.kind === 'function'
    ? { kind: 'function', equation: `y = ${spec.functions[Number(lineTarget.dataset.functionIndex)]?.expr || ''}` }
    : { kind: 'segment', equation: lineEquation([Number(lineTarget.dataset.x1), Number(lineTarget.dataset.y1)], [Number(lineTarget.dataset.x2), Number(lineTarget.dataset.y2)]) };
  const activateSelection = (target, lineTarget, event, source) => {
    const nextPointKey = target ? pointKey(target) : null;
    const nextLineKey = lineTarget ? lineKey(lineTarget) : null;
    if ((nextPointKey && nextPointKey === selectedPointKey) || (nextLineKey && nextLineKey === selectedLineKey)) {
      selectionSource = source;
      if (target) {
        clearLineHover();
        if (state.coords) showDisplay(event, `(${number(target.dataset.x)}, ${number(target.dataset.y)})`);
        else { hideTooltip(); updateSelectedReadout(); }
      } else if (lineTarget && selectedLineInfo?.equation) showDisplay(event, selectedLineInfo.equation);
      else { hideTooltip(); updateSelectedReadout(); }
      return;
    }
    if (target) {
      selectedLineKey = null;
      selectedLineInfo = null;
      selectedPointInfo = {
        kind: target.dataset.kind,
        x: target.dataset.x,
        y: target.dataset.y,
        label: target.dataset.kind === 'intersection' ? '交点' : '点',
      };
      selectedPointKey = pointKey(target);
      selectionSource = source;
      clearLineHover();
      draw();
      if (state.coords) showDisplay(event, `(${number(selectedPointInfo.x)}, ${number(selectedPointInfo.y)})`);
      else { hideTooltip(); updateSelectedReadout(); }
    } else if (lineTarget) {
      selectedPointInfo = null;
      selectedPointKey = null;
      selectedLineKey = lineKey(lineTarget);
      selectedLineInfo = infoForLine(lineTarget);
      selectionSource = source;
      clearLineHover();
      draw();
      if (selectedLineInfo.equation) showDisplay(event, selectedLineInfo.equation);
      else { hideTooltip(); updateSelectedReadout(); }
    }
  };
  const resolveSelection = (event) => {
    let target = event.target?.closest?.('[data-kind="point"], [data-kind="intersection"]');
    let lineTarget = event.target?.closest?.('[data-kind="function"], [data-kind="segment"]');
    if (target && !stage.contains(target)) target = null;
    if (lineTarget && !stage.contains(lineTarget)) lineTarget = null;
    // 事件因指针捕获/重绘落到 stage（或别的非图形元素）上时，
    // 用按下时命中的目标兜底；按、松两点距离必须仍在点击阈值内。
    if (!target && !lineTarget && pressTarget && pressClient
      && Math.hypot(event.clientX - pressClient.clientX, event.clientY - pressClient.clientY) <= CLICK_DRAG_THRESHOLD) {
      if (pressTarget.dataset.kind === 'point' || pressTarget.dataset.kind === 'intersection') target = pressTarget;
      else lineTarget = pressTarget;
    }
    // 再兜底一层几何命中：点/线只有几像素宽，落在附近（未正中命中 SVG 元素）
    // 时按坐标找最近的点/交点/线，避免「看着选上了却不显示坐标/方程」。
    if (!target && !lineTarget) {
      const eventPoint = svgPoint(event);
      const dataPoint = toData(eventPoint);
      if (eventPoint && dataPoint?.inside) {
        const frame = frameBox();
        const toScreen = (x, y) => ({
          x: frame.x + ((x - state.x[0]) / (state.x[1] - state.x[0])) * frame.width,
          y: frame.y + ((state.y[1] - y) / (state.y[1] - state.y[0])) * frame.height,
        });
        let bestPoint = null;
        stage.querySelectorAll('[data-kind="point"], [data-kind="intersection"]').forEach((el) => {
          const screen = toScreen(Number(el.dataset.x), Number(el.dataset.y));
          const distance = Math.hypot(screen.x - eventPoint.x, screen.y - eventPoint.y);
          if (distance <= 16 && (!bestPoint || distance < bestPoint.distance)) bestPoint = { el, distance };
        });
        if (bestPoint) target = bestPoint.el;
        else {
          let bestLine = null;
          const consider = (el, distance) => {
            if (distance <= 14 && (!bestLine || distance < bestLine.distance)) bestLine = { el, distance };
          };
          stage.querySelectorAll('[data-kind="segment"]').forEach((el) => {
            const a = toScreen(Number(el.dataset.x1), Number(el.dataset.y1));
            const b = toScreen(Number(el.dataset.x2), Number(el.dataset.y2));
            const lengthSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
            const t = lengthSq ? Math.min(1, Math.max(0, ((eventPoint.x - a.x) * (b.x - a.x) + (eventPoint.y - a.y) * (b.y - a.y)) / lengthSq)) : 0;
            consider(el, Math.hypot(eventPoint.x - (a.x + t * (b.x - a.x)), eventPoint.y - (a.y + t * (b.y - a.y))));
          });
          spec.functions.forEach((item, index) => {
            let y;
            try { y = item.fn(dataPoint.x); } catch { y = NaN; }
            if (!Number.isFinite(y)) return;
            const el = stage.querySelectorAll('.plot-curve')[index];
            if (el) consider(el, Math.abs(toScreen(dataPoint.x, y).y - eventPoint.y));
          });
          if (bestLine) lineTarget = bestLine.el;
        }
      }
    }
    return { target, lineTarget };
  };
  const selectAt = (event, source = 'click', options = {}) => {
    const { target, lineTarget } = resolveSelection(event);
    if (!options.preservePress) {
      pressTarget = null;
      pressClient = null;
    }
    if (target || lineTarget) activateSelection(target, lineTarget, event, source);
    else clearSelection();
  };
  const updateHoverSelection = (event) => {
    const { target, lineTarget } = resolveSelection(event);
    if (target || lineTarget) {
      activateSelection(target, lineTarget, event, 'hover');
      return true;
    }
    if (selectionSource === 'hover') {
      clearSelection();
      return true;
    }
    return false;
  };
  stage.addEventListener('click', (event) => {
    if (moved) { moved = false; pressTarget = null; pressClient = null; return; }
    // pointerup 已经处理过这次点选时，随后的 click 直接忽略，避免它落到
    // stage 上又把刚选好的点/线清掉。
    if (handledSelection && Date.now() - handledSelection.time < 700
      && Math.hypot(event.clientX - handledSelection.x, event.clientY - handledSelection.y) <= CLICK_DRAG_THRESHOLD) {
      handledSelection = null;
      return;
    }
    selectAt(event, 'click');
  });

  const finishPointer = (event) => {
    const wasSinglePointer = pointers.size === 1;
    const shouldSelect = event.type === 'pointerup' && wasSinglePointer && !moved && pressClient
      && Math.hypot(event.clientX - pressClient.clientX, event.clientY - pressClient.clientY) <= CLICK_DRAG_THRESHOLD;
    pointers.delete(event.pointerId);
    if (!pointers.size) {
      dragStart = null;
      pinchStart = null;
      stage.classList.remove('is-dragging');
      if (shouldSelect) {
        selectAt(event, 'press');
        handledSelection = { time: Date.now(), x: event.clientX, y: event.clientY };
      }
    }
  };
  stage.addEventListener('pointerup', finishPointer);
  stage.addEventListener('pointercancel', finishPointer);
  stage.addEventListener('wheel', (event) => {
    const data = toData(svgPoint(event));
    if (!data) return;
    event.preventDefault();
    zoomAt(data, Math.exp(event.deltaY * 0.0012));
  }, { passive: false });
  stage.addEventListener('dblclick', () => {
    state.x = [...initial.xRange];
    state.y = [...initial.yRange];
    draw();
  });
  stage.addEventListener('keydown', (event) => {
    const width = state.x[1] - state.x[0];
    const height = state.y[1] - state.y[0];
    if (event.key === 'ArrowLeft') state.x = state.x.map((value) => value - width * 0.08);
    else if (event.key === 'ArrowRight') state.x = state.x.map((value) => value + width * 0.08);
    else if (event.key === 'ArrowUp') state.y = state.y.map((value) => value + height * 0.08);
    else if (event.key === 'ArrowDown') state.y = state.y.map((value) => value - height * 0.08);
    else if (event.key === '+' || event.key === '=') zoomAt(center(), 0.8);
    else if (event.key === '-' || event.key === '_') zoomAt(center(), 1.25);
    else if (event.key === '0' || event.key === 'Home') { state.x = [...initial.xRange]; state.y = [...initial.yRange]; }
    else return;
    event.preventDefault();
    scheduleDraw();
  });

  draw();
  updateSelectedReadout();
}

/* ---------------- 可视化图：拖动平移 / 缩放 / 点坐标读数 ---------------- */

function initGraph(figure) {
  const svg = figure.querySelector(':scope > svg, :scope > .plot-stage > svg');
  if (!svg || figure.classList.contains('is-interactive')) return;
  figure.classList.add('is-interactive');

  const doc = figure.ownerDocument;
  const stage = doc.createElement('div');
  stage.className = 'plot-stage graph-stage';
  figure.insertBefore(stage, svg);
  stage.append(svg);
  stage.tabIndex = 0;
  stage.setAttribute('role', 'application');
  stage.setAttribute('aria-label', '可拖动平移、滚轮缩放的可视化图');

  const toolbar = doc.createElement('div');
  toolbar.className = 'plot-toolbar graph-toolbar';
  toolbar.setAttribute('aria-label', '可视化图工具');
  const algorithmMode = ['reader', 'none', 'components', 'bridges', 'mst', 'bipartite', 'vbcc', 'ebcc', 'dfs'].includes(figure.dataset.graphAlgorithm)
    ? figure.dataset.graphAlgorithm
    : 'reader';
  const algorithmLabels = { components: '连通分量', bridges: '桥与割点', mst: '最小生成树', bipartite: '二分图', vbcc: '点双连通分量', ebcc: '边双连通分量', dfs: 'DFS 树（返祖边）' };
  const algorithmToolbar = algorithmMode === 'reader'
    ? '<div class="plot-tools graph-algorithms" role="group" aria-label="图算法"><button type="button" data-graph-algo="components" aria-pressed="false">连通分量</button><button type="button" data-graph-algo="bridges" aria-pressed="false">桥与割点</button><button type="button" data-graph-algo="mst" aria-pressed="false">最小生成树</button><button type="button" data-graph-algo="bipartite" aria-pressed="false">二分图</button><button type="button" data-graph-algo="vbcc" aria-pressed="false">点双</button><button type="button" data-graph-algo="ebcc" aria-pressed="false">边双</button><button type="button" data-graph-algo="dfs" aria-pressed="false">DFS 树（返祖边）</button><button type="button" data-graph-algo="clear" aria-pressed="false">清除算法</button></div>'
    : (algorithmMode === 'none' ? '' : `<div class="plot-tools graph-algorithms" role="group" aria-label="图算法"><span class="graph-algorithm-fixed">${algorithmLabels[algorithmMode]} · 作者指定</span></div>`);
  toolbar.innerHTML = '<div class="plot-tools" role="group" aria-label="缩放"><button type="button" data-graph-action="zoom-out" aria-label="缩小">−</button><button type="button" data-graph-action="zoom-in" aria-label="放大">＋</button><button type="button" data-graph-action="reset">重置</button></div>' + algorithmToolbar;
  // 只有后台预览的图带 data-graph-editable：作者可在此调整点位并写回源码；
  // 正式文章页不生成这个标记，读者仍只能平移、缩放、选点边和看算法。
  const editableGraph = figure.dataset.graphEditable === 'true';
  let adjustButton = null;
  let savePositionsButton = null;
  let resetPositionButton = null;
  if (editableGraph) {
    const adjustTools = doc.createElement('div');
    adjustTools.className = 'plot-tools graph-adjust-tools';
    adjustTools.setAttribute('role', 'group');
    adjustTools.setAttribute('aria-label', '调整图点位置');
    adjustButton = doc.createElement('button');
    adjustButton.type = 'button';
    adjustButton.dataset.graphAdjust = 'true';
    adjustButton.setAttribute('aria-pressed', 'false');
    adjustButton.textContent = '调整点位';
    savePositionsButton = doc.createElement('button');
    savePositionsButton.type = 'button';
    savePositionsButton.dataset.graphSavePositions = 'true';
    savePositionsButton.textContent = '保存点位';
    savePositionsButton.title = '把当前图中所有点位一次性写回 Markdown 源码';
    savePositionsButton.hidden = true;
    resetPositionButton = doc.createElement('button');
    resetPositionButton.type = 'button';
    resetPositionButton.dataset.graphResetPositions = 'true';
    resetPositionButton.textContent = '重置点位';
    resetPositionButton.hidden = true;
    adjustTools.append(adjustButton, savePositionsButton, resetPositionButton);
    toolbar.append(adjustTools);
  }
  addFigureDownloadButton(figure, toolbar);
  figure.insertBefore(toolbar, stage);
  const readout = doc.createElement('p');
  readout.className = 'plot-readout';
  readout.setAttribute('aria-live', 'polite');
  const graphReadoutHint = editableGraph
    ? '拖动平移，滚轮或双指缩放；点「调整点位」后可连续拖动多个节点，最后点「保存点位」一次性写回源码。'
    : '拖动平移，滚轮或双指缩放；把指针移到点上可查看点名。';
  readout.textContent = graphReadoutHint;
  // 调整点位时暂时关闭下方详细信息：拖动中坐标读数会不断变行数，撑高/压矮
  // 这行会让整张图跟着抖。调整期间冻结并隐藏读数（占位高度不变），退出恢复。
  let graphAdjustMode = false;
  function updateReadout(text) {
    if (!graphAdjustMode) readout.textContent = text;
  }
  stage.after(readout);
  const tooltip = doc.createElement('div');
  tooltip.className = 'plot-tooltip';
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.innerHTML = '<strong></strong><span></span>';
  stage.append(tooltip);
  const tooltipTitle = tooltip.querySelector('strong');
  const tooltipDetail = tooltip.querySelector('span');
  const hideTooltip = () => tooltip.classList.remove('is-visible');
  const showDisplay = (event, title, detail = '') => {
    updateReadout(detail ? `${title}：${detail}` : title);
    tooltipTitle.textContent = title;
    tooltipDetail.textContent = detail;
    tooltipDetail.hidden = !detail;
    const rect = stage.getBoundingClientRect();
    if (rect.width && rect.height) {
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      tooltip.style.left = `${clamp(x, 64, Math.max(64, rect.width - 64))}px`;
      tooltip.style.top = `${y}px`;
      tooltip.classList.toggle('is-below', y < 78);
    }
    tooltip.classList.add('is-visible');
  };

  const initial = (svg.getAttribute('viewBox') || '0 0 680 320').split(/\s+/).map(Number);
  // 预览重渲染时恢复上次的缩放/平移位置（重置仍回到初始 viewBox）。
  const saved = (svg.getAttribute('data-preview-viewbox') || '').split(/\s+/).map(Number);
  let current = saved.length === 4 && saved.every(Number.isFinite) && saved[2] > 0 ? saved : [...initial];
  const apply = () => {
    const text = current.map((value) => Number(value.toFixed(3))).join(' ');
    svg.setAttribute('viewBox', text);
    svg.setAttribute('data-preview-viewbox', text);
  };
  apply();
  const svgPoint = (event) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: current[0] + ((event.clientX - rect.left) / rect.width) * current[2],
      y: current[1] + ((event.clientY - rect.top) / rect.height) * current[3],
    };
  };
  const zoomAt = (centerPoint, factor, base = current) => {
    const width = clamp(base[2] * factor, initial[2] * 0.05, initial[2] * 5);
    const height = initial[3] * (width / initial[2]);
    current = [
      centerPoint.x - (centerPoint.x - base[0]) * (width / base[2]),
      centerPoint.y - (centerPoint.y - base[1]) * (height / base[3]),
      width,
      height,
    ];
    apply();
  };
  const centerPoint = () => ({ x: current[0] + current[2] / 2, y: current[1] + current[3] / 2 });

  /* 图算法（仿 Another Graph Editor 的 Algos 面板）：在现有图上高亮结果，
   * 不改动原始点边；再次点击同一算法或「清除算法」恢复原样。 */
  const nodeEls = [...svg.querySelectorAll('.graph-node-group')];
  const edgeEls = [...svg.querySelectorAll('.graph-edge-group')];
  const nodeName = new Map(nodeEls.map((el) => [el.dataset.nodeId, el.dataset.nodeLabel || el.dataset.nodeId]));
  const nameOf = (id) => nodeName.get(id) || id;
  const graphAnalysis = analyzeGraphData(
    nodeEls.map((el) => el.dataset.nodeId),
    edgeEls.map((el) => ({ from: el.dataset.from, to: el.dataset.to, directed: el.dataset.directed === 'true', weight: Number(el.dataset.weight || 1) })),
  );
  const componentPalette = ['#4dabf7', '#ffd43b', '#69db7c', '#ff8787', '#b197fc', '#ffa94d', '#63e6be', '#f783ac'];
  const originalPaint = new Map();
  let activeAlgorithm = '';
  let algorithmSummary = '';
  const rememberPaint = (group) => {
    if (originalPaint.has(group)) return;
    const circle = group.querySelector('.graph-node');
    const ring = group.querySelector('.graph-node-ring');
    const label = group.querySelector('.graph-node-label');
    originalPaint.set(group, {
      circleStyle: circle?.getAttribute('style'), circleFill: circle?.getAttribute('fill'),
      ringStyle: ring?.getAttribute('style'), labelStyle: label?.getAttribute('style'),
    });
  };
  const paintNode = (group, color) => {
    rememberPaint(group);
    const circle = group.querySelector('.graph-node');
    const ring = group.querySelector('.graph-node-ring');
    const label = group.querySelector('.graph-node-label');
    if (circle) { circle.style.fill = color; circle.style.stroke = 'var(--panel, #11151d)'; }
    if (ring) ring.style.stroke = color;
    if (label) label.style.fill = '#10131a';
    group.classList.add('is-algo-node');
  };
  const markEdge = (group, mode, color) => {
    group.classList.add(mode);
    if (color) group.style.setProperty('--algo-edge-color', color);
  };
  const clearAlgorithm = (restoreReadout = true) => {
    activeAlgorithm = '';
    algorithmSummary = '';
    edgeEls.forEach((el) => {
      el.classList.remove('is-algo-active', 'is-algo-dim', 'is-algo-bridge', 'is-algo-conflict', 'is-algo-back');
      el.style.removeProperty('--algo-edge-color');
    });
    nodeEls.forEach((group) => {
      group.classList.remove('is-algo-node', 'is-cut-vertex', 'is-dfs-root');
      const saved = originalPaint.get(group);
      if (!saved) return;
      const circle = group.querySelector('.graph-node');
      const ring = group.querySelector('.graph-node-ring');
      const label = group.querySelector('.graph-node-label');
      for (const [el, style] of [[circle, saved.circleStyle], [ring, saved.ringStyle], [label, saved.labelStyle]]) {
        if (!el) continue;
        if (style === null || style === undefined) el.removeAttribute('style'); else el.setAttribute('style', style);
      }
      if (circle) { if (saved.circleFill === null || saved.circleFill === undefined) circle.removeAttribute('fill'); else circle.setAttribute('fill', saved.circleFill); }
    });
    toolbar.querySelectorAll('[data-graph-algo]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
    if (restoreReadout) updateReadout(graphReadoutHint);
  };
  const edgeName = (el) => `${nameOf(el.dataset.from)} — ${nameOf(el.dataset.to)}`;
  const edgeDetail = (el) => {
    const label = el.dataset.label || '';
    const weight = Number(el.dataset.weight || 1);
    const parts = [];
    if (label) parts.push(label);
    // 有名称的边也要能看到边权；名称本身就是纯数字（即权重）时不重复。
    if (Number.isFinite(weight) && !/^-?(?:\d+\.?\d*|\.\d+)$/.test(label)) parts.push(`边权 ${Number(weight.toFixed(4))}`);
    if (!parts.length) parts.push(el.dataset.directed === 'true' ? '有向边' : '无向边');
    return parts.join(' · ');
  };
  const nodeDetail = (group) => {
    const weight = group?.dataset?.nodeWeight;
    return weight !== undefined && weight !== '' && Number.isFinite(Number(weight))
      ? `点权 ${Number(Number(weight).toFixed(4))}`
      : '';
  };
  const applyAlgorithm = (mode) => {
    if (activeAlgorithm === mode) { clearAlgorithm(); return; }
    clearAlgorithm(false);
    activeAlgorithm = mode;
    toolbar.querySelectorAll('[data-graph-algo]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.graphAlgo === mode)));
    const directedNote = graphAnalysis.directed ? '（有向边按无向结构计算）' : '';
    if (mode === 'components') {
      const componentOf = new Map();
      graphAnalysis.components.forEach((component, index) => component.forEach((id) => componentOf.set(id, index)));
      nodeEls.forEach((group) => paintNode(group, componentPalette[(componentOf.get(group.dataset.nodeId) || 0) % componentPalette.length]));
      edgeEls.forEach((el) => markEdge(el, 'is-algo-active', componentPalette[(componentOf.get(el.dataset.from) || 0) % componentPalette.length]));
      algorithmSummary = `连通分量：共 ${graphAnalysis.components.length} 个${directedNote} · ${graphAnalysis.components.map((component, index) => `分量 ${index + 1}：${component.map(nameOf).join('、')}`).join('；')}`;
    } else if (mode === 'bridges') {
      const bridgeSet = new Set(graphAnalysis.bridges);
      edgeEls.forEach((el) => markEdge(el, bridgeSet.has(Number(el.dataset.edgeIndex)) ? 'is-algo-bridge' : 'is-algo-dim', bridgeSet.has(Number(el.dataset.edgeIndex)) ? '#ff6b6b' : ''));
      const cutSet = new Set(graphAnalysis.cutVertices);
      nodeEls.forEach((group) => {
        if (!cutSet.has(group.dataset.nodeId)) return;
        rememberPaint(group);
        group.classList.add('is-cut-vertex');
        const ring = group.querySelector('.graph-node-ring');
        if (ring) ring.style.stroke = '#ff922b';
      });
      const bridgeNames = graphAnalysis.bridges.map((index) => edgeEls[index] && edgeName(edgeEls[index])).filter(Boolean);
      algorithmSummary = `桥与割点${directedNote}：桥 ${bridgeNames.length} 条${bridgeNames.length ? `（${bridgeNames.join('、')}）` : ''}；割点 ${graphAnalysis.cutVertices.length} 个${graphAnalysis.cutVertices.length ? `（${graphAnalysis.cutVertices.map(nameOf).join('、')}）` : ''}`;
    } else if (mode === 'mst') {
      const mstSet = new Set(graphAnalysis.mst.edges);
      edgeEls.forEach((el) => markEdge(el, mstSet.has(Number(el.dataset.edgeIndex)) ? 'is-algo-active' : 'is-algo-dim', '#51cf66'));
      const weight = Number(graphAnalysis.mst.totalWeight.toFixed(4));
      algorithmSummary = `${graphAnalysis.mst.complete && graphAnalysis.components.length === 1 ? '最小生成树' : '最小生成森林'}${directedNote}：选中 ${graphAnalysis.mst.edges.length} 条边，总权重 ${weight}（边权取 weight= 或纯数字标注，未写时按 1）`;
    } else if (mode === 'bipartite') {
      const sideColors = ['#4dabf7', '#ffd43b'];
      nodeEls.forEach((group) => {
        const side = graphAnalysis.bipartite.colors[group.dataset.nodeId];
        if (side !== undefined) paintNode(group, sideColors[side]);
      });
      edgeEls.forEach((el) => markEdge(el, Number(el.dataset.edgeIndex) === graphAnalysis.bipartite.conflict ? 'is-algo-conflict' : 'is-algo-active', Number(el.dataset.edgeIndex) === graphAnalysis.bipartite.conflict ? '#ff6b6b' : ''));
      if (graphAnalysis.bipartite.ok) {
        const sides = [[], []];
        Object.entries(graphAnalysis.bipartite.colors).forEach(([id, side]) => sides[side].push(nameOf(id)));
        algorithmSummary = `二分图判定${directedNote}：是二分图 · 一侧：${sides[0].join('、') || '（空）'}；另一侧：${sides[1].join('、') || '（空）'}`;
      } else {
        const conflictEl = edgeEls[graphAnalysis.bipartite.conflict];
        algorithmSummary = `二分图判定${directedNote}：不是二分图${conflictEl ? ` · 冲突边 ${edgeName(conflictEl)} 连接了同侧点或自环` : ''}`;
      }
    } else if (mode === 'vbcc') {
      const componentsOfNode = new Map(); const componentOfEdge = new Map();
      graphAnalysis.vertexBiconnectedComponents.forEach((component, index) => {
        component.edges.forEach((edgeIndex) => componentOfEdge.set(edgeIndex, index));
        component.nodes.forEach((id) => {
          if (!componentsOfNode.has(id)) componentsOfNode.set(id, []);
          componentsOfNode.get(id).push(index);
        });
      });
      nodeEls.forEach((group) => {
        const belonging = componentsOfNode.get(group.dataset.nodeId) || [];
        if (!belonging.length) return;
        paintNode(group, componentPalette[belonging[0] % componentPalette.length]);
        if (belonging.length > 1) {
          group.classList.add('is-cut-vertex');
          const ring = group.querySelector('.graph-node-ring');
          if (ring) ring.style.stroke = '#ff922b';
        }
      });
      edgeEls.forEach((el) => {
        const index = componentOfEdge.get(Number(el.dataset.edgeIndex));
        if (index !== undefined) markEdge(el, 'is-algo-active', componentPalette[index % componentPalette.length]);
      });
      const shared = [...componentsOfNode.entries()].filter(([, list]) => list.length > 1).map(([id]) => nameOf(id));
      algorithmSummary = `点双连通分量${directedNote}：共 ${graphAnalysis.vertexBiconnectedComponents.length} 个 · ${graphAnalysis.vertexBiconnectedComponents.map((component, index) => `分量 ${index + 1}：${component.nodes.map(nameOf).join('、')}`).join('；')}${shared.length ? ` · ${shared.join('、')} 同时属于多个分量（橙色外圈）` : ''}`;
    } else if (mode === 'ebcc') {
      const componentOf = new Map();
      graphAnalysis.edgeBiconnectedComponents.forEach((component, index) => component.nodes.forEach((id) => componentOf.set(id, index)));
      nodeEls.forEach((group) => {
        const index = componentOf.get(group.dataset.nodeId);
        if (index !== undefined) paintNode(group, componentPalette[index % componentPalette.length]);
      });
      const bridgeSet = new Set(graphAnalysis.bridges);
      edgeEls.forEach((el) => {
        const edgeIndex = Number(el.dataset.edgeIndex);
        if (bridgeSet.has(edgeIndex)) { markEdge(el, 'is-algo-bridge', '#ff6b6b'); return; }
        const index = componentOf.get(el.dataset.from);
        markEdge(el, 'is-algo-active', componentPalette[(index || 0) % componentPalette.length]);
      });
      const bridgeNames = graphAnalysis.bridges.map((index) => edgeEls[index] && edgeName(edgeEls[index])).filter(Boolean);
      algorithmSummary = `边双连通分量${directedNote}：共 ${graphAnalysis.edgeBiconnectedComponents.length} 个 · ${graphAnalysis.edgeBiconnectedComponents.map((component, index) => `分量 ${index + 1}：${component.nodes.map(nameOf).join('、')}`).join('；')}${bridgeNames.length ? ` · 桥（不属于任何分量）：${bridgeNames.join('、')}` : ' · 没有桥'}`;
    } else if (mode === 'dfs') {
      const treeSet = new Set(graphAnalysis.dfsTree.treeEdges);
      const backSet = new Set(graphAnalysis.dfsTree.backEdges);
      edgeEls.forEach((el) => {
        const edgeIndex = Number(el.dataset.edgeIndex);
        if (treeSet.has(edgeIndex)) markEdge(el, 'is-algo-active', '#51cf66');
        else if (backSet.has(edgeIndex)) markEdge(el, 'is-algo-back', '#ffa94d');
        else markEdge(el, 'is-algo-dim', '');
      });
      const rootSet = new Set(graphAnalysis.dfsTree.roots);
      nodeEls.forEach((group) => { if (rootSet.has(group.dataset.nodeId)) group.classList.add('is-dfs-root'); });
      const edgeNames = (list) => list.map((index) => edgeEls[index] && edgeName(edgeEls[index])).filter(Boolean);
      const treeNames = edgeNames(graphAnalysis.dfsTree.treeEdges);
      const backNames = edgeNames(graphAnalysis.dfsTree.backEdges);
      const otherNames = edgeNames(graphAnalysis.dfsTree.otherEdges);
      const forest = graphAnalysis.dfsTree.roots.length > 1;
      algorithmSummary = `${forest ? 'DFS 森林' : 'DFS 树'}（带返祖边）${graphAnalysis.directed ? '（有向边沿箭头方向搜索）' : ''}：根为 ${graphAnalysis.dfsTree.roots.map(nameOf).join('、')} · 访问顺序 ${graphAnalysis.dfsTree.order.map(nameOf).join(' → ')} · 树边 ${treeNames.length} 条${treeNames.length ? `（${treeNames.join('、')}）` : ''} · 返祖边 ${backNames.length} 条${backNames.length ? `（${backNames.join('、')}，橙色虚线）` : ''}${otherNames.length ? ` · 其余边 ${otherNames.length} 条（${otherNames.join('、')}）` : ''}`;
    }
    updateReadout(algorithmSummary);
  };
  toolbar.querySelectorAll('[data-graph-algo]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.graphAlgo === 'clear') clearAlgorithm();
      else applyAlgorithm(button.dataset.graphAlgo);
    });
  });
  // 作者在图源码里指定了固定算法时，进页面就直接展示该算法，读者只能缩放/平移，不能改算法；
  // algo: reader（缺省）才把算法按钮交给读者自己选，algo: none 则完全不显示算法。
  if (algorithmMode !== 'reader' && algorithmMode !== 'none') applyAlgorithm(algorithmMode);

  /* ---------------- 后台预览：拖动节点调整点位 ----------------
   * 渲染器把每个点的原始坐标写在 data-node-x/y 上，并把「原始坐标 → SVG 坐标」
   * 的变换写在 svg 的 data-graph-* 上。拖动时只更新本地 SVG 并实时重画相连
   * 的边，不触发源码写入或预览重渲染；作者点「保存点位」后，才把换算回
   * 原始坐标的全部点位一次性发给后台父页面写回 Markdown 源码。 */
  const graphTransform = {
    pad: Number(svg.getAttribute('data-graph-pad') || 52),
    minX: Number(svg.getAttribute('data-graph-min-x') || 0),
    minY: Number(svg.getAttribute('data-graph-min-y') || 0),
    scaleX: Number(svg.getAttribute('data-graph-scale-x') || 1) || 1,
    scaleY: Number(svg.getAttribute('data-graph-scale-y') || 1) || 1,
  };
  const screenToGraphSource = (point) => ({
    x: graphTransform.minX + (point.x - graphTransform.pad) / graphTransform.scaleX,
    y: graphTransform.minY + (point.y - graphTransform.pad) / graphTransform.scaleY,
  });
  const graphNodes = new Map();
  nodeEls.forEach((group) => {
    const circle = group.querySelector('.graph-node');
    const size = Number(group.dataset.nodeSize || circle?.getAttribute('r') || 20);
    const screen = {
      x: Number(circle?.getAttribute('cx') || 0),
      y: Number(circle?.getAttribute('cy') || 0),
    };
    const source = {
      x: Number(group.dataset.nodeX),
      y: Number(group.dataset.nodeY),
    };
    graphNodes.set(group.dataset.nodeId, {
      group,
      size,
      screen,
      source: Number.isFinite(source.x) && Number.isFinite(source.y) ? source : screenToGraphSource(screen),
    });
  });
  const graphArrowPoints = (x, y, angle) => {
    const size = 9;
    const a1 = angle + Math.PI * 0.82;
    const a2 = angle - Math.PI * 0.82;
    return `${x},${y} ${x + size * Math.cos(a1)},${y + size * Math.sin(a1)} ${x + size * Math.cos(a2)},${y + size * Math.sin(a2)}`;
  };
  edgeEls.forEach((group) => {
    if (group.dataset.from === group.dataset.to) {
      group.dataset.edgeKind = 'loop';
      group.dataset.edgeOffset = '0';
      return;
    }
    const path = group.querySelector('path.graph-edge-line');
    if (!path) {
      group.dataset.edgeKind = 'line';
      group.dataset.edgeOffset = '0';
      return;
    }
    group.dataset.edgeKind = 'curve';
    const nums = (path.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    const a = graphNodes.get(group.dataset.from)?.screen;
    const b = graphNodes.get(group.dataset.to)?.screen;
    let offset = 0;
    if (nums.length >= 6 && a && b) {
      const dx = b.x - a.x; const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist; const uy = dy / dist;
      offset = (((nums[2] - (a.x + b.x) / 2) * -uy) + ((nums[3] - (a.y + b.y) / 2) * ux)) / 2;
    }
    group.dataset.edgeOffset = String(offset);
  });
  const updateGraphEdge = (group) => {
    const a = graphNodes.get(group.dataset.from);
    const b = graphNodes.get(group.dataset.to);
    if (!a || !b) return;
    const label = group.querySelector('.graph-edge-label');
    const arrowEl = group.querySelector('polygon');
    if (group.dataset.edgeKind === 'loop') {
      const r = a.size + 8;
      const cy = a.screen.y - a.size - r + 6;
      group.querySelectorAll('circle').forEach((circle) => {
        circle.setAttribute('cx', a.screen.x);
        circle.setAttribute('cy', cy);
      });
      if (arrowEl) arrowEl.setAttribute('points', graphArrowPoints(a.screen.x + (r - 4) * 0.72, cy - (r - 4) * 0.72, Math.PI / 4));
      if (label) {
        label.setAttribute('x', a.screen.x);
        label.setAttribute('y', a.screen.y - a.size - 2 * r - 2);
      }
      return;
    }
    const dx = b.screen.x - a.screen.x;
    const dy = b.screen.y - a.screen.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist; const uy = dy / dist;
    const offset = Number(group.dataset.edgeOffset || 0);
    let labelX; let labelY;
    if (group.dataset.edgeKind === 'curve') {
      const cxp = (a.screen.x + b.screen.x) / 2 - uy * offset * 2;
      const cyp = (a.screen.y + b.screen.y) / 2 + ux * offset * 2;
      const startX = a.screen.x + ux * a.size;
      const startY = a.screen.y + uy * a.size;
      const tx = b.screen.x - cxp; const ty = b.screen.y - cyp;
      const tl = Math.hypot(tx, ty) || 1;
      const endX = b.screen.x - (tx / tl) * b.size;
      const endY = b.screen.y - (ty / tl) * b.size;
      const d = `M${startX} ${startY} Q${cxp} ${cyp} ${endX} ${endY}`;
      group.querySelectorAll('path').forEach((path) => path.setAttribute('d', d));
      if (arrowEl) arrowEl.setAttribute('points', graphArrowPoints(endX, endY, Math.atan2(ty, tx)));
      labelX = 0.25 * startX + 0.5 * cxp + 0.25 * endX;
      labelY = 0.25 * startY + 0.5 * cyp + 0.25 * endY - 5;
    } else {
      const startX = a.screen.x + ux * a.size;
      const startY = a.screen.y + uy * a.size;
      const endX = b.screen.x - ux * b.size;
      const endY = b.screen.y - uy * b.size;
      group.querySelectorAll('line').forEach((line) => {
        line.setAttribute('x1', startX); line.setAttribute('y1', startY);
        line.setAttribute('x2', endX); line.setAttribute('y2', endY);
      });
      if (arrowEl) arrowEl.setAttribute('points', graphArrowPoints(endX, endY, Math.atan2(uy, ux)));
      labelX = (startX + endX) / 2;
      labelY = (startY + endY) / 2 - 5;
    }
    if (label) { label.setAttribute('x', labelX); label.setAttribute('y', labelY); }
  };
  const updateGraphEdgesFor = (nodeId) => {
    edgeEls.forEach((group) => {
      if (group.dataset.from === nodeId || group.dataset.to === nodeId) updateGraphEdge(group);
    });
  };
  const setGraphNodeScreen = (group, point) => {
    const state = graphNodes.get(group.dataset.nodeId);
    if (!state) return;
    state.screen = { x: point.x, y: point.y };
    state.source = screenToGraphSource(point);
    const circle = group.querySelector('.graph-node');
    const ring = group.querySelector('.graph-node-ring');
    const label = group.querySelector('.graph-node-label');
    const sub = group.querySelector('.graph-node-sub');
    const weightBadge = group.querySelector('.graph-node-weight');
    if (circle) { circle.setAttribute('cx', point.x); circle.setAttribute('cy', point.y); }
    if (ring) { ring.setAttribute('cx', point.x); ring.setAttribute('cy', point.y); }
    if (label) { label.setAttribute('x', point.x); label.setAttribute('y', point.y + 4); }
    if (sub) { sub.setAttribute('x', point.x); sub.setAttribute('y', point.y + state.size + 15); }
    if (weightBadge) {
      const offsetX = Number(weightBadge.dataset.weightOffsetX || 0);
      const offsetY = Number(weightBadge.dataset.weightOffsetY || 0);
      weightBadge.setAttribute('transform', `translate(${point.x + offsetX} ${point.y + offsetY})`);
    }
    updateGraphEdgesFor(group.dataset.nodeId);
  };
  const roundGraphCoord = (value) => Number(Number(value).toFixed(2));
  let graphPositionSnapshot = null;
  let graphPositionsDirty = false;
  const captureGraphPositions = () => new Map([...graphNodes].map(([id, state]) => [id, {
    screen: { ...state.screen }, source: { ...state.source },
  }]));
  const restoreGraphPositions = (snapshot) => {
    if (!snapshot) return;
    snapshot.forEach((position, id) => {
      const state = graphNodes.get(id);
      if (state) setGraphNodeScreen(state.group, position.screen);
    });
  };
  const refreshGraphPositionsDirty = () => {
    graphPositionsDirty = Boolean(graphPositionSnapshot) && [...graphPositionSnapshot].some(([id, position]) => {
      const state = graphNodes.get(id);
      return state && (Math.abs(state.screen.x - position.screen.x) > 0.001 || Math.abs(state.screen.y - position.screen.y) > 0.001);
    });
  };
  const commitGraphPositions = (reset = false) => {
    const positions = {};
    graphNodes.forEach((state, id) => {
      positions[id] = { x: roundGraphCoord(state.source.x), y: roundGraphCoord(state.source.y) };
    });
    const EventCtor = doc.defaultView?.CustomEvent || CustomEvent;
    figure.dispatchEvent(new EventCtor('minxi:graph-positions', {
      bubbles: true,
      detail: { graphIndex: Number(figure.dataset.graphIndex || 0), reset, positions },
    }));
  };
  let draggedGraphNode = null;
  let graphNodeDrag = null;
  let suppressGraphClick = false;
  const setGraphAdjustMode = (on) => {
    if (on && !graphAdjustMode) {
      graphPositionSnapshot = captureGraphPositions();
      graphPositionsDirty = false;
    }
    if (!on && graphAdjustMode) {
      // 未点「保存点位」就退出调整：丢弃本地暂存，恢复进入调整前的位置，
      // 不向源码派发任何坐标，也不会触发重新渲染。
      if (graphPositionsDirty) restoreGraphPositions(graphPositionSnapshot);
      graphPositionSnapshot = null;
      graphPositionsDirty = false;
    }
    graphAdjustMode = on;
    figure.classList.toggle('is-adjusting', on);
    if (adjustButton) {
      adjustButton.setAttribute('aria-pressed', String(on));
      adjustButton.textContent = on ? '退出调整' : '调整点位';
    }
    if (savePositionsButton) savePositionsButton.hidden = !on;
    if (resetPositionButton) resetPositionButton.hidden = !on;
    // 进入调整先隐藏读数且不改其文本，占位高度保持不变，拖动全程零抖动。
    readout.style.visibility = on ? 'hidden' : '';
    if (!on) readout.textContent = graphReadoutHint;
  };
  if (adjustButton) adjustButton.addEventListener('click', () => setGraphAdjustMode(!graphAdjustMode));
  if (savePositionsButton) {
    savePositionsButton.addEventListener('click', () => {
      // 调整完毕的统一提交点：无论之前连续拖了多少个点，只派发一次事件，
      // 后台据此一次性写回全部坐标并只重新渲染一次。
      commitGraphPositions(false);
      graphPositionSnapshot = captureGraphPositions();
      graphPositionsDirty = false;
      savePositionsButton.textContent = '已保存';
      const view = doc.defaultView;
      const restoreLabel = () => { savePositionsButton.textContent = '保存点位'; };
      if (view?.setTimeout) view.setTimeout(restoreLabel, 1400); else setTimeout(restoreLabel, 1400);
    });
  }
  if (resetPositionButton) {
    resetPositionButton.addEventListener('click', () => {
      commitGraphPositions(true);
      updateReadout('已请求重置点位：恢复自动布局…');
    });
  }

  toolbar.querySelectorAll('[data-graph-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.graphAction === 'zoom-in') zoomAt(centerPoint(), 0.75);
      if (button.dataset.graphAction === 'zoom-out') zoomAt(centerPoint(), 1.333333);
      if (button.dataset.graphAction === 'reset') { current = [...initial]; apply(); }
    });
  });

  const pointers = new Map();
  let dragStart = null;
  let pinchStart = null;
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button > 0) return;
    const nodeGroup = editableGraph && graphAdjustMode ? event.target?.closest?.('.graph-node-group') : null;
    if (nodeGroup && stage.contains(nodeGroup) && !pointers.size) {
      const point = svgPoint(event);
      const state = graphNodes.get(nodeGroup.dataset.nodeId);
      if (point && state) {
        pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
        try { stage.setPointerCapture(event.pointerId); } catch { /* 忽略 */ }
        draggedGraphNode = nodeGroup;
        graphNodeDrag = { pointerId: event.pointerId, start: point, screen: { ...state.screen } };
        stage.querySelectorAll('.graph-node-group.is-selected, .graph-edge-group.is-selected').forEach((el) => el.classList.remove('is-selected'));
        nodeGroup.classList.add('is-selected', 'is-dragging-node');
        updateReadout(`点 ${nodeGroup.dataset.nodeLabel || nodeGroup.dataset.nodeId}：x = ${roundGraphCoord(state.source.x)}，y = ${roundGraphCoord(state.source.y)}（拖动中）`);
        stage.classList.add('is-dragging');
        return;
      }
    }
    pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    try { stage.setPointerCapture(event.pointerId); } catch { /* 忽略 */ }
    if (pointers.size === 1) dragStart = { clientX: event.clientX, clientY: event.clientY, view: [...current] };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), view: [...current] };
      dragStart = null;
    }
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', (event) => {
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      if (draggedGraphNode && graphNodeDrag?.pointerId === event.pointerId) {
        const point = svgPoint(event);
        const state = graphNodes.get(draggedGraphNode.dataset.nodeId);
        if (point && state) {
          const next = {
            x: clamp(graphNodeDrag.screen.x + point.x - graphNodeDrag.start.x, initial[0] + state.size, initial[0] + initial[2] - state.size),
            y: clamp(graphNodeDrag.screen.y + point.y - graphNodeDrag.start.y, initial[1] + state.size, initial[1] + initial[3] - state.size),
          };
          setGraphNodeScreen(draggedGraphNode, next);
          refreshGraphPositionsDirty();
          updateReadout(`点 ${draggedGraphNode.dataset.nodeLabel || draggedGraphNode.dataset.nodeId}：x = ${roundGraphCoord(state.source.x)}，y = ${roundGraphCoord(state.source.y)}（已暂存，保存点位后统一写回）`);
        }
        return;
      }
      const rect = svg.getBoundingClientRect();
      if (pointers.size === 1 && dragStart && rect.width) {
        current = [...dragStart.view];
        current[0] -= ((event.clientX - dragStart.clientX) / rect.width) * current[2];
        current[1] -= ((event.clientY - dragStart.clientY) / rect.height) * current[3];
        apply();
      } else if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (distance > 0) {
          const base = pinchStart.view;
          const centerOfBase = { x: base[0] + base[2] / 2, y: base[1] + base[3] / 2 };
          zoomAt(centerOfBase, pinchStart.distance / distance, base);
        }
      }
      return;
    }
    const edge = event.target?.closest?.('.graph-edge-group');
    stage.querySelectorAll('.graph-edge-group.is-hovered').forEach((el) => {
      if (el !== edge) el.classList.remove('is-hovered');
    });
    if (edge && stage.contains(edge)) {
      edge.classList.add('is-hovered');
      const arrow = edge.dataset.directed === 'true' ? ' → ' : ' — ';
      showDisplay(event, `边 ${edge.dataset.from}${arrow}${edge.dataset.to}`, edgeDetail(edge));
      return;
    }
    const group = event.target?.closest?.('.graph-node-group');
    if (group && stage.contains(group)) {
      showDisplay(event, `点 ${group.dataset.nodeLabel || group.dataset.nodeId}`, nodeDetail(group));
    } else {
      hideTooltip();
      if (algorithmSummary) updateReadout(algorithmSummary);
    }
  });
  stage.addEventListener('pointerleave', () => {
    hideTooltip();
    if (algorithmSummary) updateReadout(algorithmSummary);
  });
  stage.addEventListener('click', (event) => {
    if (suppressGraphClick) { suppressGraphClick = false; return; }
    const edge = event.target?.closest?.('.graph-edge-group');
    const group = event.target?.closest?.('.graph-node-group');
    stage.querySelectorAll('.graph-node-group.is-selected, .graph-edge-group.is-selected').forEach((el) => el.classList.remove('is-selected'));
    if (edge && stage.contains(edge)) {
      edge.classList.add('is-selected');
      const arrow = edge.dataset.directed === 'true' ? ' → ' : ' — ';
      showDisplay(event, `边 ${edge.dataset.from}${arrow}${edge.dataset.to}`, edgeDetail(edge));
    } else if (group && stage.contains(group)) {
      group.classList.add('is-selected');
      showDisplay(event, `点 ${group.dataset.nodeLabel || group.dataset.nodeId}`, nodeDetail(group));
    }
  });
  const finish = (event) => {
    if (draggedGraphNode && graphNodeDrag?.pointerId === event.pointerId) {
      const group = draggedGraphNode;
      draggedGraphNode = null;
      graphNodeDrag = null;
      group.classList.remove('is-dragging-node');
      suppressGraphClick = true;
      refreshGraphPositionsDirty();
      updateReadout(`点 ${group.dataset.nodeLabel || group.dataset.nodeId} 的位置已暂存，点「保存点位」统一写回源码`);
    }
    pointers.delete(event.pointerId);
    if (!pointers.size) { dragStart = null; pinchStart = null; stage.classList.remove('is-dragging'); }
  };
  const cancelDrag = (event) => {
    if (draggedGraphNode && graphNodeDrag?.pointerId === event.pointerId) {
      setGraphNodeScreen(draggedGraphNode, graphNodeDrag.screen);
      refreshGraphPositionsDirty();
      draggedGraphNode.classList.remove('is-dragging-node');
      draggedGraphNode = null;
      graphNodeDrag = null;
    }
    pointers.delete(event.pointerId);
    if (!pointers.size) { dragStart = null; pinchStart = null; stage.classList.remove('is-dragging'); }
  };
  stage.addEventListener('pointerup', finish);
  stage.addEventListener('pointercancel', cancelDrag);
  stage.addEventListener('wheel', (event) => {
    const point = svgPoint(event);
    if (!point) return;
    event.preventDefault();
    zoomAt(point, Math.exp(event.deltaY * 0.0012));
  }, { passive: false });
  stage.addEventListener('dblclick', () => { current = [...initial]; apply(); });
}

function initPlots(root = document) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('.md-plot').forEach(initPlot);
  root.querySelectorAll('.md-graph').forEach(initGraph);
}

initPlots(document);

window.MinxiPlots = { initPlot, initGraph, initPlots, downloadFigureAsPng };
