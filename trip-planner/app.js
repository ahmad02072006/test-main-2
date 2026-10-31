import {
    getCountryDirectory,
    resolveDestination
} from './api.js';
import { getWeatherByCity, getWeatherByCoordinates, searchLocations } from '../weather-travel/api.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'trip-plan';
const today = new Date();
const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
let mapInstance;
let destinationMarker;
let mappedCoordinates;
let suggestionTimer;
let suggestionRequest = 0;
let tripRequest = 0;

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function formatMoney(value, currency, symbol) {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            maximumFractionDigits: 2
        }).format(value);
    } catch {
        return `${symbol}${Number(value).toLocaleString()}`;
    }
}

function readSavedTrip() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!stored || typeof stored !== 'object') return null;
        if (stored.version === 2 && stored.destination && Array.isArray(stored.itinerary)) {
            const days = Math.min(30, Math.max(1, Number(stored.days) || stored.itinerary.length || 7));
            return {
                ...stored,
                days,
                startDate: /^\d{4}-\d{2}-\d{2}$/.test(stored.startDate) ? stored.startDate : localToday,
                budget: Number.isFinite(stored.budget) && stored.budget >= 0 ? stored.budget : 0,
                itinerary: Array.from({ length: days }, (_, index) => ({
                    activities: Array.isArray(stored.itinerary[index]?.activities)
                        ? stored.itinerary[index].activities
                            .filter((activity) => typeof activity?.name === 'string')
                            .map((activity) => ({
                                id: typeof activity.id === 'string' ? activity.id : crypto.randomUUID(),
                                name: activity.name,
                                cost: Number.isFinite(activity.cost) && activity.cost >= 0 ? activity.cost : 0,
                                suggestion: activity.suggestion === true
                            }))
                        : []
                }))
            };
        }
        if (typeof stored.name === 'string' && Array.isArray(stored.itinerary)) {
            const days = Math.min(30, Math.max(1, stored.itinerary.length || 7));
            return {
                version: 2,
                destination: stored,
                startDate: localToday,
                days,
                budget: Number.isFinite(stored.total) ? stored.total : 0,
                itinerary: Array.from({ length: days }, () => ({ activities: [] }))
            };
        }
        return null;
    } catch (error) {
        console.warn('Could not read the saved trip.', error);
        return null;
    }
}

const savedTrip = readSavedTrip();
let trip = null;

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

function getDetails(destination) {
    return details[destination.name] || {
        weather: 'Check the local forecast before departure and pack for the season, with one flexible layer for changing conditions.',
        apps: [
            ['Google Maps', 'Walking and transit', 'https://maps.google.com/'],
            ['Google Translate', 'Translation', 'https://translate.google.com/'],
            ['Booking.com', 'Accommodation search', 'https://www.booking.com/'],
            ['Rome2Rio', 'Route planning', 'https://www.rome2rio.com/']
        ],
        hotel: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination.name)}`
    };
}

function setStatus(message, state = 'info') {
    $('planner-status').textContent = message;
    $('planner-status').dataset.state = state;
    $('planner-status').setAttribute('aria-busy', String(state === 'loading'));
}

function persistTrip() {
    if (!trip) return true;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, ...trip }));
        return true;
    } catch (error) {
        console.error('Could not save the trip.', error);
        setStatus('Your trip is open, but this browser could not save it. Check its storage settings.', 'error');
        return false;
    }
}

function localDateOffset(dateString, offset) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day + offset);
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function activityCost(activity) {
    return Number.isFinite(activity.cost) && activity.cost >= 0 ? activity.cost : 0;
}

function costTotals() {
    const daily = trip.itinerary.map((day) => day.activities.reduce((sum, activity) => sum + activityCost(activity), 0));
    return { daily, total: daily.reduce((sum, value) => sum + value, 0) };
}

function renderCostTotals() {
    if (!trip) return;
    const { daily, total } = costTotals();
    const budget = trip.budget;
    const difference = budget - total;
    const comparison = difference >= 0
        ? `Within budget by ${formatMoney(difference, trip.destination.currency, trip.destination.symbol)}.`
        : `Over budget by ${formatMoney(Math.abs(difference), trip.destination.currency, trip.destination.symbol)}.`;
    $('trip-cost-total').textContent = formatMoney(total, trip.destination.currency, trip.destination.symbol);
    $('trip-cost-comparison').textContent = `${comparison} Costs are based on activities you add.`;
    document.querySelectorAll('[data-day-cost]').forEach((element) => {
        const dayIndex = Number(element.dataset.dayCost);
        element.textContent = formatMoney(daily[dayIndex] || 0, trip.destination.currency, trip.destination.symbol);
    });
}

function updateMap(destination) {
    const mapMessage = $('map-message');
    if (!Number.isFinite(destination.latitude) || !Number.isFinite(destination.longitude)) {
        mapMessage.textContent = 'Map coordinates are unavailable for this destination.';
        return;
    }
    if (!window.L) {
        mapMessage.textContent = 'The map library did not load. Check your connection and reload to view the map.';
        return;
    }
    mapMessage.textContent = '';
    const point = [destination.latitude, destination.longitude];
    if (!mapInstance) {
        mapInstance = window.L.map('destination-map', { scrollWheelZoom: false }).setView(point, 12);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapInstance);
        destinationMarker = window.L.marker(point).addTo(mapInstance);
        mappedCoordinates = point;
    } else {
        if (mappedCoordinates[0] !== point[0] || mappedCoordinates[1] !== point[1]) {
            mapInstance.setView(point, 12);
            mappedCoordinates = point;
        }
        destinationMarker.setLatLng(point);
    }
    destinationMarker.bindPopup(escapeHTML(`${destination.name}, ${destination.country}`));
    requestAnimationFrame(() => mapInstance.invalidateSize());
}

function renderForecast(forecast) {
    const days = forecast.list.filter((item) => item.dt_txt.includes('12:00:00')).slice(0, 5);
    return days.map((day) => `<span><strong>${escapeHTML(new Date(day.dt * 1000).toLocaleDateString(undefined, { weekday: 'short' }))}</strong>${Math.round(day.main.temp_max)}° / ${Math.round(day.main.temp_min)}°<small>${escapeHTML(day.weather[0].description)}</small></span>`).join('');
}

async function loadForecast(destination) {
    const forecast = $('live-forecast');
    forecast.setAttribute('aria-busy', 'true');
    forecast.innerHTML = Array.from({ length: 5 }, () => '<span class="forecast-loading atlas-skeleton" aria-hidden="true"></span>').join('');
    try {
        const [, weatherForecast] = Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude)
            ? await getWeatherByCoordinates(destination.latitude, destination.longitude, 'metric', { name: destination.name, country: destination.country })
            : await getWeatherByCity(destination.name);
        forecast.innerHTML = renderForecast(weatherForecast);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'The forecast is unavailable right now.';
        forecast.innerHTML = `<span class="forecast-loading" role="alert">We couldn’t load the forecast. ${escapeHTML(message)}</span>`;
    } finally {
        forecast.setAttribute('aria-busy', 'false');
    }
}

function render(tripState) {
    trip = tripState;
    const destination = trip.destination;
    const info = getDetails(destination);
    const { total } = costTotals();
    const days = trip.itinerary.map((day, index) => {
        const activities = day.activities.map((activity) => `
            <li class="activity-item">
                <span>${escapeHTML(activity.name)}${activity.suggestion ? '<small class="suggestion-tag">Place suggestion</small>' : ''}</span>
                <strong>${escapeHTML(formatMoney(activityCost(activity), destination.currency, destination.symbol))}</strong>
                <button class="remove-activity" type="button" data-remove-activity="${escapeHTML(activity.id)}" data-day-index="${index}" aria-label="Remove ${escapeHTML(activity.name)} from day ${index + 1}">Remove</button>
            </li>`).join('');
        return `<article class="day-card" data-day-index="${index}">
            <div class="day-card-head">
                <div><span class="day-number">DAY ${String(index + 1).padStart(2, '0')}</span><h3>${escapeHTML(localDateOffset(trip.startDate, index))}</h3></div>
                <div class="day-cost"><small>ACTIVITY COSTS</small><strong data-day-cost="${index}">${escapeHTML(formatMoney(0, destination.currency, destination.symbol))}</strong></div>
            </div>
            <ul class="activity-list">${activities || '<li class="activity-empty">No activities yet. Add one below.</li>'}</ul>
            <form class="activity-form" data-add-activity="${index}">
                <label>Activity <span class="suggestion-note">Place suggestions come from nearby Wikipedia articles.</span>
                    <input name="activity" list="place-suggestions" maxlength="120" placeholder="Add your own activity or choose a suggestion" required/>
                </label>
                <label>Cost (${escapeHTML(destination.currency)})
                    <input name="cost" type="number" min="0" step="any" inputmode="decimal" placeholder="0" required/>
                </label>
                <button type="submit">Add activity</button>
            </form>
        </article>`;
    }).join('');
    const apps = info.apps.map(([name, purpose, url]) => `<a href="${escapeHTML(url)}" target="_blank" rel="noreferrer"><strong>${escapeHTML(name)}</strong><span>${escapeHTML(purpose)} ↗</span></a>`).join('');
    const suggestions = destination.places.map((place) => `<li>${escapeHTML(place)}</li>`).join('');
    const sourceNote = destination.destinationPlace
        ? `Starting near ${destination.destinationPlace} in ${destination.name}, ${destination.country}. Nearby place suggestions are based on Wikipedia articles.`
        : destination.isCountryDestination
            ? `Starting in ${destination.name}, the capital of ${destination.country}. Place suggestions are based on nearby Wikipedia articles.`
            : `Places near ${destination.name}, ${destination.country}, suggested from nearby Wikipedia articles.`;

    $('plan').innerHTML = `
        <div class="plan-head">
            <div><p class="eyebrow">YOUR TRIP</p><h2>${escapeHTML(destination.name)}, ${escapeHTML(destination.country)}</h2>
                <p>${trip.days} ${trip.days === 1 ? 'day' : 'days'} · ${escapeHTML(localDateOffset(trip.startDate, 0))} – ${escapeHTML(localDateOffset(trip.startDate, trip.days - 1))}</p>
            </div>
            <div class="cost"><span>ACTIVITY COST TOTAL</span><strong id="trip-cost-total">${escapeHTML(formatMoney(total, destination.currency, destination.symbol))}</strong>
                <small>Budget: ${escapeHTML(formatMoney(trip.budget, destination.currency, destination.symbol))}</small>
                <small id="trip-cost-comparison"></small>
            </div>
        </div>
        <p class="plan-source">${escapeHTML(sourceNote)}</p>
        <div class="planner-map-section">
            <div><p class="eyebrow">DESTINATION MAP</p><h3>Find your bearings.</h3></div>
            <div id="destination-map" class="destination-map" role="region" aria-label="Interactive map showing ${escapeHTML(destination.name)}"></div>
            <p id="map-message" class="map-message" role="status" aria-live="polite"></p>
            <details class="more-places"><summary>Place suggestions (${destination.places.length})</summary><ul>${suggestions}</ul></details>
        </div>
        <section class="itinerary-section" aria-labelledby="itinerary-title">
            <div class="section-heading"><div><p class="eyebrow">MAKE IT YOURS</p><h2 id="itinerary-title">Day-by-day itinerary</h2></div>
                <p class="section-note">Add activities and the costs you want to track. Place ideas are suggestions, not bookings.</p>
            </div>
            <datalist id="place-suggestions">${destination.places.map((place) => `<option value="${escapeHTML(place)}"></option>`).join('')}</datalist>
            <div class="days">${days}</div>
        </section>
        <div class="trip-details">
            <article class="detail-card weather-detail"><p class="eyebrow">LIVE WEATHER FORECAST</p><h3>Pack for the season.</h3><p>${escapeHTML(info.weather)}</p><div class="live-forecast" id="live-forecast" aria-live="polite" aria-busy="true"></div></article>
            <article class="detail-card"><p class="eyebrow">USEFUL APPS</p><h3>Download before you go.</h3><div class="resource-list">${apps}</div></article>
            <article class="detail-card budget-detail"><p class="eyebrow">BUDGET CHECK</p><h3>${escapeHTML(formatMoney(trip.budget, destination.currency, destination.symbol))} trip budget</h3><p>Activity costs currently total <strong id="budget-activity-total">${escapeHTML(formatMoney(total, destination.currency, destination.symbol))}</strong>. This total reflects only the costs you enter; it is not a full-trip quote.</p><a href="../currency-converter/">Check exchange rates ↗</a></article>
            <article class="detail-card hotel-detail"><p class="eyebrow">HOTEL RESERVATION</p><h3>Reserve your hotel.</h3><p>Compare available rooms and locations near your first stop.</p><a class="hotel-button" href="${escapeHTML(info.hotel)}" target="_blank" rel="noreferrer">Search hotels in ${escapeHTML(destination.name)} ↗</a></article>
        </div>
        <p class="estimate-note">Activity costs are entered by you and saved on this device. Place suggestions are sourced from Wikipedia; check details and prices with each venue. Estimates are planning guides, not bookings.</p>`;
    $('budget-currency').textContent = destination.currency;
    $('trip-budget').value = String(trip.budget);
    updateMap(destination);
    renderCostTotals();
    loadForecast(destination);
}

function createTrip(destination, startDate, days, budget) {
    return {
        destination,
        startDate,
        days,
        budget,
        itinerary: Array.from({ length: days }, () => ({ activities: [] }))
    };
}

function resizeItinerary(days) {
    trip.itinerary = Array.from({ length: days }, (_, index) => trip.itinerary[index] || ({ activities: [] }));
    trip.days = days;
    render(trip);
    persistTrip();
}

const plannerForm = $('planner-form');
const destinationSuggestions = $('destination-list');
$('start-date').value = savedTrip?.startDate || localToday;
$('trip-days').value = String(savedTrip?.days || 7);
if (savedTrip) {
    $('destination').value = savedTrip.destination.query || savedTrip.destination.name;
    $('trip-budget').value = String(savedTrip.budget ?? savedTrip.destination.total ?? '');
    $('budget-currency').textContent = savedTrip.destination.currency;
    render(savedTrip);
}

getCountryDirectory()
    .then((countries) => {
        countries.forEach((country) => {
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
    delete $('trip-budget').dataset.useEstimate;
    clearTimeout(suggestionTimer);
    destinationSuggestions.querySelectorAll('[data-location-suggestion]').forEach((option) => option.remove());
    const query = $('destination').value.trim();
    const requestId = ++suggestionRequest;
    if (query.length < 2) return;

    suggestionTimer = setTimeout(async () => {
        try {
            const locations = await searchLocations(query);
            if (requestId !== suggestionRequest) return;
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
    const requestId = ++tripRequest;
    const submitButton = plannerForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    setStatus('Looking up the destination and nearby places...', 'loading');

    try {
        const startDate = $('start-date').value;
        const days = Number($('trip-days').value);
        if (!startDate || !Number.isInteger(days) || days < 1 || days > 30) {
            throw new Error('Choose a start date and a trip length from 1 to 30 days.');
        }
        const destination = await resolveDestination($('destination').value);
        if (requestId !== tripRequest) return;
        let budget = Number($('trip-budget').value);
        if ($('trip-budget').dataset.useEstimate === 'true') {
            budget = destination.base * days;
            $('trip-budget').value = String(budget);
            delete $('trip-budget').dataset.useEstimate;
        }
        if (!Number.isFinite(budget) || budget < 0) throw new Error('Enter a non-negative trip budget in the destination currency.');
        trip = createTrip(destination, startDate, days, budget);
        render(trip);
        if (persistTrip()) setStatus(`Trip ready for ${destination.name}. Add activities to the itinerary to track costs.`);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not build the trip plan.';
        setStatus(message, 'error');
        console.error('Could not build trip plan.', error);
    } finally {
        if (requestId === tripRequest) {
            submitButton.disabled = false;
            submitButton.setAttribute('aria-busy', 'false');
        }
    }
});

$('trip-days').addEventListener('change', () => {
    if (!trip) return;
    const days = Number($('trip-days').value);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
        setStatus('Trip length must be between 1 and 30 days.', 'error');
        $('trip-days').value = String(trip.days);
        return;
    }
    resizeItinerary(days);
});

$('start-date').addEventListener('change', () => {
    if (!trip) return;
    trip.startDate = $('start-date').value || localToday;
    render(trip);
    persistTrip();
});

$('trip-budget').addEventListener('input', () => {
    if (!trip) return;
    const budget = Number($('trip-budget').value);
    if (!Number.isFinite(budget) || budget < 0) return;
    trip.budget = budget;
    $('budget-activity-total').textContent = formatMoney(costTotals().total, trip.destination.currency, trip.destination.symbol);
    renderCostTotals();
    persistTrip();
});

$('plan').addEventListener('submit', (event) => {
    const form = event.target.closest('[data-add-activity]');
    if (!form || !trip) return;
    event.preventDefault();
    const dayIndex = Number(form.dataset.addActivity);
    const formData = new FormData(form);
    const name = String(formData.get('activity') || '').trim();
    const cost = Number(formData.get('cost'));
    if (!name || !Number.isFinite(cost) || cost < 0 || !trip.itinerary[dayIndex]) return;
    const suggestion = trip.destination.places.includes(name);
    trip.itinerary[dayIndex].activities.push({
        id: crypto.randomUUID(),
        name,
        cost,
        suggestion
    });
    render(trip);
    persistTrip();
    document.querySelector(`[data-add-activity="${dayIndex}"] input[name="activity"]`)?.focus();
});

$('plan').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-activity]');
    if (!button || !trip) return;
    const dayIndex = Number(button.dataset.dayIndex);
    trip.itinerary[dayIndex].activities = trip.itinerary[dayIndex].activities
        .filter((activity) => activity.id !== button.dataset.removeActivity);
    render(trip);
    persistTrip();
    document.querySelector(`[data-add-activity="${dayIndex}"] input[name="activity"]`)?.focus();
});

const requestedDestination = new URLSearchParams(window.location.search).get('destination');
if (requestedDestination?.trim()) {
    $('destination').value = requestedDestination.trim();
    $('trip-budget').value = '0';
    $('trip-budget').dataset.useEstimate = 'true';
    plannerForm.requestSubmit();
}
