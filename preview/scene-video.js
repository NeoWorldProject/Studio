(() => {
  const states = new Map();
  const videos = document.querySelectorAll('.scene-video');
  if (!videos.length) return;

  function loadVideo(state) {
    if (state.loaded) return;
    state.loaded = true;
    state.video.poster = state.video.dataset.poster;
    state.source.src = state.source.dataset.src;
    state.video.load();
  }

  function playVisibleVideo(state) {
    if (!state.inView || document.hidden) return;
    loadVideo(state);
    // Native controls remain available if the browser declines autoplay.
    state.video.play().then(() => {
      if (!state.inView || document.hidden) state.video.pause();
    }).catch(() => {});
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const state = states.get(entry.target);
      state.inView = entry.isIntersecting && entry.intersectionRatio >= .08;
      if (state.inView) playVisibleVideo(state);
      else {
        state.resumeOnVisibility = false;
        state.video.pause();
      }
    });
  }, { threshold: .08 });

  videos.forEach(video => {
    const source = video.querySelector('source');
    const error = video.closest('.scene-video-card').querySelector('.scene-video-error');
    const state = { video, source, inView: false, loaded: false, resumeOnVisibility: false };
    const showError = () => { error.hidden = false; };
    video.muted = true;
    video.addEventListener('error', showError);
    source.addEventListener('error', showError);
    states.set(video, state);
    observer.observe(video);
  });

  document.addEventListener('visibilitychange', () => {
    states.forEach(state => {
      if (document.hidden) {
        state.resumeOnVisibility = !state.video.paused;
        state.video.pause();
      } else if (state.resumeOnVisibility) {
        state.resumeOnVisibility = false;
        playVisibleVideo(state);
      }
    });
  });
})();
