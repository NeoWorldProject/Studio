// Scene 01 cover: prebaked feature edges drawn by a small WebGL line renderer, so the first
// screen does not wait for Three.js. Framing matches the original OrthographicCamera setup.
window.createSceneHero = function createSceneHero() {
  const host = document.querySelector('#world');
  const hero = document.querySelector('.hero');
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) throw new Error('WebGL is unavailable');
  host.append(canvas);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rootStyle = getComputedStyle(document.documentElement);
  const accent = parseColor(rootStyle.getPropertyValue('--accent')) || [.72, .95, .29];
  const secondary = parseColor(rootStyle.getPropertyValue('--hero-wire')) || [.55, .6, .46];
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  const target = [0, 0, 0];
  const matrix = new Float32Array(16);
  let axes;
  let data, bounds, focusBounds, resources;
  let ready = false, disposed = false, paused = false, visible = true, dirty = true;
  let width = 1, height = 1, baseHeight = 10, frustum = { left: -6, right: 6, top: 5, bottom: -5 };
  let buildStart = 0, building = false;

  function parseColor(value) {
    value = value.trim();
    let match = value.match(/^#([\da-f]{3,8})$/i);
    if (match) {
      let hex = match[1];
      if (hex.length <= 4) hex = [...hex].map(c => c + c).join('');
      return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    }
    match = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    return match ? match.slice(1, 4).map(n => Number(n) / 255) : null;
  }

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const normalize = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const deg = value => value * Math.PI / 180;

  function pose() {
    // Stay on the open side of the reconstruction, above the furniture.
    const azimuth = deg(4 + eased.x * 12);
    const elevation = deg(15 - eased.y * 6);
    const eye = [
      target[0] + 20 * Math.cos(elevation) * Math.sin(azimuth),
      target[1] + 20 * Math.sin(elevation),
      target[2] + 20 * Math.cos(elevation) * Math.cos(azimuth),
    ];
    const z = normalize(sub(eye, target));
    const x = normalize(cross([0, 1, 0], z));
    const y = cross(z, x);
    axes = { x, y, z, eye };
  }

  function updateMatrix() {
    // projection(ortho, near .1, far 80) * view(lookAt)
    const { x, y, z, eye } = axes;
    const { left, right, top, bottom } = frustum;
    const sx = 2 / (right - left), sy = 2 / (top - bottom), sz = -2 / (80 - .1);
    const tx = -(right + left) / (right - left), ty = -(top + bottom) / (top - bottom), tz = -(80 + .1) / (80 - .1);
    const rows = [[x, -dot(x, eye), sx, tx], [y, -dot(y, eye), sy, ty], [z, -dot(z, eye), sz, tz]];
    rows.forEach(([axis, offset, scale, shift], row) => {
      matrix[row] = axis[0] * scale;
      matrix[4 + row] = axis[1] * scale;
      matrix[8 + row] = axis[2] * scale;
      matrix[12 + row] = offset * scale + shift;
    });
    matrix[3] = matrix[7] = matrix[11] = 0; matrix[15] = 1;
  }

  function fit() {
    if (!focusBounds) return;
    // Fit all allowed mouse angles, so the furniture stays framed at every extreme.
    let halfWidth = 0, halfHeight = 0;
    const saved = { ...eased };
    for (const ex of [-1, 0, 1]) for (const ey of [-1, 0, 1]) {
      eased.x = ex; eased.y = ey; pose();
      for (const bx of [focusBounds.min.x, focusBounds.max.x]) for (const by of [focusBounds.min.y, focusBounds.max.y]) for (const bz of [focusBounds.min.z, focusBounds.max.z]) {
        const relative = sub([bx, by, bz], axes.eye);
        halfWidth = Math.max(halfWidth, Math.abs(dot(axes.x, relative)));
        halfHeight = Math.max(halfHeight, Math.abs(dot(axes.y, relative)));
      }
    }
    Object.assign(eased, saved); pose();
    baseHeight = Math.max(halfHeight * 2, halfWidth * 2 / (width / height)) / .95;
    const offsetY = baseHeight * -0.3;
    const right = baseHeight * width / height / 2;
    frustum = { left: -right, right, top: baseHeight / 2, bottom: -baseHeight / 2 + offsetY };
    dirty = true;
  }

  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
    return result;
  }

  function upload() {
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec3 position;uniform mat4 matrix;uniform vec3 lo;uniform vec3 span;void main(){gl_Position=matrix*vec4(lo+position*span,1.0);}'));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, 'precision mediump float;uniform vec4 tint;void main(){gl_FragColor=tint;}'));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniforms = Object.fromEntries(['matrix', 'lo', 'span', 'tint'].map(name => [name, gl.getUniformLocation(program, name)]));
    const buffer = (kind, array) => { const b = gl.createBuffer(); gl.bindBuffer(kind, b); gl.bufferData(kind, array, gl.STATIC_DRAW); return b; };
    const wide = data.indices instanceof Uint32Array;
    if (wide && !gl.getExtension('OES_element_index_uint')) throw new Error('32-bit indices are unsupported');
    resources = {
      program, uniforms, position: gl.getAttribLocation(program, 'position'),
      vertices: buffer(gl.ARRAY_BUFFER, data.positions), indices: buffer(gl.ELEMENT_ARRAY_BUFFER, data.indices),
      grid: buffer(gl.ARRAY_BUFFER, data.grid), indexType: wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, indexSize: wide ? 4 : 2,
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  function gridLines(y) {
    // Same layout as THREE.GridHelper(11, 22): centre lines first, then the rest.
    const centre = [], rest = [];
    for (let i = 0; i <= 22; i += 1) {
      const k = -5.5 + i * .5, list = i === 11 ? centre : rest;
      list.push(-5.5, y, k, 5.5, y, k, k, y, -5.5, k, y, 5.5);
    }
    return { array: new Float32Array([...centre, ...rest]), centre: centre.length / 3, rest: rest.length / 3 };
  }

  const easeOut = t => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

  function render(now) {
    const { uniforms: u, position } = resources;
    const elapsed = building ? (now - buildStart) / 1000 : Infinity;
    const structureShown = easeOut(elapsed / 1.9), accentShown = easeOut((elapsed - .35) / 1.9), gridShown = easeOut(elapsed / .9);
    if (building && elapsed > 2.3) building = false;
    updateMatrix();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(resources.program);
    gl.uniformMatrix4fv(u.matrix, false, matrix);
    gl.enableVertexAttribArray(position);
    const tint = (rgb, alpha) => gl.uniform4f(u.tint, rgb[0] * alpha, rgb[1] * alpha, rgb[2] * alpha, alpha);

    gl.bindBuffer(gl.ARRAY_BUFFER, resources.grid);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    gl.uniform3f(u.lo, 0, 0, 0); gl.uniform3f(u.span, 1, 1, 1);
    tint(secondary, .15 * gridShown); gl.drawArrays(gl.LINES, data.gridCentre, data.gridRest);
    tint(secondary, .26 * gridShown); gl.drawArrays(gl.LINES, 0, data.gridCentre);

    gl.bindBuffer(gl.ARRAY_BUFFER, resources.vertices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.indices);
    gl.vertexAttribPointer(position, 3, gl.UNSIGNED_SHORT, true, 6, 0);
    gl.uniform3fv(u.lo, data.lo); gl.uniform3fv(u.span, data.span);
    const count = (total, shown) => Math.floor(total * shown / 2) * 2;
    const structure = count(data.structureCount, structureShown), accentLines = count(data.accentCount, accentShown);
    tint(secondary, .42); if (structure) gl.drawElements(gl.LINES, structure, resources.indexType, data.accentCount * resources.indexSize);
    tint(accent, .8); if (accentLines) gl.drawElements(gl.LINES, accentLines, resources.indexType, 0);
  }

  const resize = new ResizeObserver(() => {
    width = Math.max(host.clientWidth, 1); height = Math.max(host.clientHeight, 1);
    const ratio = Math.min(devicePixelRatio, 1.5);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    fit(); dirty = true;
  });
  resize.observe(host);

  function move(event) {
    if (paused || event.pointerType === 'touch') return;
    const rect = hero.getBoundingClientRect();
    const clamp = value => Math.min(Math.max(value, -1), 1);
    pointer.x = clamp((event.clientX - rect.left) / rect.width * 2 - 1);
    pointer.y = clamp((event.clientY - rect.top) / rect.height * 2 - 1);
  }
  function leave() { pointer.x = pointer.y = 0; }
  hero.addEventListener('pointermove', move);
  hero.addEventListener('pointerleave', leave);

  function lost(event) { event.preventDefault(); ready = false; }
  function restored() { if (!data) return; upload(); ready = true; dirty = true; }
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);

  async function fetchWireframe() {
    const base = 'optimized/scene-wireframe.nwf2';
    if ('DecompressionStream' in window) {
      try {
        const response = await fetch(`${base}.gz`);
        if (response.ok) return await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      } catch (error) { /* fall through to the uncompressed file */ }
    }
    const response = await fetch(base);
    if (!response.ok) throw new Error(`Could not load wireframe (${response.status})`);
    return response.arrayBuffer();
  }

  (async () => {
    try {
      const buffer = await fetchWireframe();
      const view = new DataView(buffer);
      if (view.getUint32(0, false) !== 0x4e574632) throw new Error('Invalid wireframe header');
      const [vertexCount, accentCount, structureCount] = [4, 8, 12].map(offset => view.getUint32(offset, true));
      const floats = offset => [0, 1, 2].map(i => view.getFloat32(offset + i * 4, true));
      const lo = floats(16), hi = floats(28), focusLo = floats(40), focusHi = floats(52);
      const positionBytes = vertexCount * 6, indexOffset = 64 + positionBytes + (4 - positionBytes % 4) % 4;
      const Index = vertexCount < 65536 ? Uint16Array : Uint32Array;
      const box = (min, max) => ({ min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] } });
      bounds = box(lo, hi);
      focusBounds = accentCount ? box(focusLo, focusHi) : bounds;
      target[0] = (focusBounds.min.x + focusBounds.max.x) / 2;
      target[1] = (focusBounds.min.y + focusBounds.max.y) / 2;
      target[2] = (focusBounds.min.z + focusBounds.max.z) / 2;
      const grid = gridLines(lo[1] - .025);
      data = {
        positions: new Uint16Array(buffer, 64, vertexCount * 3), indices: new Index(buffer, indexOffset, accentCount + structureCount),
        lo, span: hi.map((value, i) => value - lo[i]), accentCount, structureCount,
        grid: grid.array, gridCentre: grid.centre, gridRest: grid.rest,
      };
      if (disposed) return;
      upload();
      ready = true; host.dataset.scene = 'scene-01'; fit();
      building = !reduced.matches && !paused;
      buildStart = performance.now();
      host.classList.add('is-ready');
    } catch (error) {
      host.dataset.scene = 'error';
      console.error('Scene 01 cover:', error);
    }
  })();

  let request;
  function frame(now) {
    if (disposed) return;
    request = requestAnimationFrame(frame);
    if (!visible || document.hidden || !ready) return;
    if (!paused && (Math.abs(eased.x - pointer.x) > .001 || Math.abs(eased.y - pointer.y) > .001)) {
      eased.x += (pointer.x - eased.x) * .045; eased.y += (pointer.y - eased.y) * .045;
      pose(); dirty = true;
    }
    if (dirty || building) { render(now); dirty = false; }
  }
  pose(); request = requestAnimationFrame(frame);

  return {
    canvas,
    get ready() { return ready; }, get bounds() { return bounds; }, get focusBounds() { return focusBounds; },
    get camera() { return { azimuth: 4 + eased.x * 12, elevation: 15 - eased.y * 6, ...frustum }; },
    setVisible(value) { visible = value; dirty = true; },
    setPaused(value) {
      paused = value;
      if (paused) { pointer.x = pointer.y = eased.x = eased.y = 0; building = false; pose(); dirty = true; }
    },
    destroy() {
      disposed = true; cancelAnimationFrame(request); resize.disconnect();
      hero.removeEventListener('pointermove', move); hero.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
      if (resources) {
        gl.deleteBuffer(resources.vertices); gl.deleteBuffer(resources.indices); gl.deleteBuffer(resources.grid);
        gl.deleteProgram(resources.program);
      }
      canvas.remove();
    },
  };
};
