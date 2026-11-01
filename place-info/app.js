const form = document.getElementById('place-search');
const input = document.getElementById('place-query');
const submitButton = form.querySelector('button[type="submit"]');
const status = document.getElementById('place-status');
const result = document.getElementById('place-result');
const image = document.getElementById('place-image');
const placeholder = document.getElementById('photo-placeholder');
const title = document.getElementById('place-title');
const description = document.getElementById('place-description');
const kind = document.getElementById('place-kind');
const coordinates = document.getElementById('place-coordinates');
const articleLink = document.getElementById('article-link');
const mapLink = document.getElementById('map-link');

let activeRequest;

function showStatus(message) {
  status.textContent = message;
}

function findRelevantPage(pages, query) {
  const normalize = (value) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const normalizedQuery = normalize(query);
  const stopWords = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'the', 'to']);
  const terms = normalizedQuery.split(/\s+/).filter((term) => (
    term.length > 2 && !stopWords.has(term) && /\p{L}/u.test(term)
  ));

  const relevantPages = pages.filter((page) => {
    const normalizedTitle = normalize(page.title);
    if (normalizedTitle === normalizedQuery) return true;
    if (!terms.length) return false;

    const titleTerms = new Set(normalizedTitle.split(/\s+/));
    if (terms.some((term) => titleTerms.has(term))) return true;

    const searchableText = normalize(`${page.title} ${page.description || ''}`);
    const searchableTerms = new Set(searchableText.split(/\s+/));
    return terms.some((term) => searchableTerms.has(term));
  });

  return relevantPages.find((page) => normalize(page.title) === normalizedQuery) || relevantPages[0];
}

function makeMapUrl(placeTitle, location) {
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lon)) {
    const url = new URL('https://www.openstreetmap.org/');
    url.searchParams.set('mlat', String(location.lat));
    url.searchParams.set('mlon', String(location.lon));
    url.hash = `map=12/${location.lat}/${location.lon}`;
    return url.href;
  }

  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', placeTitle);
  return url.href;
}

function renderPlace(place) {
  title.textContent = place.title;
  const summary = place.extract || place.description || 'A short overview is not available for this place.';
  const words = summary.split(/\s+/);
  description.textContent = words.length > 45 ? `${words.slice(0, 45).join(' ')}…` : summary;
  kind.textContent = place.description || 'Place';

  const location = place.coordinates;
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lon)) {
    coordinates.textContent = `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`;
  } else {
    coordinates.textContent = 'Not listed';
  }

  const articleUrl = place.content_urls?.desktop?.page
    || `https://en.wikipedia.org/wiki/${encodeURIComponent(place.title.replace(/ /g, '_'))}`;
  articleLink.href = articleUrl;
  mapLink.href = makeMapUrl(place.title, location);

  if (place.thumbnail?.source) {
    image.onerror = () => {
      image.hidden = true;
      placeholder.hidden = false;
    };
    image.src = place.thumbnail.source;
    image.alt = `Photo of ${place.title}`;
    image.hidden = false;
    placeholder.hidden = true;
  } else {
    image.removeAttribute('src');
    image.alt = '';
    image.hidden = true;
    placeholder.hidden = false;
  }

  result.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) {
    input.focus();
    return;
  }

  activeRequest?.abort();
  const request = new AbortController();
  activeRequest = request;
  result.hidden = true;
  submitButton.disabled = true;
  showStatus(`Looking up ${query}...`);

  try {
    const searchUrl = new URL('https://en.wikipedia.org/w/rest.php/v1/search/page');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('limit', '5');
    const searchResponse = await fetch(searchUrl, {
      headers: { Accept: 'application/json' },
      signal: request.signal
    });
    if (!searchResponse.ok) throw new Error(`Wikipedia search failed with status ${searchResponse.status}.`);

    const searchData = await searchResponse.json();
    const pages = searchData.pages || [];
    const match = findRelevantPage(pages, query);
    if (!match) {
      showStatus(`We couldn't find “${query}”. Try another spelling or add a country to narrow it down.`);
      return;
    }

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(match.title.replace(/ /g, '_'))}`;
    const summaryResponse = await fetch(summaryUrl, {
      headers: { Accept: 'application/json' },
      signal: request.signal
    });
    if (summaryResponse.status === 404) {
      showStatus(`We couldn't find a place page for “${query}”. Try another spelling or a more specific name.`);
      return;
    }
    if (!summaryResponse.ok) throw new Error(`Wikipedia summary failed with status ${summaryResponse.status}.`);

    const place = await summaryResponse.json();
    if (place.type === 'disambiguation') {
      showStatus(`“${query}” matches several places. Try adding a country or more specific landmark.`);
      return;
    }

    renderPlace(place);
    showStatus(`Here’s a quick guide to ${place.title}.`);
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('Could not load place information from Wikipedia.', error);
    showStatus('We couldn’t reach Wikipedia right now. Check your connection and try again.');
  } finally {
    if (activeRequest === request) submitButton.disabled = false;
  }
});
