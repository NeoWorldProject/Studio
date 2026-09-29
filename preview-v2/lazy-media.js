// Three.js is not needed for the first screen. The core and its example loaders are fetched only
// when a 3D viewer approaches the viewport, and each script loads at most once.
(() => {
  const section = document.querySelector('#interactive');
  const scripts = new Map();
  let viewerPromise;

  function script(source) {
    if (!scripts.has(source)) {
      scripts.set(source, new Promise((resolve, reject) => {
        const element = document.createElement('script');
        element.src = source;
        element.onload = resolve;
        element.onerror = () => {
          scripts.delete(source);
          element.remove();
          reject(new Error(`Could not load ${source}`));
        };
        document.head.append(element);
      }));
    }
    return scripts.get(source);
  }

  // The example loaders attach themselves to the global THREE, so they run after the core, in order.
  function loadThree(extras = []) {
    return extras.reduce((chain, source) => chain.then(() => script(source)), script('vendor/three.min.js'));
  }

  function loadViewer() {
    if (!viewerPromise) {
      viewerPromise = loadThree(['vendor/OBJLoader.js', 'vendor/OrbitControls.js'])
        .then(() => script('articulation.js?v=v2-1'))
        .catch(error => {
          viewerPromise = null;
          console.error('Object viewer:', error);
          const message = document.querySelector('#object-loading p');
          if (message) message.textContent = 'Could not start the object viewer.';
          throw error;
        });
    }
    return viewerPromise;
  }

  window.nwScript = script;
  window.nwLoadThree = loadThree;
  window.loadArticulationViewer = loadViewer;

  if (!section) return;
  if (!('IntersectionObserver' in window)) {
    loadViewer().catch(() => {});
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    loadViewer().catch(() => {});
  }, { rootMargin: '800px 0px' });
  observer.observe(section);
})();
