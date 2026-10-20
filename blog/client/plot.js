import plots from '../lib/plots.cjs';

const { parsePlotSpec, renderPlotSvgInner, resolvePlotRanges } = plots;

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
    equations: figure.dataset.viewEquations === undefined ? spec.equations : figure.dataset.viewEquations === 'true',
  };
  const readout = figure.querySelector('.plot-readout');
  const equationsBox = figure.querySelector('.plot-equations');
  figure.classList.add('is-interactive');
  stage.tabIndex = 0;
  stage.setAttribute('role', 'application');
  stage.setAttribute('aria-label', '可拖动平移、滚轮缩放的函数图像');

  const syncToggles = () => {
    figure.querySelectorAll('[data-plot-toggle]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Boolean(state[button.dataset.plotToggle])));
    });
    if (equationsBox) equationsBox.hidden = !state.equations;
    figure.dataset.viewCoords = String(state.coords);
    figure.dataset.viewIntersections = String(state.intersections);
    figure.dataset.viewEquations = String(state.equations);
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
    });
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
        if (readout) readout.textContent = '已重置视图。拖动平移，滚轮或双指缩放。';
      }
    });
  });
  figure.querySelectorAll('[data-plot-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.plotToggle;
      state[key] = !state[key];
      if (key === 'equations') syncToggles();
      else draw();
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
        state.x = dragStart.x.map((value) => value - dxData);
        state.y = dragStart.y.map((value) => value - dyData);
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
      if (kind === 'point') readout.textContent = `${target.dataset.label || '点'}：(${number(target.dataset.x)}, ${number(target.dataset.y)})`;
      else if (kind === 'intersection') readout.textContent = `${target.dataset.label || '交点'}：(${number(target.dataset.x)}, ${number(target.dataset.y)})`;
      else if (kind === 'function') readout.textContent = `${target.dataset.equation || '函数'}，当前 x = ${number(data.x)}，y = ${number(spec.functions[Number(target.dataset.functionIndex)]?.fn(data.x))}`;
      else if (kind === 'segment') readout.textContent = `线段方程：${target.dataset.equation || ''}（端点 (${number(target.dataset.x1)}, ${number(target.dataset.y1)}) → (${number(target.dataset.x2)}, ${number(target.dataset.y2)})）`;
      return;
    }
    if (!data.inside) return;
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
    if (nearest && nearest.distance <= 16) {
      readout.textContent = `${spec.functions[nearest.index].label || `曲线 ${nearest.index + 1}`}：(${number(data.x)}, ${number(nearest.y)}) · y = ${spec.functions[nearest.index].expr}`;
    } else {
      readout.textContent = `当前坐标：(${number(data.x)}, ${number(data.y)})`;
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
  toolbar.innerHTML = '<div class="plot-tools" role="group" aria-label="缩放"><button type="button" data-graph-action="zoom-out" aria-label="缩小">−</button><button type="button" data-graph-action="zoom-in" aria-label="放大">＋</button><button type="button" data-graph-action="reset">重置</button></div>';
  figure.insertBefore(toolbar, stage);
  const readout = doc.createElement('p');
  readout.className = 'plot-readout';
  readout.setAttribute('aria-live', 'polite');
  readout.textContent = '拖动平移，滚轮或双指缩放；把指针移到点上可查看坐标。';
  stage.after(readout);

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
    const group = event.target?.closest?.('.graph-node-group');
    if (group && stage.contains(group)) {
      readout.textContent = `点 ${group.dataset.nodeId}：(${group.dataset.x}, ${group.dataset.y})`;
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
