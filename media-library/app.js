import {
    searchMovies,
    searchBooks,
    getMovieDetails,
    demoStories
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
const isSaved = (id) => state.saved.some((item) => item.id === id);

function updateCount() {
    $('list-count').textContent = state.saved.length;
}

function render(items) {
    state.items = items;
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
    $('result-status').textContent = 'Looking...';
    try {
        const items = state.type === 'movie' ? await searchMovies(query, {
            genre: $('genre').value,
            year: $('year').value
        }) : await searchBooks(query);
        render(items.length ? items : demoStories.filter((item) => item.type === state.type));
    } catch (error) {
        $('result-status').textContent = error.message;
        render(demoStories.filter((item) => item.type === state.type));
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
    $('modal').removeAttribute('inert');
    $('modal').setAttribute('aria-hidden', 'false');
    $('modal-content').innerHTML = '<p class="eyebrow">LOADING STORY</p><h2 id="modal-title">Gathering the details...</h2>';
    if (item.type === 'movie') {
        try {
            const detail = await getMovieDetails(item.sourceId);
            item = {
                ...item,
                summary: detail.overview,
                author: detail.genres?.map((genre) => genre.name).join(' · ')
            };
        } catch {
            /* demo detail remains useful */ }
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
});
$('close-list').addEventListener('click', () => {
    $('list-drawer').setAttribute('aria-hidden', 'true');
    $('list-drawer').setAttribute('inert', '');
});
$('saved-list').addEventListener('click', (event) => {
    const item = state.saved.find((saved) => saved.id === event.target.closest('[data-open]')?.dataset.open);
    if (item) openDetails(item);
});
$('close-modal').addEventListener('click', () => {
    $('modal').setAttribute('aria-hidden', 'true');
    $('modal').setAttribute('inert', '');
});
$('modal').addEventListener('click', (event) => {
    if (event.target === $('modal')) {
        $('modal').setAttribute('aria-hidden', 'true');
        $('modal').setAttribute('inert', '');
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
