import { API_BASE_URL } from '../api-config.js';

const poster = (path, size = 'w342') => path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
const posterSrcSet = (path) => path
    ? ['w185', 'w342'].map((size) => `${poster(path, size)} ${Number(size.slice(1))}w`).join(', ')
    : '';
const cache = new Map();
const pending = new Map();

async function requestJson(url, { ttl = 1800 } = {}) {
    const saved = cache.get(url);
    if (saved && saved.expiresAt > Date.now()) return saved.data;
    if (pending.has(url)) return pending.get(url);
    const request = fetch(url).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 429) throw new Error('The catalog is busy. Please wait a moment and retry.');
            throw new Error(data.error || 'The catalog service is temporarily unavailable.');
        }
        cache.set(url, { data, expiresAt: Date.now() + ttl * 1000 });
        return data;
    }).finally(() => pending.delete(url));
    pending.set(url, request);
    return request;
}

function getApiBase() {
    if (!API_BASE_URL) {
        throw new Error('Movie search needs the API Atlas backend URL. Deploy the Worker and set API_ATLAS_CONFIG.baseUrl in api-config.js.');
    }
    return API_BASE_URL.replace(/\/+$/, '');
}

function movieResult(item) {
    return {
        id: `movie-${item.id}`,
        sourceId: item.id,
        type: 'movie',
        title: item.title,
        year: item.release_date?.slice(0, 4) || '—',
        rating: Number.isFinite(item.vote_average) ? item.vote_average.toFixed(1) : '—',
        image: poster(item.poster_path),
        imageSrcSet: posterSrcSet(item.poster_path),
        summary: item.overview || 'No description available.',
        genreIds: item.genre_ids || []
    };
}

export async function searchMovies(query = '', filters = {}) {
    const params = new URLSearchParams();
    if (query.trim()) params.set('query', query.trim());
    else params.set('mode', 'trending');
    const data = await requestJson(`${getApiBase()}/media/movies?${params}`);
    const results = Array.isArray(data.results) ? data.results : [];
    return results
        .filter((item) => !filters.year || item.release_date?.startsWith(filters.year))
        .filter((item) => !filters.genre || item.genre_ids?.includes(Number(filters.genre)))
        .map(movieResult);
}

function cover(coverId, size = 'M') {
    return Number.isInteger(coverId) ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : '';
}

export async function searchBooks(query) {
    const params = new URLSearchParams({
        q: query || 'travel',
        limit: '20',
        fields: 'key,title,author_name,first_publish_year,ratings_average,cover_i,first_sentence'
    });
    const data = await requestJson(`https://openlibrary.org/search.json?${params}`, { ttl: 3600 });
    return (data.docs || []).map((item) => ({
        id: `book-${item.key}`,
        sourceId: item.key,
        type: 'book',
        title: item.title || 'Untitled',
        year: item.first_publish_year || '—',
        rating: Number.isFinite(item.ratings_average) ? item.ratings_average.toFixed(1) : '—',
        image: cover(item.cover_i),
        imageSrcSet: item.cover_i ? `${cover(item.cover_i, 'S')} 128w, ${cover(item.cover_i, 'M')} 256w` : '',
        summary: Array.isArray(item.first_sentence) ? item.first_sentence[0] : item.first_sentence || 'No description available.',
        author: item.author_name?.join(', ') || 'Unknown author'
    }));
}

export async function getDetails(item) {
    if (item.type === 'movie') {
        const detail = await requestJson(`${getApiBase()}/media/movies/${encodeURIComponent(item.sourceId)}`, { ttl: 86400 });
        return {
            ...item,
            summary: detail.overview || item.summary,
            rating: Number.isFinite(detail.vote_average) ? detail.vote_average.toFixed(1) : item.rating,
            author: detail.genres?.map((genre) => genre.name).join(' · ') || 'Film'
        };
    }
    const key = item.sourceId?.startsWith('/') ? item.sourceId : `/${item.sourceId}`;
    const detail = await requestJson(`https://openlibrary.org${key}.json`, { ttl: 86400 });
    const description = typeof detail.description === 'string'
        ? detail.description
        : detail.description?.value;
    return {
        ...item,
        summary: description || item.summary,
        author: item.author || detail.subjects?.slice(0, 3).join(' · ') || 'Book'
    };
}
