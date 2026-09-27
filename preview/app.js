(() => {
  const selectedTheme = document.documentElement.classList.contains('theme-ocean') ? 'ocean' : document.documentElement.classList.contains('theme-light') ? 'light' : 'lime';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches;
  let effect;
  const animations = new Set();

  function animate(target, options) {
    if (reduced.matches || paused || !window.anime?.animate) return;
    const animation = anime.animate(target, options);
    animations.add(animation);
    animation.then(() => animations.delete(animation));
    return animation;
  }

  try {
    effect = createSceneHero();
  } catch (error) {
    console.error(error);
    document.body.classList.add('no-webgl');
  }

  animate('.title-line', { y: [45, 0], opacity: [0, 1], duration: 1300, delay: anime.stagger(160), ease: 'outExpo' });
  animate('.reveal', { y: [18, 0], opacity: [0, 1], duration: 1000, delay: anime.stagger(110, { start: 480 }), ease: 'outQuart' });

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

  const benchmarkCards = [...document.querySelectorAll('.benchmark-card')];
  if ('IntersectionObserver' in window) {
    const benchmarkObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        benchmarkObserver.unobserve(entry.target);
      });
    }, { threshold: 0.16 });
    benchmarkCards.forEach(card => benchmarkObserver.observe(card));
  } else {
    benchmarkCards.forEach(card => card.classList.add('is-visible'));
  }

  new IntersectionObserver(entries => { effect?.setVisible(entries[0].isIntersecting); }, { threshold: 0 }).observe(document.querySelector('.hero'));

  function updateMotion() {
    document.body.classList.toggle('paused', paused);
    effect?.setPaused(paused);

    if (paused) animations.forEach(animation => { animation.complete(); });
  }
  reduced.addEventListener('change', event => { paused = event.matches; updateMotion(); });
  updateMotion();
  window.addEventListener('pagehide', () => effect?.destroy(), { once: true });
  // Exposed solely for this visual study's browser verification.
  window.motionStudy = { get effect() { return effect; }, get theme() { return selectedTheme; }, get paused() { return paused; }, get sceneHero() { return effect; } };
})();
