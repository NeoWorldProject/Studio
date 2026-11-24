// External destinations used by the research blog.
const NEOWORLD_EXTERNAL_LINKS = Object.freeze({
  studio: 'https://doxibot.com/',
  beta: 'http://139.224.165.34/',
});

document.querySelectorAll('[data-external-link]').forEach(link => {
  const destination = NEOWORLD_EXTERNAL_LINKS[link.dataset.externalLink];
  if (destination) link.href = destination;
});
