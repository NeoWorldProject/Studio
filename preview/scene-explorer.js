/* Scene 01: rendered by default; click an object to reveal X-ray geometry and its recorded construction code. */
(() => {
  'use strict';

  const T = window.THREE;
  const explorer = document.querySelector('#scene-explorer');
  const stage = document.querySelector('#scene-explorer-stage');
  if (!T || !explorer || !stage || !window.THREE.GLTFLoader || !window.THREE.DRACOLoader || !window.THREE.OrbitControls) return;

  const status = explorer.querySelector('.scene-explorer-status');
  const count = document.querySelector('#scene-explorer-count');
  const toggle = document.querySelector('#scene-xray-toggle');
  const toggleLabel = toggle.querySelector('span');
  const codePanel = document.querySelector('#scene-explorer-code-panel');
  const codeTitle = document.querySelector('#scene-explorer-code-title');
  const codeList = document.querySelector('#scene-explorer-code');
  const codeClose = document.querySelector('#scene-explorer-code-close');
  const tip = explorer.querySelector('.scene-explorer-tip');
  const hint = explorer.querySelector('.scene-explorer-hint');
  const assetMode = document.querySelector('meta[name="asset-mode"]')?.content || 'source';
  const payloadPath = assetMode === 'source'
    ? '../assets/studio/scenes/scene-01/scene-explorer-data.js'
    : './assets/studio/scenes/scene-01/scene-explorer-data.js';
  const colors = ['#79c8ff', '#ffbf69', '#ff8db8', '#b696ff', '#61e0bc', '#ffe773', '#ff765a', '#b8f34a', '#69d2ff', '#899381'];
  const sanitize = value => T.PropertyBinding.sanitizeNodeName(value || '');

  let renderer;
  let scene;
  let camera;
  let orbit;
  let root;
  let resizeObserver;
  let inView = false;
  let initialized = false;
  let dirty = true;
  let animationFrame;
  let xray = false;
  let selectedEntity = null;
  let meshes = [];
  let entityNames = [];
  let entityMeshes = new Map();
  let entityRecords = new Map();
  let partRecords = new Map();
  let meshesByNode = new Map();
  let entityColors = new Map();
  let codeLines = new Map();
  let activeCodeLine = null;
  let hovered = [];
  const raycaster = new T.Raycaster();
  const pointer = new T.Vector2();

  function loadPayload() {
    if (window.NW_SCENE01_DATA) return Promise.resolve(window.NW_SCENE01_DATA);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = payloadPath;
      script.onload = () => window.NW_SCENE01_DATA ? resolve(window.NW_SCENE01_DATA) : reject(new Error('Scene payload was empty.'));
      script.onerror = () => reject(new Error('Could not load the local Scene 01 payload.'));
      document.head.append(script);
    });
  }

  function decodeBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function parseModel(data) {
    const draco = new T.DRACOLoader();
    draco.setDecoderConfig({ type: 'wasm' });
    draco._loadLibrary = (url, responseType) => {
      if (url.endsWith('draco_wasm_wrapper.js') && responseType === 'text') return Promise.resolve(data.dracoWrapper);
      if (url.endsWith('draco_decoder.wasm') && responseType === 'arraybuffer') return Promise.resolve(decodeBase64(data.dracoWasmBase64));
      return Promise.reject(new Error(`Unexpected decoder asset: ${url}`));
    };
    const loader = new T.GLTFLoader();
    loader.setDRACOLoader(draco);
    return new Promise((resolve, reject) => {
      loader.parse(decodeBase64(data.glbBase64), '', gltf => {
        draco.dispose();
        resolve(gltf);
      }, error => {
        draco.dispose();
        reject(error);
      });
    });
  }

  function pretty(name) {
    return name
      .replace(/^Entity__/, '')
      .replace(/^scene1-/, '')
      .replace(/^s1-/, '')
      .replace(/-measured$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function codeName(name) {
    return name.replace(/^Entity__/, '').replace(/^s1-/, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  function concise(value, key) {
    if (Array.isArray(value)) {
      if (value.length && Array.isArray(value[0])) return `[${value.length} ${key || 'values'}]`;
      if (value.length > 8) return `[${value.length} values]`;
      return `[${value.map(item => typeof item === 'number' ? Number(item.toFixed(5)) : JSON.stringify(item)).join(', ')}]`;
    }
    if (typeof value === 'number') return String(Number(value.toFixed(5)));
    if (typeof value === 'string') return JSON.stringify(value);
    if (value && typeof value === 'object') return '{…}';
    return String(value);
  }

  function entityLines(entity, focusNode) {
    const identifier = codeName(entity.id || entity.node);
    const built = entity.parts.filter(part => part.op).length;
    const lines = [
      { kind: 'comment', text: `# ${entity.id} · ${entity.parts.length} parts · ${built} recorded SDK operations` },
      { kind: 'declaration', text: `${identifier} = scene.object(${JSON.stringify(entity.id)})` },
    ];
    const focused = entity.parts.find(part => sanitize(part.node) === focusNode);
    const ordered = [focused, ...entity.parts.filter(part => part.op), ...entity.parts].filter(Boolean);
    const shown = [];
    const seen = new Set();
    for (const part of ordered) {
      const node = sanitize(part.node);
      if (seen.has(node)) continue;
      seen.add(node);
      shown.push(part);
      if (shown.length === 5) break;
    }
    shown.forEach(part => {
      const node = sanitize(part.node);
      if (!part.op) {
        lines.push({ kind: 'mesh', node, text: `${identifier}.mesh(${JSON.stringify(part.part)})  # stored native mesh` });
        return;
      }
      const params = Object.entries(part.params || {}).map(([key, value]) => `${key}=${concise(value, key)}`);
      lines.push({ kind: 'operation', node, text: `${identifier}.${part.op}(${[JSON.stringify(part.part), ...params].join(', ')})` });
    });
    if (entity.parts.length > shown.length) lines.push({ kind: 'comment', text: `# + ${entity.parts.length - shown.length} additional recorded parts` });
    return lines;
  }

  function setHovered(list) {
    hovered.forEach(mesh => {
      if (mesh.material?.emissive) mesh.material.emissive.copy(mesh.material.userData.baseEmissive || new T.Color(0));
    });
    hovered = list;
    hovered.forEach(mesh => {
      if (mesh.material?.emissive) mesh.material.emissive.copy(new T.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).multiplyScalar(.45);
    });
    dirty = true;
  }

  function markCodeLine(node, shouldScroll) {
    activeCodeLine?.classList.remove('is-active');
    activeCodeLine = node ? codeLines.get(node) || null : null;
    if (!activeCodeLine) return;
    activeCodeLine.classList.add('is-active');
    if (shouldScroll) codeList.scrollTop = Math.max(0, activeCodeLine.offsetTop - codeList.clientHeight / 2);
  }

  function renderCode(name, focusNode) {
    const entity = entityRecords.get(name);
    codeLines = new Map();
    activeCodeLine = null;
    codeTitle.textContent = entity ? `${pretty(name)} · ${entity.parts.length} parts` : pretty(name);
    if (!entity) {
      codeList.textContent = '# This object is stored as native scene geometry.\n# No object-level construction record is attached.';
      return;
    }
    const fragment = document.createDocumentFragment();
    entityLines(entity, focusNode).forEach(line => {
      const span = document.createElement('span');
      span.className = `scene-code-line scene-code-${line.kind}`;
      span.textContent = line.text;
      if (line.node) {
        span.dataset.node = line.node;
        codeLines.set(line.node, span);
        span.addEventListener('pointerenter', () => setHovered(meshesByNode.get(line.node) || []));
        span.addEventListener('pointerleave', () => setHovered([]));
      }
      fragment.append(span);
    });
    codeList.replaceChildren(fragment);
    codeList.scrollTop = 0;
    markCodeLine(focusNode, false);
  }

  function positionCodePanel() {
    if (!xray || codePanel.hidden || !selectedEntity || !camera) return;
    const selectedMeshes = entityMeshes.get(selectedEntity) || [];
    const bounds = new T.Box3();
    selectedMeshes.forEach(mesh => bounds.expandByObject(mesh));
    if (bounds.isEmpty()) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) corners.push(new T.Vector3(x, y, z).project(camera));
      }
    }
    const xs = corners.map(point => (point.x + 1) * width / 2);
    const ys = corners.map(point => (1 - point.y) * height / 2);
    const objectLeft = Math.min(...xs);
    const objectRight = Math.max(...xs);
    const objectTop = Math.min(...ys);
    const objectBottom = Math.max(...ys);
    const panelWidth = codePanel.offsetWidth;
    const panelHeight = codePanel.offsetHeight;
    const edge = 10;
    const gap = 14;
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
    const below = objectBottom + gap;
    const above = objectTop - panelHeight - gap;
    const hasRoomBelow = below + panelHeight <= height - edge;
    const hasRoomAbove = above >= edge;
    let top;
    if (hasRoomAbove && !hasRoomBelow) top = above;
    else if (hasRoomBelow) top = below;
    else top = objectTop > height - objectBottom ? above : below;
    const centerX = (objectLeft + objectRight) / 2;
    codePanel.style.left = `${clamp(centerX - panelWidth / 2, edge, Math.max(edge, width - panelWidth - edge))}px`;
    codePanel.style.top = `${clamp(top, edge, Math.max(edge, height - panelHeight - edge))}px`;
  }

  function paint() {
    for (const mesh of meshes) {
      if (!xray) {
        mesh.material = mesh.userData.surfaceMaterial;
        mesh.renderOrder = 0;
        continue;
      }
      const selected = mesh.userData.entity === selectedEntity;
      mesh.material = selected ? mesh.userData.xraySelected : mesh.userData.xrayDimmed;
      mesh.material.opacity = selected ? .92 : mesh.userData.entity === 'Background' ? .035 : .1;
      mesh.renderOrder = selected ? 2 : 1;
    }
    dirty = true;
  }

  function selectEntity(name, focusNode) {
    selectedEntity = name;
    renderCode(name, focusNode);
    paint();
    requestAnimationFrame(positionCodePanel);
  }

  function setXray(next, entity, focusNode) {
    xray = next;
    explorer.classList.toggle('is-xray', xray);
    toggle.setAttribute('aria-pressed', String(xray));
    toggleLabel.textContent = xray ? 'Rendered view' : 'X-Ray + Code';
    codePanel.hidden = !xray;
    if (xray) showTip(null);
    hint.textContent = xray
      ? 'click another object to inspect · click empty space to return · drag to rotate'
      : 'click an object for X-ray + code · drag to rotate · scroll to zoom';
    if (xray) selectEntity(entity || selectedEntity || entityNames.find(name => /microwave/i.test(name)) || entityNames[0], focusNode);
    else {
      setHovered([]);
      markCodeLine(null, false);
      paint();
    }
  }

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(meshes.filter(mesh => mesh.userData.entity !== 'Background'), false)[0]?.object || null;
  }

  function showTip(mesh, event) {
    if (!mesh) {
      tip.hidden = true;
      return;
    }
    const nodeRecord = mesh.userData.node && partRecords.get(mesh.userData.node);
    const part = nodeRecord?.part || mesh.name.split('__').pop().replace(/_/g, ' ');
    tip.innerHTML = `<span>${pretty(mesh.userData.entity)}</span><b>${part}</b>${nodeRecord?.op ? `<code>${nodeRecord.op}(…)</code>` : '<code>native mesh</code>'}`;
    const rect = stage.getBoundingClientRect();
    tip.style.left = `${Math.min(event.clientX - rect.left + 15, rect.width - 220)}px`;
    tip.style.top = `${Math.min(event.clientY - rect.top + 15, rect.height - 92)}px`;
    tip.hidden = false;
  }

  function resize() {
    if (!renderer || !camera) return;
    const width = Math.max(stage.clientWidth, 1);
    const height = Math.max(stage.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = true;
    requestAnimationFrame(positionCodePanel);
  }

  function frameModel() {
    const focus = new T.Box3();
    entityNames.filter(name => /cabinet|stool|microwave|coffee-machine/i.test(name)).forEach(name => {
      entityMeshes.get(name).forEach(mesh => focus.expandByObject(mesh));
    });
    if (focus.isEmpty()) focus.setFromObject(root);
    const center = focus.getCenter(new T.Vector3());
    const sphere = focus.getBoundingSphere(new T.Sphere());
    const distance = sphere.radius / Math.sin(T.MathUtils.degToRad(camera.fov / 2)) * 0.5;
    camera.position.copy(center).add(new T.Vector3(-.7, .45, 1).normalize().multiplyScalar(distance));
    camera.near = Math.max(sphere.radius / 100, .01);
    camera.far = sphere.radius * 40;
    camera.updateProjectionMatrix();
    orbit.target.copy(center);
    orbit.minDistance = sphere.radius * .6;
    orbit.maxDistance = sphere.radius * 4;
    orbit.maxPolarAngle = Math.PI * .54;
    orbit.update();
  }

  function prepareModel(gltf, record) {
    root = gltf.scene;
    scene.add(root);
    for (const entity of record.entities || []) {
      const entityKey = sanitize(entity.node);
      entityRecords.set(entityKey, entity);
      entity.parts.forEach(part => partRecords.set(sanitize(part.node), part));
    }

    root.traverse(object => {
      if (!object.isMesh) return;
      let current = object;
      let entity = 'Background';
      let node = null;
      while (current) {
        if (!node && partRecords.has(current.name)) node = current.name;
        if (/^Entity__/.test(current.name)) {
          entity = current.name;
          break;
        }
        current = current.parent;
      }
      object.userData.entity = entity;
      object.userData.node = node;
      object.userData.surfaceMaterial = object.material;
      object.castShadow = false;
      object.receiveShadow = false;
      meshes.push(object);
      if (!entityMeshes.has(entity)) entityMeshes.set(entity, []);
      entityMeshes.get(entity).push(object);
      if (node) {
        if (!meshesByNode.has(node)) meshesByNode.set(node, []);
        meshesByNode.get(node).push(object);
      }
    });

    const operationCount = name => entityRecords.get(name)?.parts.filter(part => part.op).length || 0;
    entityNames = [...entityMeshes.keys()].sort((a, b) =>
      (a === 'Background') - (b === 'Background') || operationCount(b) - operationCount(a) || entityMeshes.get(b).length - entityMeshes.get(a).length
    );
    entityNames.forEach((name, index) => entityColors.set(name, name === 'Background' ? '#6b7564' : colors[index % colors.length]));
    meshes.forEach(mesh => {
      const color = new T.Color(entityColors.get(mesh.userData.entity)).convertSRGBToLinear();
      mesh.userData.xraySelected = new T.MeshStandardMaterial({ color, roughness: .66, metalness: 0, side: T.DoubleSide, transparent: true, opacity: .92, depthWrite: true });
      mesh.userData.xraySelected.emissive.copy(color).multiplyScalar(.11);
      mesh.userData.xraySelected.userData = { baseEmissive: mesh.userData.xraySelected.emissive.clone() };
      mesh.userData.xrayDimmed = new T.MeshStandardMaterial({ color, roughness: .82, metalness: 0, side: T.DoubleSide, transparent: true, opacity: .1, depthWrite: false });
      mesh.userData.xrayDimmed.emissive.copy(color).multiplyScalar(.025);
      mesh.userData.xrayDimmed.userData = { baseEmissive: mesh.userData.xrayDimmed.emissive.clone() };
    });

    const objectCount = entityNames.filter(name => name !== 'Background').length;
    count.textContent = `${meshes.length} named parts in ${objectCount} objects plus the room shell`;
    selectedEntity = entityNames.find(name => /microwave/i.test(name)) || entityNames[0];
    frameModel();
    paint();
  }

  async function initialize() {
    if (initialized) return;
    initialized = true;
    explorer.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading the interactive kitchen…';
    try {
      const data = await loadPayload();
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.setClearColor(0x0d110e, 1);
      stage.prepend(renderer.domElement);
      scene = new T.Scene();
      camera = new T.PerspectiveCamera(39, 1, .01, 100);
      orbit = new T.OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = false;
      orbit.addEventListener('change', () => { dirty = true; requestAnimationFrame(positionCodePanel); });
      scene.add(new T.HemisphereLight(0xffffff, 0x172018, 1.5));
      const key = new T.DirectionalLight(0xfff5e8, 2.2); key.position.set(4, 7, 6); scene.add(key);
      const fill = new T.DirectionalLight(0xdde8ff, 1.35); fill.position.set(-5, 3, -2); scene.add(fill);

      const gltf = await parseModel(data);
      prepareModel(gltf, data.record);
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
      status.hidden = true;
      explorer.setAttribute('aria-busy', 'false');

      let down = null;
      let pending = null;
      renderer.domElement.addEventListener('pointerdown', event => { down = [event.clientX, event.clientY]; });
      renderer.domElement.addEventListener('pointermove', event => { pending = event; });
      renderer.domElement.addEventListener('pointerleave', () => { pending = null; showTip(null); setHovered([]); });
      renderer.domElement.addEventListener('pointerup', event => {
        if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) return;
        const mesh = pick(event);
        if (!mesh) {
          if (xray) setXray(false);
          return;
        }
        if (!xray) setXray(true, mesh.userData.entity, mesh.userData.node);
        else {
          selectEntity(mesh.userData.entity, mesh.userData.node);
          markCodeLine(mesh.userData.node, true);
        }
      });

      const render = () => {
        animationFrame = requestAnimationFrame(render);
        if (!inView || document.hidden) return;
        if (pending) {
          const event = pending;
          pending = null;
          const mesh = pick(event);
          showTip(xray ? null : mesh, event);
          if (xray && mesh) {
            const related = mesh.userData.node ? meshesByNode.get(mesh.userData.node) || [mesh] : [mesh];
            setHovered(related);
            if (mesh.userData.entity === selectedEntity) markCodeLine(mesh.userData.node, false);
          } else setHovered([]);
        }
        if (dirty) {
          renderer.render(scene, camera);
          if (xray) positionCodePanel();
          dirty = false;
        }
      };
      render();
      window.sceneExplorer = { explorer, renderer, scene, root, camera, setXray, selectEntity, get xray() { return xray; } };
    } catch (error) {
      console.error('Scene 01 explorer:', error);
      status.textContent = 'Unable to load the interactive Scene 01 model.';
      status.classList.add('is-error');
      explorer.setAttribute('aria-busy', 'false');
    }
  }

  toggle.addEventListener('click', () => setXray(!xray));
  codeClose.addEventListener('click', () => setXray(false));
  const observer = new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    if (inView) initialize();
    dirty = true;
  }, { rootMargin: '420px 0px', threshold: 0 });
  observer.observe(explorer);

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    resizeObserver?.disconnect();
    cancelAnimationFrame(animationFrame);
    orbit?.dispose();
    renderer?.dispose();
  }, { once: true });
})();
