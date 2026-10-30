import {
    getWeatherByCity,
    getWeatherByCoordinates,
    getCurrencies,
    getExchangeRate,
    searchLocations
} from './api.js';

const state = {
    units: localStorage.getItem('weather-units') || 'metric',
    selectedLocation: null,
    locations: [],
    currentCoordinates: null,
    exchangeRates: new Map(),
    exchangeRateRequests: new Map(),
    conversionId: 0,
    searchId: 0
};
const $ = (id) => document.getElementById(id);
const iconMap = {
    Clear: '☼',
    Clouds: '☁',
    Rain: '☂',
    Drizzle: '╱',
    Snow: '❄',
    Thunderstorm: 'ϟ',
    Mist: '≋',
    Fog: '≋'
};
const unitLabel = () => state.units === 'metric' ? 'C' : 'F';
const displayTemp = (value) => Math.round(value);

async function getCachedExchangeRate(base, quote) {
    if (base === quote) return {
        rate: 1,
        date: null
    };
    const key = `${base}:${quote}`;
    if (state.exchangeRates.has(key)) return state.exchangeRates.get(key);
    if (!state.exchangeRateRequests.has(key)) {
        const request = getExchangeRate(base, quote).then((result) => {
            state.exchangeRates.set(key, result);
            state.exchangeRateRequests.delete(key);
            return result;
        }).catch((error) => {
            state.exchangeRateRequests.delete(key);
            throw error;
        });
        state.exchangeRateRequests.set(key, request);
    }
    return state.exchangeRateRequests.get(key);
}

async function updateCurrencyConversion() {
    const conversionId = ++state.conversionId;
    const amount = Number($('currency-amount').value);
    const base = $('currency-from').value;
    const quote = $('currency-to').value;
    if (!Number.isFinite(amount) || amount < 0 || !base || !quote) {
        $('currency-output').textContent = '—';
        $('currency-status').textContent = 'Enter an amount of zero or more.';
        return;
    }

    $('currency-status').textContent = 'Getting the latest reference rate...';
    try {
        const { rate, date } = await getCachedExchangeRate(base, quote);
        if (conversionId !== state.conversionId) return;
        $('currency-output').textContent = new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: quote,
            maximumFractionDigits: 2
        }).format(amount * rate);
        $('currency-status').textContent = date ?
            `1 ${base} = ${new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(rate)} ${quote} · Rate date: ${date}. Reference rate; provider fees may differ.` :
            `Same currency; no conversion needed.`;
    } catch (error) {
        if (conversionId !== state.conversionId) return;
        $('currency-output').textContent = '—';
        $('currency-status').textContent = error.message;
    }
}

async function initializeCurrencyConverter() {
    try {
        const currencies = await getCurrencies();
        const options = Object.entries(currencies).sort(([codeA], [codeB]) => codeA.localeCompare(codeB));
        for (const id of ['currency-from', 'currency-to']) {
            const select = $(id);
            options.forEach(([code, name]) => {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = `${code} — ${name}`;
                select.append(option);
            });
        }
        $('currency-from').value = currencies.USD ? 'USD' : options[0]?.[0] || '';
        $('currency-to').value = currencies.EUR ? 'EUR' : options.find(([code]) => code !== $('currency-from').value)?.[0] || '';
        if (!options.length) throw new Error('The currency service returned no currencies.');
        await updateCurrencyConversion();
    } catch (error) {
        $('currency-output').textContent = '—';
        $('currency-status').textContent = error.message;
    }
}

function recommendations(weather) {
    const condition = weather.weather[0].main.toLowerCase();
    const temp = weather.main.temp;
    if (condition.includes('rain') || condition.includes('drizzle') || condition.includes('thunder')) return ['Make room for rain.', 'A light waterproof layer and shoes with grip will keep the day open. Look for covered markets, galleries, and cafes between showers.'];
    if (condition.includes('snow')) return ['Follow the quiet streets.', 'Insulated layers, waterproof boots, and gloves are the move. Give yourself extra time: beautiful weather can make slow travel better.'];
    if (temp >= (state.units === 'metric' ? 29 : 84)) return ['Chase the shade.', 'Breathable fabrics, water, and an early start will make the heat feel generous instead of demanding.'];
    if (temp <= (state.units === 'metric' ? 8 : 46)) return ['Layer with intention.', 'Bring a warm mid-layer and leave room for a hot drink stop. The best cold-weather walks have a destination.'];
    return ['A very good day to wander.', 'A comfortable layer and shoes you trust are enough. Leave some space in the itinerary for an unplanned turn.'];
}

function renderCurrent(weather) {
    const [condition] = weather.weather;
    $('location-name').textContent = `${weather.name}, ${weather.sys.country}`;
    $('location-time').textContent = new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });
    $('weather-icon').textContent = iconMap[condition.main] || '☼';
    $('temperature').textContent = displayTemp(weather.main.temp);
    $('temperature-unit').textContent = unitLabel();
    $('condition').textContent = condition.description;
    $('feels-like').textContent = `${displayTemp(weather.main.feels_like)}°`;
    $('humidity').textContent = `${weather.main.humidity}%`;
    $('wind').textContent = `${Math.round(weather.wind.speed)} ${state.units === 'metric' ? 'm/s' : 'mph'}`;
    const [title, text] = recommendations(weather);
    $('recommendation-title').textContent = title;
    $('recommendation-text').textContent = text;
}

function renderForecast(forecast) {
    const daily = forecast.list.filter((item) => item.dt_txt.includes('12:00:00')).slice(0, 5);
    $('forecast-grid').innerHTML = daily.map((day) => {
        const condition = day.weather[0];
        return `<article class="forecast-card"><span class="forecast-day">${new Date(day.dt * 1000).toLocaleDateString(undefined, { weekday: 'short' })}</span><span class="forecast-icon">${iconMap[condition.main] || '☼'}</span><strong>${displayTemp(day.main.temp_max)}°</strong><span class="low">${displayTemp(day.main.temp_min)}°</span><p>${condition.description}</p></article>`;
    }).join('');
}

async function loadWeather(loader) {
    $('status').textContent = 'Reading the sky...';
    try {
        const [weather, forecast] = await loader();
        renderCurrent(weather);
        renderForecast(forecast);
        $('status').textContent = `Updated for ${weather.name}`;
        $('last-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (error) {
        $('status').textContent = error.message;
    }
}

$('city-input').addEventListener('input', async (event) => {
    const query = event.target.value.trim();
    state.selectedLocation = null;
    const searchId = ++state.searchId;
    state.locations = [];
    $('location-results').replaceChildren();
    if (query.length < 2) return;

    $('status').textContent = 'Searching locations...';
    try {
        const locations = await searchLocations(query);
        if (searchId !== state.searchId) return;
        state.locations = locations;
        const results = $('location-results');
        locations.forEach((place, index) => {
            const details = [place.admin1, place.country].filter(Boolean).join(', ');
            const item = document.createElement('li');
            const button = document.createElement('button');
            const name = document.createElement('span');
            const locationDetails = document.createElement('small');
            button.className = 'location-option';
            button.type = 'button';
            button.dataset.locationIndex = String(index);
            name.textContent = place.name;
            locationDetails.textContent = details;
            button.append(name, locationDetails);
            item.append(button);
            results.append(item);
        });
        $('status').textContent = locations.length ? `${locations.length} matching locations` : 'No matching locations found.';
    } catch (error) {
        if (searchId !== state.searchId) return;
        $('status').textContent = error.message;
    }
});

$('location-results').addEventListener('click', (event) => {
    const button = event.target.closest('[data-location-index]');
    if (!button) return;
    const place = state.locations?.[Number(button.dataset.locationIndex)];
    if (!place) return;
    state.selectedLocation = place;
    state.currentCoordinates = {
        latitude: place.latitude,
        longitude: place.longitude
    };
    $('city-input').value = place.name;
    $('location-results').replaceChildren();
    loadWeather(() => getWeatherByCoordinates(place.latitude, place.longitude, state.units, place));
});

$('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const city = $('city-input').value.trim();
    if (!city) return;
    if (state.selectedLocation) {
        const { latitude, longitude } = state.selectedLocation;
        loadWeather(() => getWeatherByCoordinates(latitude, longitude, state.units, state.selectedLocation));
        return;
    }
    loadWeather(async () => {
        const locations = await searchLocations(city);
        const place = locations[0];
        if (!place) throw new Error(`Could not find “${city}”. Try a city or country name.`);
        state.currentCoordinates = {
            latitude: place.latitude,
            longitude: place.longitude
        };
        return getWeatherByCoordinates(place.latitude, place.longitude, state.units, place);
    });
});
$('currency-amount').addEventListener('input', updateCurrencyConversion);
$('currency-from').addEventListener('change', updateCurrencyConversion);
$('currency-to').addEventListener('change', updateCurrencyConversion);
$('currency-swap').addEventListener('click', () => {
    const from = $('currency-from');
    const to = $('currency-to');
    [from.value, to.value] = [to.value, from.value];
    updateCurrencyConversion();
});
$('unit-toggle').addEventListener('click', () => {
    state.units = state.units === 'metric' ? 'imperial' : 'metric';
    localStorage.setItem('weather-units', state.units);
    $('unit-toggle').innerHTML = state.units === 'metric' ? '°C <span>/ °F</span>' : '°F <span>/ °C</span>';
    const city = $('location-name').textContent.split(',')[0];
    if (state.currentCoordinates) {
        const { latitude, longitude } = state.currentCoordinates;
        loadWeather(() => getWeatherByCoordinates(latitude, longitude, state.units));
    } else if (city !== 'Your location') {
        loadWeather(() => getWeatherByCity(city, state.units));
    }
});
$('unit-toggle').innerHTML = state.units === 'metric' ? '°C <span>/ °F</span>' : '°F <span>/ °C</span>';
if (navigator.geolocation) navigator.geolocation.getCurrentPosition(({
    coords
}) => {
    state.currentCoordinates = {
        latitude: coords.latitude,
        longitude: coords.longitude
    };
    loadWeather(() => getWeatherByCoordinates(coords.latitude, coords.longitude, state.units));
}, () => {
    $('status').textContent = 'Search a location to start planning your trip.';
});
else $('status').textContent = 'Search a location to start planning your trip.';
initializeCurrencyConverter();

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, {
        threshold: 0.12,
        rootMargin: '0px 0px -40px 0px'
    });
    document.querySelectorAll('[data-reveal]').forEach((element) => revealObserver.observe(element));
    document.body.classList.add('motion-ready');
}
