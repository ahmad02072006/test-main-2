const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60'
};

function jsonResponse(body, status, origin, allowedOrigin) {
  const headers = new Headers(JSON_HEADERS);
  headers.set('cache-control', status >= 200 && status < 300 ? 'public, max-age=60' : 'no-store');
  if (origin && allowedOrigin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
    headers.set('access-control-allow-methods', 'GET, OPTIONS');
    headers.set('access-control-allow-headers', 'Content-Type');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function isAllowedOrigin(origin, configuredOrigins) {
  if (!origin) return true;
  const allowed = (configuredOrigins || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

async function cachedFetch(request, ttlSeconds) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cachedResponse = new Response(response.clone().body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
    cachedResponse.headers.set('cache-control', `public, max-age=${ttlSeconds}`);
    await cache.put(request, cachedResponse.clone());
  }
  return response;
}

function providerError(response, service) {
  if (response.status === 429) {
    return { status: 429, message: `${service} is rate-limiting requests. Please wait a moment and retry.` };
  }
  return { status: 502, message: `${service} is temporarily unavailable.` };
}

async function handleRates(url, env, request) {
  const base = (url.searchParams.get('base') || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(base)) return { status: 400, body: { error: 'Provide a three-letter base currency.' } };
  if (!env.EXCHANGE_RATE_API_KEY) {
    return { status: 503, body: { error: 'Exchange rates are not configured. Set the EXCHANGE_RATE_API_KEY Worker secret.' } };
  }

  const endpoint = `https://v6.exchangerate-api.com/v6/${encodeURIComponent(env.EXCHANGE_RATE_API_KEY)}/latest/${base}`;
  const cacheRequest = new Request(endpoint, { headers: request.headers });
  const response = await cachedFetch(cacheRequest, 900);
  if (!response.ok) {
    const error = providerError(response, 'Exchange-rate provider');
    return { status: error.status, body: { error: error.message } };
  }
  const data = await response.json();
  if (data.result !== 'success' || !data.conversion_rates) {
    return { status: 502, body: { error: 'Exchange-rate provider returned an invalid response.' } };
  }
  return {
    status: 200,
    body: {
      base: data.base_code,
      rates: data.conversion_rates,
      updatedAt: data.time_last_update_utc,
      updatedAtUnix: data.time_last_update_unix,
      nextUpdateAt: data.time_next_update_utc,
      provider: 'ExchangeRate-API'
    }
  };
}

async function handleMovies(url, env, request) {
  if (!env.TMDB_ACCESS_TOKEN) {
    return { status: 503, body: { error: 'Movie search is not configured. Set the TMDB_ACCESS_TOKEN Worker secret.' } };
  }
  const query = url.searchParams.get('query')?.trim();
  const trending = url.searchParams.get('mode') === 'trending';
  const match = url.pathname.match(/^\/media\/movies\/(\d+)$/);
  if (!query && !trending && !match) return { status: 400, body: { error: 'Enter a destination or movie title.' } };
  const endpoint = match
    ? `https://api.themoviedb.org/3/movie/${match[1]}?language=en-US`
    : trending
      ? 'https://api.themoviedb.org/3/trending/movie/week?language=en-US'
      : `https://api.themoviedb.org/3/search/movie?language=en-US&include_adult=false&query=${encodeURIComponent(query.slice(0, 100))}&page=1`;
  const cacheRequest = new Request(endpoint, {
    headers: { Authorization: `Bearer ${env.TMDB_ACCESS_TOKEN}`, Accept: 'application/json' }
  });
  const response = await cachedFetch(cacheRequest, match ? 86400 : 1800);
  if (!response.ok) {
    const error = providerError(response, 'TMDB');
    return { status: error.status, body: { error: error.message } };
  }
  const data = await response.json();
  return { status: 200, body: data };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = isAllowedOrigin(origin, env.ALLOWED_ORIGINS);
    if (!allowed) return jsonResponse({ error: 'Origin is not allowed.' }, 403);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'Content-Type',
          'access-control-max-age': '86400',
          vary: 'Origin'
        }
      });
    }
    if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, allowed);

    try {
      let result;
      if (url.pathname === '/rates') {
        result = await handleRates(url, env, request);
      } else if (url.pathname === '/media/movies' || /^\/media\/movies\/\d+$/.test(url.pathname)) {
        result = await handleMovies(url, env, request);
      } else {
        result = { status: 404, body: { error: 'API route not found.' } };
      }
      return jsonResponse(result.body, result.status, origin, allowed);
    } catch (error) {
      console.error('API Atlas Worker request failed.', error);
      return jsonResponse({ error: 'The service could not complete this request. Please retry.' }, 502, origin, allowed);
    }
  }
};
