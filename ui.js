const routes = [
  ['Discover', 'index.html'],
  ['Trip planner', 'trip-planner/'],
  ['Weather', 'weather-travel/'],
  ['Currency', 'currency-converter/'],
  ['Place info', 'place-info/']
];

const isHome = document.querySelector('.top');
const rootPath = isHome ? '' : '../';
const themeKey = 'atlas-theme';
const themeButton = () => document.querySelector('.atlas-theme-toggle');

function readTheme() {
  try {
    return localStorage.getItem(themeKey);
  } catch (error) {
    console.warn('Could not read the saved appearance preference.', error);
    return null;
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(themeKey, theme);
  } catch (error) {
    console.warn('Could not save the appearance preference.', error);
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const button = themeButton();
  if (!button) return;
  const isDark = theme === 'dark';
  button.setAttribute('aria-pressed', String(isDark));
  button.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
  button.title = `Switch to ${isDark ? 'light' : 'dark'} mode`;
  button.querySelector('.atlas-theme-icon').textContent = isDark ? '☀' : '☾';
  button.querySelector('.atlas-theme-label').textContent = isDark ? 'Light mode' : 'Dark mode';
}

function makeThemeButton() {
  const button = document.createElement('button');
  button.className = 'atlas-theme-toggle';
  button.type = 'button';
  button.innerHTML = '<span class="atlas-theme-icon" aria-hidden="true">☾</span><span class="atlas-theme-label">Dark mode</span>';
  button.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    saveTheme(theme);
  });
  return button;
}

function makeMenuButton(controlsId) {
  const button = document.createElement('button');
  button.className = 'atlas-menu-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', 'Open navigation menu');
  button.setAttribute('aria-controls', controlsId);
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<span class="atlas-menu-toggle__icon" aria-hidden="true"></span>';
  return button;
}

function setMenuOpen(button, menu, open) {
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', `${open ? 'Close' : 'Open'} navigation menu`);
  menu.dataset.open = String(open);
  if (isHome) isHome.dataset.menuOpen = String(open);
}

function addSharedHeader() {
  if (isHome) {
    const nav = isHome.querySelector('.top-nav');
    nav.id = 'atlas-site-links';
    nav.dataset.open = 'false';
    nav.setAttribute('aria-label', 'Main navigation');
    const actions = document.createElement('div');
    actions.className = 'atlas-site-actions';
    const menuButton = makeMenuButton(nav.id);
    menuButton.addEventListener('click', () => {
      setMenuOpen(menuButton, nav, menuButton.getAttribute('aria-expanded') !== 'true');
    });
    actions.append(menuButton, makeThemeButton());
    isHome.append(actions);
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setMenuOpen(menuButton, nav, false);
    });
    isHome.classList.add('atlas-site-header');
    isHome.dataset.menuOpen = 'false';
    return;
  }

  const header = document.createElement('header');
  header.className = 'atlas-site-header';
  const inner = document.createElement('div');
  inner.className = 'atlas-site-header__inner';
  const brand = document.createElement('a');
  brand.className = 'atlas-site-brand';
  brand.href = `${rootPath}index.html`;
  brand.innerHTML = 'API <span>ATLAS</span>';

  const nav = document.createElement('nav');
  nav.className = 'atlas-site-links';
  nav.id = 'atlas-site-links';
  nav.dataset.open = 'false';
  nav.setAttribute('aria-label', 'Main navigation');
  routes.forEach(([label, path]) => {
    const link = document.createElement('a');
    link.href = `${rootPath}${path}`;
    link.textContent = label;
    if (window.location.pathname.includes(path.replace(/\/$/, ''))) {
      link.setAttribute('aria-current', 'page');
    }
    nav.append(link);
  });

  const actions = document.createElement('div');
  actions.className = 'atlas-site-actions';
  const menuButton = makeMenuButton(nav.id);
  menuButton.addEventListener('click', () => {
    setMenuOpen(menuButton, nav, menuButton.getAttribute('aria-expanded') !== 'true');
  });
  actions.append(menuButton, makeThemeButton());
  inner.append(brand, nav, actions);
  header.append(inner);
  document.body.prepend(header);
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(menuButton, nav, false);
  });
}

addSharedHeader();
const skipLink = document.createElement('a');
skipLink.className = 'atlas-skip-link';
skipLink.href = '#main-content';
skipLink.textContent = 'Skip to main content';
document.body.prepend(skipLink);
const savedTheme = readTheme();
const initialTheme = savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
applyTheme(initialTheme);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const button = document.querySelector('.atlas-menu-toggle');
  const menu = document.querySelector('.atlas-site-links, .top-nav');
  if (button?.getAttribute('aria-expanded') === 'true') {
    setMenuOpen(button, menu, false);
    button.focus();
  }
});

document.addEventListener('click', (event) => {
  const button = document.querySelector('.atlas-menu-toggle');
  const menu = document.querySelector('.atlas-site-links, .top-nav');
  if (
    button?.getAttribute('aria-expanded') === 'true'
    && !button.contains(event.target)
    && !menu?.contains(event.target)
  ) {
    setMenuOpen(button, menu, false);
  }
});
