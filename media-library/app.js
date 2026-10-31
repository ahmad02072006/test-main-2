import { getDetails, searchBooks, searchMovies } from './api.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'reel-read-list';
const collectionNames = {
    favorites: 'Favorites',
    watchlist: 'Watchlist',
    reading: 'Reading list'
};
const state = {
    type: 'movie',
    items: [],
    destination: '',
    collection: 'favorites',
    collections: { favorites: [], watchlist: [], reading: [] },
    searchId: 0,
    detailId: 0,
    activeItem: null
};
let debounce;
let modalReturnFocus;

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
})[character]);

function readCollections() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (Array.isArray(saved)) {
            saved.forEach((item) => {
                if (!item || typeof item.id !== 'string') return;
                state.collections.favorites.push(item);
            });
        } else {
            Object.keys(state.collections).forEach((list) => {
                if (Array.isArray(saved?.[list])) {
                    state.collections[list] = saved[list].filter((item) => item && typeof item.id === 'string');
                }
            });
        }
    } catch (error) {
        console.warn('Could not read the saved media lists.', error);
        $('saved-status').textContent = 'Saved lists could not be read from this browser.';
    }
}

function saveCollections() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.collections));
        $('saved-status').textContent = '';
        return true;
    } catch (error) {
        console.warn('Could not save your media lists.', error);
        $('saved-status').textContent = 'This browser could not save the list. Check storage settings.';
        return false;
    }
}

function membership(id) {
    return Object.keys(state.collections).filter((name) =>
        state.collections[name].some((item) => item.id === id));
}

function showLoading() {
    $('result-status').textContent = 'Searching the catalog...';
    $('results').setAttribute('aria-busy', 'true');
    $('results').innerHTML = Array.from({ length: 5 }, () => `
        <div class="atlas-skeleton-card" aria-hidden="true">
            <div class="atlas-skeleton atlas-skeleton-card__image"></div>
            <div class="atlas-skeleton atlas-skeleton-card__line"></div>
            <div class="atlas-skeleton atlas-skeleton-card__line"></div>
        </div>`).join('');
}

function updateCount() {
    $('list-count').textContent = Object.values(state.collections).reduce((total, items) => total + items.length, 0);
}

function render(items) {
    state.items = items;
    $('results').setAttribute('aria-busy', 'false');
    if (!items.length) {
        $('results').innerHTML = '<div class="atlas-empty-state"><strong>No stories found</strong><span>Try a different title, author, or destination.</span></div>';
        $('result-status').textContent = 'No results';
        return;
    }
    const eagerCount = window.matchMedia('(max-width: 760px)').matches ? 2 : 5;
    $('results').innerHTML = items.map((item, index) => {
        const title = escapeHTML(item.title);
        const id = escapeHTML(item.id);
        const favorited = membership(item.id).includes('favorites');
        const image = item.image
            ? `<img class="cover-image" src="${escapeHTML(item.image)}"${item.imageSrcSet ? ` srcset="${escapeHTML(item.imageSrcSet)}"` : ''} sizes="(max-width: 760px) calc((100vw - 59px)/2), (max-width: 1240px) calc((90vw - 72px)/5), 209px" width="500" height="750" loading="${index < eagerCount ? 'eager' : 'lazy'}" decoding="async" alt="${item.type === 'movie' ? 'Film poster' : 'Book cover'} for ${title}"/>`
            : '';
        return `<article class="story-card" data-story-id="${id}"><div class="cover ${item.image ? '' : 'empty-cover'}">${image}<span aria-hidden="true">${item.type === 'movie' ? 'FILM' : 'BOOK'}</span><button class="cover-open" data-open-story="${id}" aria-label="View details for ${title}" type="button"></button><button class="save" data-save="${id}" aria-label="${favorited ? 'Remove' : 'Add'} ${title} ${favorited ? 'from' : 'to'} favorites" aria-pressed="${favorited}" type="button">${favorited ? '♥' : '＋'}</button></div><div class="card-info"><h3><button class="story-title" data-open-story="${id}" type="button">${title}</button></h3><p>${escapeHTML(item.year)} <i>·</i> ${item.rating === '—' ? 'No rating' : `★ ${escapeHTML(item.rating)}`}</p></div></article>`;
    }).join('');
    $('result-status').textContent = state.destination
        ? `${items.length} recommendations for ${state.destination}`
        : `${items.length} stories`;
}

async function runSearch() {
    const searchText = $('search').value.trim();
    const query = searchText || state.destination;
    const requestId = ++state.searchId;
    showLoading();
    try {
        const items = state.type === 'movie'
            ? await searchMovies(query, { genre: $('genre').value, year: $('year').value })
            : await searchBooks(query || 'travel');
        if (requestId !== state.searchId) return;
        render(items);
    } catch (error) {
        if (requestId !== state.searchId) return;
        const message = error instanceof Error ? error.message : 'The catalog could not be loaded. Please try again.';
        state.items = [];
        $('results').setAttribute('aria-busy', 'false');
        $('result-status').textContent = 'Catalog unavailable';
        $('results').innerHTML = `<div class="atlas-error-state" role="alert"><strong>We couldn’t load the catalog</strong><span>${escapeHTML(message)}</span></div>`;
    }
}

function renderSaved() {
    document.querySelectorAll('[data-collection-tab]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.collectionTab === state.collection));
    });
    const items = state.collections[state.collection];
    $('saved-list').innerHTML = items.length ? items.map((item) => `
        <div class="saved-item-row">
            <button class="saved-item" data-open="${escapeHTML(item.id)}" type="button">
                <span>${item.type === 'movie' ? 'FILM' : 'BOOK'}</span>
                <strong>${escapeHTML(item.title)}</strong>
                <small>${escapeHTML(item.year)}</small>
            </button>
            <button class="saved-remove" data-remove="${escapeHTML(item.id)}" type="button" aria-label="Remove ${escapeHTML(item.title)} from ${collectionNames[state.collection]}">Remove</button>
        </div>`).join('') : `<div class="atlas-empty-state"><strong>Your ${collectionNames[state.collection].toLowerCase()} is empty</strong><span>Add stories from the catalog to keep them here.</span></div>`;
}

function toggleCollection(item, collection) {
    if (!item) return;
    const activeSaveId = document.activeElement?.dataset.save;
    const drawerOpen = $('list-drawer').getAttribute('aria-hidden') === 'false';
    const existing = state.collections[collection].some((saved) => saved.id === item.id);
    state.collections[collection] = existing
        ? state.collections[collection].filter((saved) => saved.id !== item.id)
        : [...state.collections[collection], item];
    const persisted = saveCollections();
    updateCount();
    render(state.items);
    if (drawerOpen) {
        renderSaved();
        if (!activeSaveId) document.querySelector(`[data-collection-tab="${state.collection}"]`)?.focus();
    } else if (activeSaveId) {
        [...document.querySelectorAll('[data-save]')].find((button) => button.dataset.save === activeSaveId)?.focus();
    }
    if (!persisted) $('result-status').textContent = 'The list changed for this session but could not be saved in this browser.';
}

async function openDetails(sourceItem) {
    const requestId = ++state.detailId;
    state.activeItem = sourceItem;
    if ($('modal').getAttribute('aria-hidden') !== 'false') modalReturnFocus = document.activeElement;
    $('modal').removeAttribute('inert');
    $('modal').setAttribute('aria-hidden', 'false');
    $('close-modal').focus();
    $('modal-content').innerHTML = '<p class="eyebrow">LOADING STORY</p><h2 id="modal-title">Gathering the details...</h2><p class="atlas-skeleton atlas-skeleton-card__line" aria-hidden="true"></p>';
    try {
        const item = await getDetails(sourceItem);
        if (requestId !== state.detailId || $('modal').getAttribute('aria-hidden') !== 'false') return;
        state.activeItem = item;
        renderDetails(item);
    } catch (error) {
        if (requestId !== state.detailId || $('modal').getAttribute('aria-hidden') !== 'false') return;
        const message = error instanceof Error ? error.message : 'Media details are temporarily unavailable.';
        $('modal-content').innerHTML = `<p class="eyebrow">STORY DETAILS</p><h2 id="modal-title">${escapeHTML(sourceItem.title)}</h2><p class="atlas-error-state" role="alert">${escapeHTML(message)}</p>`;
    }
}

function renderDetails(item, focusCollection = null) {
    const labels = membership(item.id);
    $('modal-content').innerHTML = `<p class="eyebrow">${item.type === 'movie' ? 'FILM NOTE' : 'BOOK NOTE'}</p><h2 id="modal-title">${escapeHTML(item.title)}</h2><p class="modal-meta">${escapeHTML(item.year)} · ${escapeHTML(item.author || 'A story worth your time')} · ${item.rating === '—' ? 'Not rated' : `★ ${escapeHTML(item.rating)}`}</p><p>${escapeHTML(item.summary || 'No description available.')}</p><div class="detail-collections" aria-label="Save to lists">${Object.entries(collectionNames).map(([name, label]) => `<button class="modal-save" data-collection-toggle="${name}" aria-pressed="${labels.includes(name)}" type="button">${labels.includes(name) ? 'Remove from' : 'Add to'} ${label}</button>`).join('')}</div>`;
    if (focusCollection) $('modal-content').querySelector(`[data-collection-toggle="${focusCollection}"]`)?.focus();
}

function setDestination(value) {
    state.destination = value.trim();
    $('destination-query').value = state.destination;
    $('search').value = state.destination;
    $('results-title').textContent = state.destination ? `Stories for ${state.destination}` : 'Popular this week';
}

readCollections();
updateCount();
const requestedDestination = new URLSearchParams(window.location.search).get('destination');
if (requestedDestination) setDestination(requestedDestination);

$('destination-form').addEventListener('submit', (event) => {
    event.preventDefault();
    setDestination($('destination-query').value);
    runSearch();
});
$('search').addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(runSearch, 350);
});
['genre', 'year'].forEach((id) => $(id).addEventListener('change', runSearch));

document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => {
    document.querySelector('.nav-button.active')?.classList.remove('active');
    button.classList.add('active');
    document.querySelectorAll('.nav-button').forEach((tab) => tab.setAttribute('aria-pressed', String(tab === button)));
    state.type = button.dataset.type;
    $('genre').style.display = state.type === 'movie' ? '' : 'none';
    $('year').style.display = state.type === 'movie' ? '' : 'none';
    $('results-title').textContent = state.destination
        ? `${state.type === 'movie' ? 'Films' : 'Books'} for ${state.destination}`
        : state.type === 'movie' ? 'Popular this week' : 'Books to get lost in';
    runSearch();
}));

$('results').addEventListener('click', (event) => {
    const saveButton = event.target.closest('[data-save]');
    if (saveButton) {
        event.stopPropagation();
        toggleCollection(state.items.find((item) => item.id === saveButton.dataset.save), 'favorites');
        return;
    }
    const openButton = event.target.closest('[data-open-story]');
    if (openButton) {
        const item = state.items.find((story) => story.id === openButton.dataset.openStory);
        if (item) openDetails(item);
    }
});

$('list-button').addEventListener('click', () => {
    renderSaved();
    $('list-drawer').removeAttribute('inert');
    $('list-drawer').setAttribute('aria-hidden', 'false');
    $('close-list').focus();
});
$('close-list').addEventListener('click', () => {
    $('list-drawer').setAttribute('aria-hidden', 'true');
    $('list-drawer').setAttribute('inert', '');
    $('list-button').focus();
});
$('saved-list').addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove]');
    if (removeButton) {
        const item = state.collections[state.collection].find((saved) => saved.id === removeButton.dataset.remove);
        toggleCollection(item, state.collection);
        return;
    }
    const item = state.collections[state.collection].find((saved) => saved.id === event.target.closest('[data-open]')?.dataset.open);
    if (item) {
        $('close-list').click();
        openDetails(item);
    }
});
document.querySelectorAll('[data-collection-tab]').forEach((button) => button.addEventListener('click', () => {
    state.collection = button.dataset.collectionTab;
    renderSaved();
}));

$('close-modal').addEventListener('click', () => {
    state.detailId++;
    $('modal').setAttribute('aria-hidden', 'true');
    $('modal').setAttribute('inert', '');
    modalReturnFocus?.focus();
});
$('modal').addEventListener('click', (event) => {
    if (event.target === $('modal')) $('close-modal').click();
});
$('modal-content').addEventListener('click', (event) => {
    const button = event.target.closest('[data-collection-toggle]');
    if (!button) return;
    const item = state.activeItem;
    if (item) {
        toggleCollection(item, button.dataset.collectionToggle);
        renderDetails(item, button.dataset.collectionToggle);
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if ($('modal').getAttribute('aria-hidden') === 'false') $('close-modal').click();
        else if ($('list-drawer').getAttribute('aria-hidden') === 'false') $('close-list').click();
    }
    if (event.key !== 'Tab') return;
    const overlay = $('modal').getAttribute('aria-hidden') === 'false'
        ? $('modal')
        : $('list-drawer').getAttribute('aria-hidden') === 'false'
            ? $('list-drawer')
            : null;
    if (!overlay) return;
    const focusable = [...overlay.querySelectorAll('button:not(:disabled), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

runSearch();
