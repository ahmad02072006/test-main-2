const TMDB_KEY = 'YOUR_TMDB_API_KEY';
const poster = (path) => path ? `https://image.tmdb.org/t/p/w500${path}` : '';
export async function searchMovies(query = 'popular', filters = {}) {
    if (TMDB_KEY === 'YOUR_TMDB_API_KEY') return [];
    const params = new URLSearchParams({
        api_key: TMDB_KEY,
        query,
        ...(filters.genre && {
            with_genres: filters.genre
        }),
        ...(filters.year && {
            year: filters.year
        })
    });
    const response = await fetch(`https://api.themoviedb.org/3/search/movie?${params}`);
    if (!response.ok) throw new Error('Movie service unavailable.');
    const data = await response.json();
    return data.results.map((item) => ({
        id: `movie-${item.id}`,
        sourceId: item.id,
        type: 'movie',
        title: item.title,
        year: item.release_date?.slice(0, 4) || '—',
        rating: item.vote_average?.toFixed(1) || '—',
        image: poster(item.poster_path),
        summary: item.overview
    }));
}
export async function searchBooks(query) {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20`);
    if (!response.ok) throw new Error('Book service unavailable.');
    const data = await response.json();
    return (data.items || []).map((item) => {
        const info = item.volumeInfo;
        return {
            id: `book-${item.id}`,
            sourceId: item.id,
            type: 'book',
            title: info.title,
            year: info.publishedDate?.slice(0, 4) || '—',
            rating: info.averageRating?.toFixed(1) || '—',
            image: info.imageLinks?.thumbnail?.replace('http:', 'https:') || '',
            summary: info.description || 'No description available.',
            author: info.authors?.join(', ') || 'Unknown author'
        };
    });
}
export async function getMovieDetails(id) {
    const response = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}`);
    if (!response.ok) throw new Error('Could not load details.');
    return response.json();
}
export const demoStories = [{
    id: 'demo-1',
    type: 'movie',
    title: 'Add your first search',
    year: '—',
    rating: '★',
    image: '',
    summary: 'Add a TMDB key in api.js to search the full film catalogue.'
}, {
    id: 'demo-2',
    type: 'book',
    title: 'The shelves are waiting',
    year: '—',
    rating: '★',
    image: '',
    summary: 'Book search works immediately through the Google Books API.'
}];
