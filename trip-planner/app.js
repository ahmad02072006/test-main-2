import {
    buildPlan,
    getCountryDirectory,
    resolveDestination
} from './api.js';
import { getWeatherByCity, getWeatherByCoordinates, searchLocations } from '../weather-travel/api.js';

const $ = (id) => document.getElementById(id);
const saved = JSON.parse(localStorage.getItem('trip-plan') || 'null');

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function money(value, symbol) {
    return `${symbol}${value.toLocaleString()}`;
}

const details = {
    Seoul: {
        weather: 'Cool, dry winters; warm humid summers. Spring and autumn are usually the easiest seasons for walking.',
        apps: [
            ['Naver Map', 'Local maps and walking routes', 'https://map.naver.com/'],
            ['Papago', 'Korean translation', 'https://papago.naver.com/'],
            ['Kakao T', 'Taxi booking', 'https://www.kakaomobility.com/'],
            ['Korail', 'KTX train reservations', 'https://www.letskorail.com/']
        ],
        hotel: 'https://www.booking.com/city/kr/seoul.html'
    },
    Busan: {
        weather: 'Milder by the coast, with hot humid summers and a comfortable spring and autumn for beaches and temples.',
        apps: [
            ['Naver Map', 'Local maps and transit', 'https://map.naver.com/'],
            ['Papago', 'Korean translation', 'https://papago.naver.com/'],
            ['Kakao T', 'Taxi booking', 'https://www.kakaomobility.com/'],
            ['Korail', 'KTX train reservations', 'https://www.letskorail.com/']
        ],
        hotel: 'https://www.booking.com/city/kr/busan.html'
    },
    Paris: {
        weather: 'Mild but changeable. Pack a light layer and rain protection in every season.',
        apps: [
            ['Google Maps', 'Walking and transit', 'https://maps.google.com/'],
            ['Citymapper', 'Public transport', 'https://citymapper.com/'],
            ['DeepL', 'Translation', 'https://www.deepl.com/translator'],
            ['SNCF Connect', 'Train reservations', 'https://www.sncf-connect.com/']
        ],
        hotel: 'https://www.booking.com/city/fr/paris.html'
    },
    Tokyo: {
        weather: 'Distinct seasons, rainy early summers, and hot humid Augusts. Spring and late autumn are popular for good reason.',
        apps: [
            ['Google Maps', 'Walking and rail routes', 'https://www.google.com/maps'],
            ['Japan Travel', 'Rail planning', 'https://www.japan.travel/en/'],
            ['Google Translate', 'Translation', 'https://translate.google.com/'],
            ['SmartEX', 'Shinkansen reservations', 'https://smart-ex.jp/en/']
        ],
        hotel: 'https://www.booking.com/city/jp/tokyo.html'
    }
};

function getDetails(plan) {
    return details[plan.name] || {
        weather: 'Check the local forecast before departure and pack for the season, with one flexible layer for changing conditions.',
        apps: [
            ['Google Maps', 'Walking and transit', 'https://maps.google.com/'],
            ['Google Translate', 'Translation', 'https://translate.google.com/'],
            ['Booking.com', 'Accommodation search', 'https://www.booking.com/'],
            ['Rome2Rio', 'Route planning', 'https://www.rome2rio.com/']
        ],
        hotel: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(plan.name)}`
    };
}

function renderForecast(forecast) {
    const days = forecast.list.filter((item) => item.dt_txt.includes('12:00:00')).slice(0, 5);
    return days.map((day) => `<span><strong>${escapeHTML(new Date(day.dt * 1000).toLocaleDateString(undefined, { weekday: 'short' }))}</strong>${Math.round(day.main.temp_max)}° / ${Math.round(day.main.temp_min)}°<small>${escapeHTML(day.weather[0].description)}</small></span>`).join('');
}

async function loadForecast(plan) {
    const forecast = $('live-forecast');
    if (!forecast) return;
    forecast.innerHTML = '<span class="forecast-loading">Loading live forecast...</span>';
    try {
        const [, weatherForecast] = Number.isFinite(plan.latitude) && Number.isFinite(plan.longitude)
            ? await getWeatherByCoordinates(plan.latitude, plan.longitude, 'metric', { name: plan.name, country: plan.country })
            : await getWeatherByCity(plan.name);
        forecast.innerHTML = renderForecast(weatherForecast);
    } catch (error) {
        forecast.innerHTML = `<span class="forecast-loading">${error.message}</span>`;
    }
}

function render(plan) {
    const info = getDetails(plan);
    const days = plan.itinerary.map((day) => `<article class="day"><span class="day-number">DAY ${String(day.day).padStart(2, '0')}</span><div><h3>${escapeHTML(day.places.join(' + '))}</h3><p>${escapeHTML(day.note)}</p></div><span class="day-cost">${escapeHTML(money(plan.daily, plan.symbol))}</span></article>`).join('');
    const plannedPlaces = new Set(plan.itinerary.flatMap((day) => day.places));
    const morePlaces = plan.places
        .filter((place) => !plannedPlaces.has(place))
        .slice(0, 40);
    const morePlacesMarkup = morePlaces.length
        ? `<details class="more-places"><summary>Explore ${morePlaces.length} more popular places</summary><ul>${morePlaces.map((place) => `<li>${escapeHTML(place)}</li>`).join('')}</ul></details>`
        : '';
    const apps = info.apps.map(([name, purpose, url]) => `<a href="${escapeHTML(url)}" target="_blank" rel="noreferrer"><strong>${escapeHTML(name)}</strong><span>${escapeHTML(purpose)} ↗</span></a>`).join('');
    const sourceNote = plan.destinationPlace
        ? `Starting near ${plan.destinationPlace} in ${plan.name}, ${plan.country}. Nearby place suggestions are based on Wikipedia articles.`
        : plan.isCountryDestination
            ? `Starting in ${plan.name}, the capital of ${plan.country}. Place suggestions are based on nearby Wikipedia articles.`
            : `Places near ${plan.name}, ${plan.country}, suggested from nearby Wikipedia articles.`;

    $('plan').innerHTML = `<div class="plan-head"><div><p class="eyebrow">YOUR 7-DAY FIELD ROUTE</p><h2>${escapeHTML(plan.name)}, ${escapeHTML(plan.country)}</h2><p>Seven days / ${escapeHTML(plan.currency)} estimate</p></div><div class="cost"><span>ESTIMATED TOTAL</span><strong>${escapeHTML(money(plan.total, plan.symbol))}</strong><small>${escapeHTML(money(plan.daily, plan.symbol))} per day · standard plan</small></div></div><p class="plan-source">${escapeHTML(sourceNote)}</p><div class="days">${days}</div>${morePlacesMarkup}<div class="trip-details"><article class="detail-card weather-detail"><p class="eyebrow">LIVE WEATHER FORECAST</p><h3>Pack for the season.</h3><p>${escapeHTML(info.weather)}</p><div class="live-forecast" id="live-forecast" aria-live="polite"></div></article><article class="detail-card"><p class="eyebrow">USEFUL APPS</p><h3>Download before you go.</h3><div class="resource-list">${apps}</div></article><article class="detail-card budget-detail"><p class="eyebrow">7-DAY TRIP COST</p><h3>${escapeHTML(money(plan.total, plan.symbol))} total</h3><p>Daily estimate: ${escapeHTML(money(plan.daily, plan.symbol))}. This covers local transport, meals, and entry tickets. Flights and hotels are separate.</p>${plan.budgetNote ? `<p>${escapeHTML(plan.budgetNote)}</p>` : ''}<a href="currency-converter/">Check exchange rates ↗</a></article><article class="detail-card hotel-detail"><p class="eyebrow">HOTEL RESERVATION</p><h3>Reserve your hotel.</h3><p>Compare available rooms and locations near your first stop.</p><a class="hotel-button" href="${escapeHTML(info.hotel)}" target="_blank" rel="noreferrer">Search hotels in ${escapeHTML(plan.name)} ↗</a></article></div><p class="estimate-note">Estimates are planning guides, not bookings. Check transport, weather, entry rules, and hotel cancellation terms before booking.</p>`;
    loadForecast(plan);
}

const plannerForm = $('planner-form');
const plannerStatus = $('planner-status');
const submitButton = plannerForm.querySelector('button[type="submit"]');
const destinationSuggestions = $('destination-list');
let suggestionTimer;
let suggestionRequest = 0;

function setStatus(message, state = 'info') {
    plannerStatus.textContent = message;
    plannerStatus.dataset.state = state;
}

getCountryDirectory()
    .then((countries) => {
        countries
            .forEach((country) => {
                const option = document.createElement('option');
                option.value = country.name;
                destinationSuggestions.append(option);
            });
    })
    .catch((error) => {
        setStatus('Country suggestions are unavailable. You can still search for a city.', 'error');
        console.error('Could not load country suggestions.', error);
    });

$('destination').addEventListener('input', () => {
    clearTimeout(suggestionTimer);
    destinationSuggestions.querySelectorAll('[data-location-suggestion]').forEach((option) => option.remove());
    const query = $('destination').value.trim();
    const requestId = ++suggestionRequest;
    if (query.length < 2) return;

    suggestionTimer = setTimeout(async () => {
        try {
            const locations = await searchLocations(query);
            if (requestId !== suggestionRequest) return;

            destinationSuggestions.querySelectorAll('[data-location-suggestion]').forEach((option) => option.remove());
            const seen = new Set();
            locations
                .filter((location) => location.feature_code === 'PPL'
                    || location.feature_code === 'PPLC'
                    || location.feature_code?.startsWith('PPLA'))
                .forEach((location) => {
                    const value = `${location.name}, ${location.country}`;
                    if (!location.country || seen.has(value.toLowerCase())) return;
                    seen.add(value.toLowerCase());
                    const option = document.createElement('option');
                    option.value = value;
                    option.label = location.country;
                    option.dataset.locationSuggestion = 'true';
                    destinationSuggestions.append(option);
                });
        } catch (error) {
            if (requestId !== suggestionRequest) return;
            setStatus('Live city suggestions are unavailable. You can still enter a city or country.', 'error');
            console.error('Could not load city suggestions.', error);
        }
    }, 250);
});

plannerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    setStatus('Looking up the destination and nearby places...');

    try {
        const destination = await resolveDestination($('destination').value);
        const plan = buildPlan(destination, 7, 'smart');
        render(plan);
        localStorage.setItem('trip-plan', JSON.stringify(plan));
        setStatus(`Found ${plan.places.length} nearby places for ${plan.name}.${plan.budgetNote ? ` ${plan.budgetNote}` : ''}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not build the trip plan.';
        setStatus(message, 'error');
        console.error('Could not build trip plan.', error);
    } finally {
        submitButton.disabled = false;
    }
});

const requestedDestination = new URLSearchParams(window.location.search).get('destination');
if (requestedDestination?.trim()) {
    $('destination').value = requestedDestination.trim();
    plannerForm.requestSubmit();
} else if (saved && Array.isArray(saved.itinerary)) {
    $('destination').value = saved.query || saved.name;
    render(saved);
}
