/* Original URDF kinematic viewer. Three.js r134; joint transforms stay in URDF coordinates. */
(() => {
  'use strict';
  const T = window.THREE;
  const motionStage = document.querySelector('.object-stage');
  const stage = document.querySelector('#object-canvas');
  const referenceFrame = document.querySelector('.object-reference');
  const referenceImage = document.querySelector('#object-reference-image');
  const referenceLoading = document.querySelector('#object-reference-loading');
  const referenceTitle = document.querySelector('#object-reference-title');
  const panel = document.querySelector('#joint-controls');
  const loading = document.querySelector('#object-loading');
  const workspace = document.querySelector('.object-workspace');
  const assetMode = document.querySelector('meta[name="asset-mode"]')?.content || 'source';
  const compressedAssets = assetMode === 'gzip' || assetMode === 'bundle';
  const playButton = document.querySelector('#object-play');
  const resetButton = document.querySelector('#object-reset');
  const linkSelect = document.querySelector('#object-links');
  const objects = {
    '10449': { title: 'SCISSORS', label: 'Scissors', reference: 'optimized/references/10449.webp', names: { scissor_pivot: 'Scissor opening' } },
    '8994': { title: 'DOOR', label: 'Door', reference: 'optimized/references/8994.webp', names: { door_hinge: 'Door opening', knob_spindle: 'Handle rotation' } },
    '101917': { title: 'OVEN', label: 'Oven', reference: 'optimized/references/101917.webp', names: { oven_door_hinge: 'Oven door' } },
    '101463': { title: 'SPRAY BOTTLE', label: 'Spray bottle', reference: 'optimized/references/101463.webp', names: { closure_turn: 'Bottle closure', head_swivel: 'Sprayer head', trigger_hinge: 'Trigger press', plunger_slide: 'Pump travel' } },
    '103967': { title: 'GLOBE', label: 'Globe', reference: 'optimized/references/103967.webp', names: { globe_spin: 'Globe rotation' } },
    '100520': { title: 'FOLDING CHAIR', label: 'Folding chair', reference: 'optimized/references/100520.webp', names: { left_link_pivot: 'Left linkage', right_link_pivot: 'Right linkage', seat_fold: 'Seat fold', rear_frame_fold: 'Rear frame' } },
    '100842': { title: 'SUITCASE', label: 'Suitcase', reference: 'optimized/references/100842.webp', names: { front_lid_hinge: 'Front lid', top_carry_handle_fold: 'Top handle', side_carry_handle_fold: 'Side handle', wheel_front_left_roll: 'Front-left wheel', wheel_front_right_roll: 'Front-right wheel', wheel_rear_left_roll: 'Rear-left wheel', wheel_rear_right_roll: 'Rear-right wheel', telescoping_handle_slide: 'Telescoping handle' } },
    '101052': { title: 'UTILITY KNIFE', label: 'Utility knife', reference: 'optimized/references/101052.webp', names: { blade_slider_translation: 'Blade extension' } },
    '101220': { title: 'INDUSTRIAL FAN', label: 'Industrial fan', reference: 'optimized/references/101220.webp', names: { joint_01: 'Fan rotor' } },
    '101284': { title: 'SAFETY GLASSES', label: 'Safety glasses', reference: 'optimized/references/101284.webp', names: { temple_left_hinge: 'Left temple', temple_right_hinge: 'Right temple' } },
  };
  let renderer, scene, camera, orbit, grid, current, inView = false, dirty = true;
  let selectedLink = '', showAxes = false, wireframe = false, playing = false, generation = 0;
  let selectedId = '10449', playTime = 0, lastTime = 0, playStart = new Map();
  let resumeOnVisibility = false;
  const cache = new Map();
  const raycaster = new T.Raycaster();
  const pointer = new T.Vector2();
  const accent = () => new T.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()).convertSRGBToLinear();
  const vector = (value, fallback = [0, 0, 0]) => value ? value.trim().split(/\s+/).map(Number) : fallback;
  function transform(group, origin) {
    group.position.fromArray(vector(origin?.getAttribute('xyz')));
    // URDF fixed-axis roll/pitch/yaw = Rz(yaw) Ry(pitch) Rx(roll).
    const rpy = vector(origin?.getAttribute('rpy'));
    group.quaternion.setFromEuler(new T.Euler(...rpy, 'ZYX'));
  }
  const assetKey = (url, base) => decodeURIComponent(url.pathname.slice(base.pathname.length));
  async function loadBundle(id, base) {
    if (assetMode !== 'bundle' || !('DecompressionStream' in window)) return null;
    const response = await fetch(new URL(`${id}.bundle.gz?v=geometry-26`, base));
    if (!response.ok) return null;
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  async function text(url, assets, base) {
    const bundled = assets?.text?.[assetKey(url, base)];
    if (bundled !== undefined) return bundled;
    if (compressedAssets && url.pathname.endsWith('.obj') && 'DecompressionStream' in window) {
      const compressed = await fetch(`${url.href}.gz`);
      if (compressed.ok) {
        const stream = compressed.body.pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).text();
      }
    }
    const response = await fetch(url, assetMode === 'source' ? { cache: 'no-store' } : undefined);
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
    return response.text();
  }
  const textureCache = new Map();
  const referenceCache = new Map();
  let referencesWarmed = false;
  function referenceAsset(id) {
    const url = new URL(objects[id].reference, location.href).href;
    if (!referenceCache.has(url)) {
      const request = new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = async () => {
          try { await image.decode(); } catch (_) { /* The decoded bitmap is still usable after load. */ }
          resolve(image);
        };
        image.onerror = () => reject(new Error(`Could not load reference image ${url}`));
        image.src = url;
      }).catch(error => { referenceCache.delete(url); throw error; });
      referenceCache.set(url, request);
    }
    return referenceCache.get(url);
  }
  function warmReferenceAssets(selected) {
    if (referencesWarmed) return;
    referencesWarmed = true;
    const run = () => { for (const id of Object.keys(objects)) if (id !== selected) referenceAsset(id).catch(() => {}); };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 350);
  }
  async function loadReference(id, token) {
    const config = objects[id];
    referenceTitle.textContent = `${config.title} / ${id}`;
    referenceImage.alt = `${config.label} reference image`;
    referenceImage.classList.add('is-loading');
    referenceFrame.setAttribute('aria-busy', 'true');
    referenceLoading.classList.remove('error');
    referenceLoading.querySelector('p').textContent = `Loading ${config.label.toLowerCase()} reference…`;
    referenceLoading.hidden = false;
    try {
      const image = await referenceAsset(id);
      if (token !== generation) return;
      referenceImage.src = image.src;
      referenceImage.classList.remove('is-loading');
      referenceLoading.hidden = true;
      referenceFrame.setAttribute('aria-busy', 'false');
      warmReferenceAssets(id);
    } catch (error) {
      if (token !== generation) return;
      console.error('Reference image:', error);
      referenceLoading.classList.add('error');
      referenceLoading.querySelector('p').textContent = 'Reference image unavailable.';
      referenceFrame.setAttribute('aria-busy', 'false');
    }
  }
  async function texture(url, assets, base) {
    const key = url.href;
    if (!textureCache.has(key)) {
      const encoded = assets?.binary?.[assetKey(url, base)];
      const extension = url.pathname.split('.').pop().toLowerCase();
      const source = encoded ? `data:image/${extension};base64,${encoded}` : key;
      textureCache.set(key, new Promise((resolve, reject) => {
        new T.TextureLoader().load(source, map => {
          map.encoding = T.sRGBEncoding;
          map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
          dirty = true; resolve(map);
        }, undefined, () => reject(new Error(`Could not load texture ${key}`)));
      }).catch(error => { textureCache.delete(key); throw error; }));
    }
    return textureCache.get(key);
  }
  async function parseMaterials(mtl, url, assets, base) {
    const materials = new Map(); let record;
    for (const line of mtl.split(/\r?\n/)) {
      const words = line.trim().split(/\s+/);
      if (words[0] === 'newmtl') { record = {}; materials.set(words.slice(1).join(' '), record); }
      if (!record) continue;
      if (words[0] === 'Kd') record.color = words.slice(1, 4).map(Number);
      if (words[0] === 'Ke') record.emissive = words.slice(1, 4).map(Number);
      if (words[0] === 'd') record.opacity = Number(words[1]);
      if (words[0] === 'map_Kd') record.mapUrl = new URL(words.slice(1).join(' '), url);
      if (words[0] === 'map_Ke') record.emissiveMapUrl = new URL(words.slice(1).join(' '), url);
    }
    await Promise.all([...materials.values()].map(async record => {
      if (record.mapUrl) record.map = await texture(record.mapUrl, assets, base);
      if (record.emissiveMapUrl) record.emissiveMap = await texture(record.emissiveMapUrl, assets, base);
    }));
    return materials;
  }
  async function visualMesh(element, base, linkName, assets) {
    const mesh = element.querySelector('geometry > mesh');
    if (!mesh) throw new Error('This asset requires an OBJ visual mesh.');
    const url = new URL(mesh.getAttribute('filename'), base);
    const source = await text(url, assets, base);
    const materials = new Map();
    for (const match of source.matchAll(/^mtllib\s+(.+)$/gm)) {
      const mtlUrl = new URL(match[1].trim(), url);
      const mtl = await text(mtlUrl, assets, base);
      for (const [name, record] of await parseMaterials(mtl, mtlUrl, assets, base)) materials.set(name, record);
    }
    const obj = new T.OBJLoader().parse(source);
    const rgba = vector(element.querySelector('material > color')?.getAttribute('rgba'), [.66, .66, .66, 1]);
    obj.traverse(child => {
      if (!child.isMesh) return;
      child.userData.linkName = linkName;
      if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
      const replace = old => {
        const record = materials.get(old.name) || {};
        const color = record.color || (record.map ? [1, 1, 1] : rgba);
        if (record.map && !child.geometry.attributes.uv) throw new Error(`Textured mesh has no UV coordinates: ${url}`);
        const emissive = record.emissive || (record.emissiveMap ? [.35, .35, .35] : [0, 0, 0]);
        const opacity = record.opacity ?? 1;
        const material = new T.MeshStandardMaterial({
          color: new T.Color(...color.slice(0, 3)), map: record.map || null,
          emissive: new T.Color(...emissive), emissiveMap: record.emissiveMap || null,
          opacity, transparent: opacity < 1,
          roughness: .56, metalness: .08, side: T.DoubleSide, wireframe,
        });
        material.userData.baseColor = material.color.clone();
        material.userData.baseEmissive = material.emissive.clone();
        old.dispose(); return material;
      };
      child.material = Array.isArray(child.material) ? child.material.map(replace) : replace(child.material);
    });
    const wrapper = new T.Group(); wrapper.name = element.getAttribute('name') || linkName;
    transform(wrapper, element.querySelector('origin'));
    wrapper.scale.fromArray(vector(mesh.getAttribute('scale'), [1, 1, 1]));
    wrapper.add(obj); return wrapper;
  }
  async function build(id) {
    const base = new URL(`./assets/batch5_collision_urdf_textured/${id}/`, location.href);
    const assets = await loadBundle(id, base);
    const source = await text(new URL(`${id}.urdf`, base), assets, base);
    const xml = new DOMParser().parseFromString(source, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Could not parse the URDF XML.');
    const robot = xml.querySelector('robot'); if (!robot) throw new Error('Missing robot node.');
    const links = new Map(); const joints = new Map(); const children = new Set();
    const root = new T.Group(); root.rotation.x = -Math.PI / 2;
    const jobs = [];
    for (const node of robot.querySelectorAll(':scope > link')) {
      const group = new T.Group(); const name = node.getAttribute('name');
      group.name = name; group.userData.linkName = name; links.set(name, group);
      for (const visual of node.querySelectorAll(':scope > visual')) jobs.push(visualMesh(visual, base, name, assets).then(mesh => group.add(mesh)));
    }
    for (const node of robot.querySelectorAll(':scope > joint')) {
      const name = node.getAttribute('name'), type = node.getAttribute('type');
      const parent = node.querySelector('parent').getAttribute('link'), child = node.querySelector('child').getAttribute('link');
      if (!links.has(parent) || !links.has(child)) throw new Error('Joint references an unknown link.');
      const origin = new T.Group(), motion = new T.Group(); transform(origin, node.querySelector('origin'));
      links.get(parent).add(origin); origin.add(motion); motion.add(links.get(child)); children.add(child);
      const axis = new T.Vector3(...vector(node.querySelector('axis')?.getAttribute('xyz'), [1, 0, 0])).normalize();
      const limit = node.querySelector('limit');
      const lower = type === 'continuous' ? -Math.PI : Number(limit?.getAttribute('lower') ?? 0);
      const upper = type === 'continuous' ? Math.PI : Number(limit?.getAttribute('upper') ?? 0);
      const joint = { name, type, parent, child, origin, motion, axis, lower, upper, value: 0 };
      joints.set(name, joint); apply(joint, Math.max(lower, Math.min(upper, 0)));
    }
    for (const [name, group] of links) if (!children.has(name)) root.add(group);
    await Promise.all(jobs);
    root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(root), size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
    if (box.isEmpty()) throw new Error('The model is empty.');
    root.position.sub(center);
    const extent = Math.max(size.x, size.y, size.z);
    for (const joint of joints.values()) {
      const arrow = new T.ArrowHelper(joint.axis, new T.Vector3(), extent * .35, accent(), extent * .055, extent * .035);
      arrow.visible = false; arrow.line.material.depthTest = false; arrow.cone.material.depthTest = false;
      arrow.line.renderOrder = arrow.cone.renderOrder = 10; joint.origin.add(arrow); joint.arrow = arrow;
    }
    return { id, root, links, joints, extent, size };
  }
  function apply(joint, value) {
    if (!Number.isFinite(value)) return;
    joint.value = Math.min(joint.upper, Math.max(joint.lower, value));
    joint.motion.position.set(0, 0, 0); joint.motion.quaternion.identity();
    if (joint.type === 'prismatic') joint.motion.position.copy(joint.axis).multiplyScalar(joint.value);
    if (joint.type === 'revolute' || joint.type === 'continuous') joint.motion.quaternion.setFromAxisAngle(joint.axis, joint.value);
    dirty = true;
  }
  const isSlide = joint => joint.type === 'prismatic';
  const displayValue = joint => isSlide(joint) ? joint.value : T.MathUtils.radToDeg(joint.value);
  const format = (joint, value) => value.toFixed(isSlide(joint) ? 6 : 1);
  function label(joint) { return objects[selectedId].names[joint.name] || `Dial ${joint.name.match(/knob_(\d+)/)?.[1] || joint.name}`; }
  function syncJoint(joint) {
    if (!joint.range) return;
    const value = format(joint, displayValue(joint)); joint.range.value = value; joint.input.value = value;
  }
  function setPlaying(value) {
    playing = Boolean(value && current); playTime = 0; playStart = new Map();
    if (playing) for (const j of current.joints.values()) playStart.set(j.name, j.value);
    playButton.textContent = playing ? 'Ⅱ Pause motion' : '▷ Play motion'; playButton.setAttribute('aria-pressed', String(playing));
    dirty = true;
  }
  function startVisibleMotion() {
    if (inView && !document.hidden && !document.body.classList.contains('paused') && !playButton.disabled && !playing) setPlaying(true);
  }
  function selectLink(name) {
    selectedLink = name; linkSelect.value = name;
    const selected = current?.links.get(name);
    // Include descendants when selecting a parent part, preserving kinematic hierarchy.
    const meshes = new Set(); selected?.traverse(child => { if (child.isMesh) meshes.add(child); });
    const color = accent();
    current?.root.traverse(child => {
      if (!child.isMesh || !child.userData.linkName) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of materials) {
        m.wireframe = wireframe;
        m.color.copy(m.userData.baseColor);
        if (meshes.has(child) && !m.map) m.color.lerp(color, .28);
        m.emissive.copy(m.userData.baseEmissive);
        if (meshes.has(child) && !m.map) m.emissive.lerp(color, .12);
      }
      if (meshes.has(child) && !child.userData.selectionOutline) {
        const outline = new T.LineSegments(new T.EdgesGeometry(child.geometry, 28), new T.LineBasicMaterial({ color, toneMapped: false }));
        child.add(outline); child.userData.selectionOutline = outline;
      }
      const outline = child.userData.selectionOutline;
      if (outline) { outline.visible = meshes.has(child) && !wireframe; outline.material.color.copy(color); }
    });
    let parentJoint;
    for (const j of current?.joints.values() || []) {
      if (j.child === name) parentJoint = j;
      j.row?.classList.toggle('active', j.child === name);
      j.arrow.visible = showAxes && (!name || j.child === name); j.arrow.setColor(color);
    }
    document.querySelector('#object-part').textContent = name ? `PART / ${name.replace(/^link_/, '')}` : 'Click a part to select it';
    document.querySelector('#object-relationship').textContent = parentJoint ? `${parentJoint.parent} → ${label(parentJoint)} → ${name}` : name ? 'Fixed root. Child parts connect through joints.' : 'Select a part to inspect its connections.';
    dirty = true;
  }
  function renderControls() {
    panel.replaceChildren(); linkSelect.replaceChildren(new Option('All parts', ''));
    let count = 0;
    for (const joint of current.joints.values()) {
      if (!['revolute', 'continuous', 'prismatic'].includes(joint.type)) continue;
      count++;
      const row = document.createElement('div'); row.className = 'joint-control'; row.dataset.joint = joint.name;
      const title = document.createElement('div'); title.className = 'joint-title';
      const select = document.createElement('button'); select.textContent = label(joint); select.addEventListener('click', () => selectLink(joint.child));
      const badge = document.createElement('span'); badge.textContent = isSlide(joint) ? 'SLIDE' : 'ROTATE'; title.append(select, badge);
      const valueRow = document.createElement('div'); valueRow.className = 'joint-value-row';
      const range = document.createElement('input'); range.type = 'range'; range.id = `range-${joint.name}`;
      const input = document.createElement('input'); input.type = 'number'; input.id = `value-${joint.name}`;
      const lower = isSlide(joint) ? joint.lower : T.MathUtils.radToDeg(joint.lower);
      const upper = isSlide(joint) ? joint.upper : T.MathUtils.radToDeg(joint.upper);
      for (const control of [range, input]) {
        control.min = Number(lower.toFixed(isSlide(joint) ? 9 : 6)); control.max = Number(upper.toFixed(isSlide(joint) ? 9 : 6)); control.step = isSlide(joint) ? 10 ** Math.floor(Math.log10(Math.max(upper - lower, 1e-6)) - 3) : .1;
        control.setAttribute('aria-label', `${label(joint)} ${control === range ? 'slider' : 'value'}, ${isSlide(joint) ? 'scene units' : 'degrees'}`);
      }
      function edit(raw) { if (raw.trim() === '') { syncJoint(joint); return; } const value = Number(raw); if (!Number.isFinite(value)) { syncJoint(joint); return; } setPlaying(false); apply(joint, isSlide(joint) ? value : T.MathUtils.degToRad(value)); syncJoint(joint); selectLink(joint.child); }
      range.addEventListener('input', () => edit(range.value)); input.addEventListener('change', () => edit(input.value));
      const unit = document.createElement('span'); unit.className = 'joint-unit'; unit.textContent = isSlide(joint) ? 'u' : '°'; unit.title = 'u denotes normalized scene units';
      valueRow.append(range, input, unit);
      const limits = document.createElement('div'); limits.className = 'joint-limits';
      const a = document.createElement('span'), b = document.createElement('span');
      a.textContent = `${format(joint, lower)}${isSlide(joint) ? ' u' : '°'}`; b.textContent = `${format(joint, upper)}${isSlide(joint) ? ' u' : '°'}`; limits.append(a, b);
      row.append(title, valueRow, limits); panel.append(row); Object.assign(joint, { row, range, input }); syncJoint(joint);
    }
    for (const name of current.links.keys()) linkSelect.append(new Option(name.replace(/^link_/, ''), name));
    document.querySelector('#object-summary').textContent = `${current.links.size} parts · ${count} movable joint${count === 1 ? "" : "s"}. Move a slider to explore its range.`;
  }
  function setup() {
    if (renderer) return;
    renderer = new T.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setClearColor(getComputedStyle(workspace).getPropertyValue('--viewer-bg').trim() || '#161616');
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    stage.append(renderer.domElement); scene = new T.Scene();
    camera = new T.PerspectiveCamera(38, 1, .001, 100);
    orbit = new T.OrbitControls(camera, renderer.domElement); orbit.enableDamping = true; orbit.dampingFactor = .09;
    orbit.addEventListener('change', () => { dirty = true; });
    scene.add(new T.HemisphereLight(0xffffff, 0x444444, 1.2));
    for (const [position, strength] of [[[3, 5, 4], 2.0], [[-4, 1, -3], .8]]) { const light = new T.DirectionalLight(0xffffff, strength); light.position.fromArray(position); scene.add(light); }
    new ResizeObserver(() => {
      const width = stage.clientWidth, height = stage.clientHeight;
      renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix();
      if (current) homeCamera(); dirty = true;
    }).observe(stage);
    let start;
    renderer.domElement.addEventListener('pointerdown', event => { if (event.button === 0) start = { x: event.clientX, y: event.clientY }; });
    renderer.domElement.addEventListener('pointerup', event => {
      if (!start || event.button !== 0 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5 || !current || !loading.hidden) return;
      start = null; const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      current.root.updateMatrixWorld(true); raycaster.setFromCamera(pointer, camera);
      const meshes = []; current.root.traverse(child => { if (child.isMesh && child.userData.linkName) meshes.push(child); });
      const hit = raycaster.intersectObjects(meshes, false)[0]; selectLink(hit?.object.userData.linkName || '');
    });
    renderer.domElement.addEventListener('pointercancel', () => { start = null; });
    requestAnimationFrame(frame);
  }
  function homeCamera() {
    if (!current) return;
    const e = current.extent; const vertical = T.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    const distance = e * .72 / Math.tan(Math.min(vertical, horizontal) / 2);
    // Scissors are flat in XY; look from above. Other assets stand along URDF Z.
    const direction = current.id === '10449' ? new T.Vector3(.2, 1.8, 1.1) : new T.Vector3(1.1, .65, 1.65);
    camera.position.copy(direction.normalize().multiplyScalar(distance)); camera.near = e / 1000; camera.far = e * 100;
    camera.updateProjectionMatrix(); orbit.target.set(0, 0, 0); orbit.minDistance = e * .45; orbit.maxDistance = e * 10; orbit.update(); dirty = true;
  }
  async function load(id) {
    selectedId = id; const token = ++generation; setPlaying(false); loading.hidden = false;
    loading.querySelector('p').textContent = `Loading ${objects[id].label.toLowerCase()}…`; document.querySelector('#object-retry').hidden = true;
    workspace.setAttribute('aria-busy', 'true'); panel.replaceChildren(); playButton.disabled = resetButton.disabled = linkSelect.disabled = true;
    document.querySelectorAll('[data-object]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.object === id)));
    document.querySelector('#object-title').textContent = `${objects[id].title} / ${id}`;
    loadReference(id, token);
    stage.setAttribute('aria-label', `Interactive 3D ${objects[id].label.toLowerCase()}: drag to orbit, scroll to zoom, and click to select a part`);
    try {
      setup();
      if (!cache.has(id)) cache.set(id, build(id).catch(error => { cache.delete(id); throw error; }));
      const model = await cache.get(id); if (token !== generation) return;
      if (current) scene.remove(current.root);
      current = model; scene.add(current.root);
      for (const j of current.joints.values()) apply(j, 0);
      if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
      grid = new T.GridHelper(current.extent * 3.5, 24, 0x484848, 0x2d2d2d);
      grid.material.transparent = true; grid.material.opacity = .28;
      grid.position.y = -current.size.y / 2 - current.extent * .025; scene.add(grid);
      renderControls(); selectLink(''); homeCamera(); loading.hidden = true;
      playButton.disabled = resetButton.disabled = linkSelect.disabled = false;
      startVisibleMotion();
    } catch (error) {
      if (token !== generation) return;
      console.error('Object viewer:', error); loading.querySelector('p').textContent = 'Could not load this object. Please retry.'; document.querySelector('#object-retry').hidden = false;
    } finally { if (token === generation) workspace.setAttribute('aria-busy', 'false'); }
  }
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min((now - lastTime) / 1000, .05); lastTime = now;
    if (!inView || document.hidden || !current || !loading.hidden) return;
    if (playing) {
      if (document.body.classList.contains('paused')) setPlaying(false);
      else {
        playTime += dt; let index = 0;
        for (const j of current.joints.values()) {
          if (!['revolute', 'continuous', 'prismatic'].includes(j.type)) continue;
          const wave = (Math.sin(playTime * 1.35 + index++ * .25) + 1) / 2;
          const target = j.lower + (j.upper - j.lower) * wave; const blend = Math.min(playTime / .6, 1);
          apply(j, playStart.get(j.name) * (1 - blend) + target * blend); syncJoint(j);
        }
      }
    }
    orbit.update();
    if (dirty) { renderer.render(scene, camera); dirty = false; }
  }
  document.querySelectorAll('[data-object]').forEach(button => button.addEventListener('click', () => load(button.dataset.object)));
  playButton.addEventListener('click', () => setPlaying(!playing));
  resetButton.addEventListener('click', () => { setPlaying(false); for (const j of current.joints.values()) { apply(j, 0); syncJoint(j); } });
  document.querySelector('#object-camera').addEventListener('click', homeCamera);
  document.querySelector('#object-retry').addEventListener('click', () => load(selectedId));
  linkSelect.addEventListener('change', () => selectLink(linkSelect.value));
  document.querySelector('#object-wire').addEventListener('click', event => { wireframe = !wireframe; event.currentTarget.setAttribute('aria-pressed', String(wireframe)); selectLink(selectedLink); });
  document.querySelector('#object-axis').addEventListener('click', event => { showAxes = !showAxes; event.currentTarget.setAttribute('aria-pressed', String(showAxes)); selectLink(selectedLink); });
  new MutationObserver(() => { if (current) selectLink(selectedLink); }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  new MutationObserver(() => { if (document.body.classList.contains('paused') && playing) setPlaying(false); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new IntersectionObserver(entries => {
    const entry = entries[0];
    inView = entry.isIntersecting && entry.intersectionRatio >= .08;
    if (inView) {
      dirty = true;
      if (!renderer) load(selectedId);
      else startVisibleMotion();
    } else { resumeOnVisibility = false; setPlaying(false); }
  }, { threshold: .08 }).observe(motionStage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resumeOnVisibility = playing;
      setPlaying(false);
    } else if (resumeOnVisibility) {
      resumeOnVisibility = false;
      startVisibleMotion();
    }
  });
  window.articulationStudy = { load, selectLink, get current() { return current; }, get playing() { return playing; }, get selectedLink() { return selectedLink; }, get camera() { return camera; }, get orbit() { return orbit; }, get renderer() { return renderer; } };
  window.addEventListener('pagehide', () => { orbit?.dispose(); renderer?.dispose(); });
})();
