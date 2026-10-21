import plots from '../lib/plots.cjs';

const { parsePlotSpec, renderPlotSvgInner, resolvePlotRanges, analyzeGraphData, lineEquation } = plots;

const number = (value) => {
  const rounded = Number(Number(value).toFixed(4));
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const raf = (callback) => (window.requestAnimationFrame ? window.requestAnimationFrame(callback) : window.setTimeout(callback, 0));

/* ---------------- 函数图像：拖动平移 / 滚轮与双指缩放 / 坐标读数 ---------------- */

function initPlot(figure) {
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
  // 未选中任何点时不显示任何坐标（悬停也只加粗直线/放大圆点）。
  const defaultReadout = '拖动平移、滚轮缩放；选中点或交点看坐标，选中直线看方程式。';
  let selectedPointKey = null;
  let selectedPointInfo = null;
  let selectedLineKey = null;
  let selectedLineInfo = null;
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

  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button > 0) return;
    const point = svgPoint(event);
    if (!point) return;
    pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY, point });
    try { stage.setPointerCapture(event.pointerId); } catch { /* 测试环境可能没有指针捕获 */ }
    moved = false;
    if (pointers.size === 1) {
      dragStart = { point, x: [...state.x], y: [...state.y] };
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
    hideTooltip();
    stage.classList.add('is-dragging');
  });

  stage.addEventListener('pointermove', (event) => {
    if (pointers.has(event.pointerId)) {
      const point = svgPoint(event);
      if (!point) return;
      pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY, point });

      if (pointers.size === 1 && dragStart) {
        const frame = frameBox();
        const dxData = ((point.x - dragStart.point.x) / frame.width) * (dragStart.x[1] - dragStart.x[0]);
        const dyData = ((point.y - dragStart.point.y) / frame.height) * (dragStart.y[1] - dragStart.y[0]);
        if (Math.abs(event.movementX || 0) > 0 || Math.abs(point.x - dragStart.point.x) + Math.abs(point.y - dragStart.point.y) > 2) moved = true;
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
  stage.addEventListener('pointerleave', () => { hideTooltip(); clearLineHover(); });

  // 点击（未拖动）选中一个点/交点：微微放大并固定显示它的坐标；
  // 点别处取消选中。拖动后的 click 会被 moved 标志吞掉，不会误选。
  stage.addEventListener('click', (event) => {
    if (moved) { moved = false; return; }
    const target = event.target?.closest?.('[data-kind="point"], [data-kind="intersection"]');
    const lineTarget = event.target?.closest?.('[data-kind="function"], [data-kind="segment"]');
    if (target && stage.contains(target)) {
      selectedLineKey = null;
      selectedLineInfo = null;
      selectedPointInfo = {
        kind: target.dataset.kind,
        x: target.dataset.x,
        y: target.dataset.y,
        label: target.dataset.kind === 'intersection' ? '交点' : '点',
      };
      selectedPointKey = pointKey(target);
      clearLineHover();
      draw();
      if (state.coords) showDisplay(event, `(${number(selectedPointInfo.x)}, ${number(selectedPointInfo.y)})`);
      else { hideTooltip(); updateSelectedReadout(); }
    } else if (lineTarget && stage.contains(lineTarget)) {
      selectedPointInfo = null;
      selectedPointKey = null;
      selectedLineKey = lineKey(lineTarget);
      selectedLineInfo = lineTarget.dataset.kind === 'function'
        ? { kind: 'function', equation: `y = ${spec.functions[Number(lineTarget.dataset.functionIndex)]?.expr || ''}` }
        : { kind: 'segment', equation: lineEquation([Number(lineTarget.dataset.x1), Number(lineTarget.dataset.y1)], [Number(lineTarget.dataset.x2), Number(lineTarget.dataset.y2)]) };
      clearLineHover();
      draw();
      if (selectedLineInfo.equation) showDisplay(event, selectedLineInfo.equation);
      else { hideTooltip(); updateSelectedReadout(); }
    } else {
      selectedPointInfo = null;
      selectedPointKey = null;
      selectedLineKey = null;
      selectedLineInfo = null;
      draw();
      hideTooltip();
      updateSelectedReadout();
    }
  });

  const finishPointer = (event) => {
    pointers.delete(event.pointerId);
    if (!pointers.size) {
      dragStart = null;
      pinchStart = null;
      stage.classList.remove('is-dragging');
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
  figure.insertBefore(toolbar, stage);
  const readout = doc.createElement('p');
  readout.className = 'plot-readout';
  readout.setAttribute('aria-live', 'polite');
  readout.textContent = '拖动平移，滚轮或双指缩放；把指针移到点上可查看点名。';
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
    readout.textContent = detail ? `${title}：${detail}` : title;
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
    if (restoreReadout) readout.textContent = '拖动平移，滚轮或双指缩放；把指针移到点上可查看点名。';
  };
  const edgeName = (el) => `${nameOf(el.dataset.from)} — ${nameOf(el.dataset.to)}`;
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
    readout.textContent = algorithmSummary;
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
      showDisplay(event, `边 ${edge.dataset.from}${arrow}${edge.dataset.to}`, edge.dataset.label || (edge.dataset.directed === 'true' ? '有向边' : '无向边'));
      return;
    }
    const group = event.target?.closest?.('.graph-node-group');
    if (group && stage.contains(group)) {
      showDisplay(event, `点 ${group.dataset.nodeLabel || group.dataset.nodeId}`);
    } else {
      hideTooltip();
      if (algorithmSummary) readout.textContent = algorithmSummary;
    }
  });
  stage.addEventListener('pointerleave', () => {
    hideTooltip();
    if (algorithmSummary) readout.textContent = algorithmSummary;
  });
  stage.addEventListener('click', (event) => {
    const edge = event.target?.closest?.('.graph-edge-group');
    const group = event.target?.closest?.('.graph-node-group');
    stage.querySelectorAll('.graph-node-group.is-selected, .graph-edge-group.is-selected').forEach((el) => el.classList.remove('is-selected'));
    if (edge && stage.contains(edge)) {
      edge.classList.add('is-selected');
      const arrow = edge.dataset.directed === 'true' ? ' → ' : ' — ';
      showDisplay(event, `边 ${edge.dataset.from}${arrow}${edge.dataset.to}`, edge.dataset.label || (edge.dataset.directed === 'true' ? '有向边' : '无向边'));
    } else if (group && stage.contains(group)) {
      group.classList.add('is-selected');
      showDisplay(event, `点 ${group.dataset.nodeLabel || group.dataset.nodeId}`);
    }
  });
  const finish = (event) => {
    pointers.delete(event.pointerId);
    if (!pointers.size) { dragStart = null; pinchStart = null; stage.classList.remove('is-dragging'); }
  };
  stage.addEventListener('pointerup', finish);
  stage.addEventListener('pointercancel', finish);
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

window.MinxiPlots = { initPlot, initGraph, initPlots };
