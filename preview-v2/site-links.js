// Update these two destinations when the public domains replace the temporary IP addresses.
const NEOWORLD_EXTERNAL_LINKS = Object.freeze({
  studio: 'https://47.116.163.26:28871/login',
  beta: 'http://139.224.165.34/',
});

document.querySelectorAll('[data-external-link]').forEach(link => {
  const destination = NEOWORLD_EXTERNAL_LINKS[link.dataset.externalLink];
  if (destination) link.href = destination;
});
