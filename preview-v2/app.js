// Page shell: cover wireframe, scroll reveals, reading progress, section tracking, the
// workflow-figure fit, and the image lightbox. The intro motion itself is CSS (style.css).
(() => {
  const root = document.documentElement;
  const selectedTheme = root.classList.contains('theme-ocean') ? 'ocean' : root.classList.contains('theme-light') ? 'light' : 'lime';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches;
  let effect;

  try {
    effect = createSceneHero();
  } catch (error) {
    console.error(error);
    document.body.classList.add('no-webgl');
  }

  // Everything is readable without JS: the `js` class only holds content back until it scrolls in.
  function once(targets, className, options) {
    if (!('IntersectionObserver' in window)) {
      targets.forEach(target => target.classList.add(className));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add(className);
        observer.unobserve(entry.target);
      });
    }, options);
    targets.forEach(target => observer.observe(target));
  }
  once(document.querySelectorAll('[data-reveal]'), 'in', { rootMargin: '0px 0px -8% 0px' });
  once(document.querySelectorAll('.metric-board'), 'is-visible', { threshold: .3 });
  window.nwApp = true;

  const methodImages = [...document.querySelectorAll('.scene-method-photo-pair img, .scene-method-handoff-visual img, .scene-method-labeled-pair img, .scene-method-robot-scene')];
  const methodLightbox = document.querySelector('#method-lightbox');
  const methodLightboxImage = document.querySelector('#method-lightbox-image');
  const methodLightboxCaption = document.querySelector('#method-lightbox-caption');
  const methodLightboxClose = document.querySelector('.method-lightbox-close');
  let methodLightboxTrigger;

  function openMethodImage(image) {
    if (!methodLightbox?.showModal || !methodLightboxImage || !methodLightboxCaption) return;
    methodLightboxTrigger = image;
    methodLightboxImage.src = image.currentSrc || image.src;
    methodLightboxImage.alt = image.alt;
    methodLightboxCaption.textContent = image.alt;
    methodLightboxImage.style.setProperty('--lightbox-image-width', `${Math.min(920, Math.max(420, image.naturalWidth * 2.2))}px`);
    methodLightbox.showModal();
    methodLightboxClose?.focus();
  }

  methodImages.forEach(image => {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-haspopup', 'dialog');
    image.setAttribute('aria-label', `Open larger view: ${image.alt}`);
    image.addEventListener('click', () => openMethodImage(image));
    image.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openMethodImage(image);
    });
  });

  methodLightboxClose?.addEventListener('click', () => methodLightbox.close());
  methodLightbox?.addEventListener('click', event => {
    if (event.target === methodLightbox) methodLightbox.close();
  });
  methodLightbox?.addEventListener('close', () => methodLightboxTrigger?.focus({ preventScroll: true }));

  const hero = document.querySelector('.hero');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => { effect?.setVisible(entries[entries.length - 1].isIntersecting); }).observe(hero);
  }

  // Reading progress and the current section, measured once per frame while scrolling.
  const progress = document.querySelector('.read-progress');
  const tocLinks = [...document.querySelectorAll('.article-toc a[href^="#"]')];
  const trackedLinks = [...tocLinks, ...document.querySelectorAll('.nav nav a[href^="#"]')];
  const sections = tocLinks.map(link => document.getElementById(link.hash.slice(1))).filter(Boolean);
  let activeId = null;
  let scheduled = false;

  function track() {
    scheduled = false;
    const max = root.scrollHeight - innerHeight;
    const y = scrollY;
    let current = '';
    if (max > 0 && y >= max - 4) current = sections[sections.length - 1]?.id || '';
    else {
      for (const section of sections) {
        if (section.getBoundingClientRect().top > innerHeight * .33) break;
        current = section.id;
      }
    }
    progress?.style.setProperty('--progress', max > 0 ? Math.min(Math.max(y / max, 0), 1).toFixed(4) : '0');
    if (current === activeId) return;
    activeId = current;
    trackedLinks.forEach(link => {
      const active = current !== '' && link.hash === `#${current}`;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function scheduleTrack() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(track);
  }
  addEventListener('scroll', scheduleTrack, { passive: true });
  addEventListener('resize', scheduleTrack);
  track();

  // Figure 01 keeps the method deck's fixed 1180 px coordinates and zooms to the column; below
  // the minimum zoom it pans horizontally instead of shrinking the labels further.
  const figure = document.querySelector('.architecture-figure');
  const figureCanvas = figure?.querySelector('.architecture-canvas');
  const board = figure?.querySelector('.workflow-board');
  if (figure && figureCanvas && board) {
    const updateEdges = () => {
      const overflow = figureCanvas.scrollWidth - figureCanvas.clientWidth;
      figure.classList.toggle('is-overflowing', overflow > 2);
      figure.classList.toggle('is-scrolled-end', figureCanvas.scrollLeft >= overflow - 4);
    };
    const fitBoard = () => {
      const zoom = Math.min(Math.max(Math.floor(figureCanvas.clientWidth / 1180 * 1e4) / 1e4, .62), 1);
      board.style.setProperty('--board-zoom', String(zoom));
      updateEdges();
    };
    // The heading's width tracks the figure but not the board, so this cannot feed back into itself.
    const head = figure.querySelector('.architecture-figure-head');
    if (head && 'ResizeObserver' in window) new ResizeObserver(fitBoard).observe(head);
    else addEventListener('resize', fitBoard);
    fitBoard();
    figureCanvas.addEventListener('scroll', updateEdges, { passive: true });
  }

  // articulation.js also reads `body.paused` to stop its playback.
  function updateMotion() {
    document.body.classList.toggle('paused', paused);
    effect?.setPaused(paused);
  }
  reduced.addEventListener?.('change', event => { paused = event.matches; updateMotion(); });
  updateMotion();
  // Keep the cover alive for back/forward-cache restores; release it only on a real unload.
  addEventListener('pagehide', event => { if (!event.persisted) effect?.destroy(); });
  // Exposed solely for this visual study's browser verification.
  window.motionStudy = { get effect() { return effect; }, get theme() { return selectedTheme; }, get paused() { return paused; }, get sceneHero() { return effect; } };
})();
