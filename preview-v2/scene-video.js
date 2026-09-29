(() => {
  const states = new Map();
  const videos = document.querySelectorAll('.scene-video');
  if (!videos.length) return;

  // Posters arrive shortly before a video scrolls in; the video itself loads only once visible.
  function loadPoster(state) {
    if (!state.video.poster && state.video.dataset.poster) state.video.poster = state.video.dataset.poster;
  }

  function loadVideo(state) {
    if (state.loaded) return;
    state.loaded = true;
    loadPoster(state);
    // Sources are listed best-first; the browser skips any it cannot play.
    state.sources.forEach(source => { source.src = source.dataset.src; });
    state.video.load();
  }

  // A browser can report HEVC support and still be unable to decode it (software rendering, no
  // codec extension): data arrives but no frame does. Drop that source and let the next one play.
  function checkDecoding(state) {
    clearTimeout(state.decodeTimer);
    state.decodeTimer = setTimeout(() => {
      const { video, sources } = state;
      const current = sources.findIndex(source => source.src === video.currentSrc);
      const buffered = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
      if (video.readyState >= 2 || current < 0 || current === sources.length - 1 || buffered < 1) return;
      sources.splice(0, current + 1).forEach(source => source.remove());
      video.load();
      playVisibleVideo(state);
    }, 4000);
  }

  function playVisibleVideo(state) {
    if (!state.inView || document.hidden) return;
    loadVideo(state);
    // Native controls remain available if the browser declines autoplay.
    state.video.play().then(() => {
      if (!state.inView || document.hidden) state.video.pause();
    }).catch(() => {});
    if (state.sources.length > 1) checkDecoding(state);
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

  const posterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      loadPoster(states.get(entry.target));
      posterObserver.unobserve(entry.target);
    });
  }, { rootMargin: '600px 0px' });

  videos.forEach(video => {
    const sources = [...video.querySelectorAll('source[data-src]')];
    const error = video.closest('.scene-video-card')?.querySelector('.scene-video-error');
    const state = { video, sources, inView: false, loaded: false, resumeOnVisibility: false };
    const showError = () => { if (error) error.hidden = false; };
    video.muted = true;
    video.addEventListener('error', showError);
    // An earlier source failing just hands over to the next one; only the last is final.
    sources[sources.length - 1]?.addEventListener('error', showError);
    states.set(video, state);
    observer.observe(video);
    posterObserver.observe(video);
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
