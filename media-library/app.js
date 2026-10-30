import {
    searchMovies,
    searchBooks,
    getMovieDetails,
    demoStories
} from './api.js';
const $ = (id) => document.getElementById(id);
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
    $('results').innerHTML = items.map((item) => `<article class="story-card" data-id="${item.id}"><div class="cover ${item.image ? '' : 'empty-cover'}" ${item.image ? `style="background-image:url('${item.image}')"` : ''}><span>${item.type === 'movie' ? 'FILM' : 'BOOK'}</span><button class="save" data-save="${item.id}" aria-label="Save ${item.title}">${isSaved(item.id) ? '♥' : '＋'}</button></div><div class="card-info"><h3>${item.title}</h3><p>${item.year} <i>·</i> ${item.rating === '—' ? '' : '★ ' + item.rating}</p></div></article>`).join('');
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
    $('saved-list').innerHTML = state.saved.length ? state.saved.map((item) => `<button class="saved-item" data-open="${item.id}"><span>${item.type === 'movie' ? 'FILM' : 'BOOK'}</span><strong>${item.title}</strong><small>${item.year}</small></button>`).join('') : '<p class="empty-list">Your list is quiet for now.</p>';
}
async function openDetails(item) {
    $('modal').setAttribute('aria-hidden', 'false');
    $('modal-content').innerHTML = '<p class="eyebrow">LOADING STORY</p><h2>Gathering the details...</h2>';
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
    $('modal-content').innerHTML = `<p class="eyebrow">${item.type === 'movie' ? 'FILM NOTE' : 'BOOK NOTE'}</p><h2>${item.title}</h2><p class="modal-meta">${item.year} · ${item.author || 'A story worth your time'}</p><p>${item.summary || 'No description available.'}</p><button class="modal-save" data-modal-save="${item.id}">${isSaved(item.id) ? 'Remove from my list' : 'Save to my list'}</button>`;
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
    const card = event.target.closest('[data-id]');
    if (card) openDetails(state.items.find((item) => item.id === card.dataset.id));
});
$('list-button').addEventListener('click', () => {
    renderSaved();
    $('list-drawer').setAttribute('aria-hidden', 'false');
});
$('close-list').addEventListener('click', () => $('list-drawer').setAttribute('aria-hidden', 'true'));
$('saved-list').addEventListener('click', (event) => {
    const item = state.saved.find((saved) => saved.id === event.target.closest('[data-open]')?.dataset.open);
    if (item) openDetails(item);
});
$('close-modal').addEventListener('click', () => $('modal').setAttribute('aria-hidden', 'true'));
$('modal').addEventListener('click', (event) => {
    if (event.target === $('modal')) $('modal').setAttribute('aria-hidden', 'true');
});
$('modal-content').addEventListener('click', (event) => {
    const button = event.target.closest('[data-modal-save]');
    if (button) {
        save(state.items.find((item) => item.id === button.dataset.modalSave) || state.saved.find((item) => item.id === button.dataset.modalSave));
        openDetails(state.saved.find((item) => item.id === button.dataset.modalSave));
    }
});
updateCount();
runSearch();
