const revealSelectors = [
  'main > .section',
  '.route-grid > *',
  '.budget > *',
  '.apps > *',
  '.info-grid > *',
  '.toolbox > *',
  '.trip-form',
  '.game-card',
  '.booking'
];

const revealItems = document.querySelectorAll(revealSelectors.join(','));

revealItems.forEach((item) => {
  item.dataset.reveal = '';
  if (item.parentElement.matches('.route-grid, .budget, .apps, .toolbox')) {
    const siblingIndex = Array.from(item.parentElement.children).indexOf(item);
    item.style.setProperty('--reveal-delay', `${siblingIndex * 80}ms`);
  }
});

if ('IntersectionObserver' in window) {
  document.documentElement.classList.add('motion-ready');

  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      currentObserver.unobserve(entry.target);
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -36px 0px'
  });

  revealItems.forEach((item) => observer.observe(item));
}
