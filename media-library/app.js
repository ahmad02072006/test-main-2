import {
    searchMovies,
    searchBooks,
    getMovieDetails
} from './api.js';
const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
})[character]);
const state = {
    type: 'movie',
    items: [],
    saved: JSON.parse(localStorage.getItem('reel-read-list') || '[]')
};
let debounce;
let modalReturnFocus;
const isSaved = (id) => state.saved.some((item) => item.id === id);

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
    $('list-count').textContent = state.saved.length;
}

function render(items) {
    state.items = items;
    $('results').setAttribute('aria-busy', 'false');
    if (!items.length) {
        $('results').innerHTML = '<div class="atlas-empty-state"><strong>No stories found</strong><span>Try another title or adjust your filters.</span></div>';
        $('result-status').textContent = 'No results';
        return;
    }
    const eagerCount = window.matchMedia('(max-width: 760px)').matches ? 2 : 5;
    $('results').innerHTML = items.map((item, index) => {
        const title = escapeHTML(item.title);
        const id = escapeHTML(item.id);
        const saved = isSaved(item.id);
        const image = item.image
            ? `<img class="cover-image" src="${escapeHTML(item.image)}"${item.imageSrcSet ? ` srcset="${escapeHTML(item.imageSrcSet)}"` : ''} sizes="(max-width: 760px) calc((100vw - 59px)/2), (max-width: 1240px) calc((90vw - 72px)/5), 209px" width="500" height="750" loading="${index < eagerCount ? 'eager' : 'lazy'}" decoding="async" alt="${item.type === 'movie' ? 'Film poster' : 'Book cover'} for ${title}"/>`
            : '';
        return `<article class="story-card" data-story-id="${id}"><div class="cover ${item.image ? '' : 'empty-cover'}">${image}<span aria-hidden="true">${item.type === 'movie' ? 'FILM' : 'BOOK'}</span><button class="cover-open" data-open-story="${id}" aria-label="View details for ${title}" type="button"></button><button class="save" data-save="${id}" aria-label="${saved ? 'Remove' : 'Save'} ${title} ${saved ? 'from' : 'to'} your list" aria-pressed="${saved}" type="button">${saved ? '♥' : '＋'}</button></div><div class="card-info"><h3><button class="story-title" data-open-story="${id}" type="button">${title}</button></h3><p>${escapeHTML(item.year)} <i>·</i> ${item.rating === '—' ? '' : `★ ${escapeHTML(item.rating)}`}</p></div></article>`;
    }).join('');
    $('result-status').textContent = `${items.length} stories`;
}
async function runSearch() {
    const query = $('search').value.trim() || (state.type === 'movie' ? 'popular' : 'fiction');
    showLoading();
    try {
        const items = state.type === 'movie' ? await searchMovies(query, {
            genre: $('genre').value,
            year: $('year').value
        }) : await searchBooks(query);
        render(items);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'The catalog could not be loaded. Please try again.';
        state.items = [];
        $('results').setAttribute('aria-busy', 'false');
        $('result-status').textContent = 'Catalog unavailable';
        $('results').innerHTML = `<div class="atlas-error-state" role="alert"><strong>We couldn’t load the catalog</strong><span>${escapeHTML(message)}</span></div>`;
    }
}

function save(item) {
    state.saved = isSaved(item.id) ? state.saved.filter((saved) => saved.id !== item.id) : [...state.saved, item];
    localStorage.setItem('reel-read-list', JSON.stringify(state.saved));
    updateCount();
    render(state.items);
    if ($('list-drawer').getAttribute('aria-hidden') === 'false') renderSaved();
}

function renderSaved() {
    $('saved-list').innerHTML = state.saved.length ? state.saved.map((item) => `<button class="saved-item" data-open="${escapeHTML(item.id)}" type="button"><span>${item.type === 'movie' ? 'FILM' : 'BOOK'}</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.year)}</small></button>`).join('') : '<p class="empty-list">Your list is quiet for now.</p>';
}
async function openDetails(item) {
    modalReturnFocus = document.activeElement;
    $('modal').removeAttribute('inert');
    $('modal').setAttribute('aria-hidden', 'false');
    $('close-modal').focus();
    $('modal-content').innerHTML = '<p class="eyebrow">LOADING STORY</p><h2 id="modal-title">Gathering the details...</h2>';
    if (item.type === 'movie') {
        try {
            const detail = await getMovieDetails(item.sourceId);
            item = {
                ...item,
                summary: detail.overview,
                author: detail.genres?.map((genre) => genre.name).join(' · ')
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Movie details are unavailable.';
            $('modal-content').innerHTML = `<p class="eyebrow">FILM NOTE</p><h2 id="modal-title">${escapeHTML(item.title)}</h2><p class="atlas-error-state" role="alert">${escapeHTML(message)}</p>`;
            return;
        }
    }
    $('modal-content').innerHTML = `<p class="eyebrow">${item.type === 'movie' ? 'FILM NOTE' : 'BOOK NOTE'}</p><h2 id="modal-title">${escapeHTML(item.title)}</h2><p class="modal-meta">${escapeHTML(item.year)} · ${escapeHTML(item.author || 'A story worth your time')}</p><p>${escapeHTML(item.summary || 'No description available.')}</p><button class="modal-save" data-modal-save="${escapeHTML(item.id)}" type="button">${isSaved(item.id) ? 'Remove from my list' : 'Save to my list'}</button>`;
}
$('search').addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(runSearch, 400);
});
$('genre').addEventListener('change', runSearch);
$('year').addEventListener('change', runSearch);
document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => {
    document.querySelector('.nav-button.active').classList.remove('active');
    button.classList.add('active');
    button.setAttribute('aria-pressed', 'true');
    document.querySelector('.nav-button:not(.active)').setAttribute('aria-pressed', 'false');
    state.type = button.dataset.type;
    $('genre').style.display = state.type === 'movie' ? '' : 'none';
    $('year').style.display = state.type === 'movie' ? '' : 'none';
    $('results-title').textContent = state.type === 'movie' ? 'Popular this week' : 'Books to get lost in';
    runSearch();
}));
$('results').addEventListener('click', (event) => {
    const saveButton = event.target.closest('[data-save]');
    if (saveButton) {
        event.stopPropagation();
        save(state.items.find((item) => item.id === saveButton.dataset.save));
        return;
    }
    const openButton = event.target.closest('[data-open-story]');
    if (openButton) {
        const item = state.items.find((story) => story.id === openButton.dataset.openStory);
        if (item) openDetails(item);
        return;
    }
    const card = event.target.closest('[data-story-id]');
    if (card) {
        const item = state.items.find((story) => story.id === card.dataset.storyId);
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
    const item = state.saved.find((saved) => saved.id === event.target.closest('[data-open]')?.dataset.open);
    if (item) openDetails(item);
});
$('close-modal').addEventListener('click', () => {
    $('modal').setAttribute('aria-hidden', 'true');
    $('modal').setAttribute('inert', '');
    modalReturnFocus?.focus();
});
$('modal').addEventListener('click', (event) => {
    if (event.target === $('modal')) {
        $('modal').setAttribute('aria-hidden', 'true');
        $('modal').setAttribute('inert', '');
        modalReturnFocus?.focus();
    }
});
$('modal-content').addEventListener('click', (event) => {
    const button = event.target.closest('[data-modal-save]');
    if (button) {
        const item = state.items.find((story) => story.id === button.dataset.modalSave)
            || state.saved.find((story) => story.id === button.dataset.modalSave);
        if (!item) return;
        save(item);
        openDetails(item);
    }
});
updateCount();
runSearch();

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if ($('modal').getAttribute('aria-hidden') === 'false') {
        $('close-modal').click();
    } else if ($('list-drawer').getAttribute('aria-hidden') === 'false') {
        $('close-list').click();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const activeOverlay = $('modal').getAttribute('aria-hidden') === 'false'
        ? $('modal')
        : $('list-drawer').getAttribute('aria-hidden') === 'false'
            ? $('list-drawer')
            : null;
    if (!activeOverlay) return;
    const focusable = [...activeOverlay.querySelectorAll('button:not(:disabled), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
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
