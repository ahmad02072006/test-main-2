# API Atlas

The homepage is a global travel hub linking the destination planner, weather, currency, and media tools.

Four modular Vanilla JavaScript applications (no frontend framework or build step):

- `weather-travel/` - geolocation weather, seven-day forecast, units, and weather-based travel recommendations.
- `currency-converter/` - fiat and crypto conversion, rate history, favorites/comparisons, travel budget, and a Chart.js view.
- `media-library/` - TMDB movie search, Open Library book search, detail modal, destination search, and local saved collections.
- `trip-planner/` - live city or country search with nearby place suggestions and a seven-day itinerary.

The trip planner gets country/capital data from [Countries](https://github.com/annexare/Countries), worldwide city coordinates and live city suggestions from Open-Meteo, named attraction coordinates and popular nearby place suggestions from Wikipedia (ranked with Wikidata sitelinks). Attraction lookup samples multiple nearby areas and searches landmark, museum, monument, park, temple, and related articles; the planner also exposes additional results beyond the seven-day itinerary. Country searches start in the country's capital; entering a city with its country (for example, `Paris, France`) disambiguates duplicate city names. These services need an internet connection; suggestions are based on available Wikipedia coverage and cannot guarantee every attraction or a definitive popularity ranking.

## Run

Because the apps use ES modules, serve the repository over HTTP instead of opening files directly:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/` and choose an app folder. The project has no build step.

## API providers and backend setup

Weather forecasts and geocoding use Open-Meteo and require no API key. The standalone trip-planner also uses Open-Meteo, Wikipedia, and Wikidata, with no keys.

The currency converter uses:

- ExchangeRate-API for latest published fiat rates. It requires an API key, kept as the `EXCHANGE_RATE_API_KEY` secret in the Cloudflare Worker. Provider timestamps are shown; these rates are not guaranteed to be instantaneous market quotes.
- Frankfurter for historical fiat reference rates (no key).
- CoinGecko for crypto spot and historical data (the current public endpoints need no key, but are rate-limited).

The media library uses TMDB for movies and needs a TMDB API read access token stored as the Worker secret `TMDB_ACCESS_TOKEN`. Open Library search and book details need no key. Favorites, watchlist, and reading list are saved in this browser's `localStorage` only.

Deploy the Worker from the `worker/` directory and set its secrets without adding them to the website:

```sh
cd worker
npx wrangler secret put EXCHANGE_RATE_API_KEY
npx wrangler secret put TMDB_ACCESS_TOKEN
npx wrangler deploy
```

Set the public Worker URL in `api-config.js` as `window.API_ATLAS_CONFIG = { baseUrl: 'https://your-worker.workers.dev' };`. The URL is public configuration; never put API keys or access tokens there. `worker/wrangler.toml` allows the GitHub Pages origin and local development hosts. Add any custom production domain to `ALLOWED_ORIGINS` before deploying.

The browser and Worker cache successful provider responses to reduce repeat requests; provider quotas still apply. The Worker endpoints are public read APIs, so CORS is not authentication—configure Cloudflare rate limiting and monitor provider quotas before high-volume production use.

Without a deployed Worker URL and its secrets, the converter and movie catalog show explicit setup errors rather than sample data. Open Library and Open-Meteo continue to work without this backend.

## Shared interface

`ui.css` provides the shared color, typography, spacing, shadow, and radius tokens used across the homepage and tools. `ui.js` adds the site navigation, keyboard-accessible mobile menu, skip link, and a light/dark appearance preference saved in the browser.

## Check the interface

Run the local server above, then check the homepage and each app at desktop, tablet, and mobile widths. Verify the navigation menu by keyboard and touch, toggle the appearance (it should persist across pages), and check loading, empty, and unavailable-service states. Live panels require an internet connection; the currency converter and movie search also need the configured Worker and provider secrets described above.
