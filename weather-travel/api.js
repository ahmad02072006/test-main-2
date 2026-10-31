const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const EXCHANGE_RATE_URL = 'https://api.frankfurter.dev/v1';
const responseCache = new Map();
const pendingRequests = new Map();

async function cachedJson(url, { ttl = 300, message = 'Service unavailable.' } = {}) {
    const cached = responseCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (pendingRequests.has(url)) return pendingRequests.get(url);
    const request = fetch(url).then(async (response) => {
        if (!response.ok) {
            if (response.status === 429) throw new Error('The service is busy. Please wait a moment and try again.');
            throw new Error(message);
        }
        const data = await response.json();
        responseCache.set(url, { data, expiresAt: Date.now() + ttl * 1000 });
        return data;
    }).finally(() => pendingRequests.delete(url));
    pendingRequests.set(url, request);
    return request;
}

const openMeteoCondition = (code) => {
    if ([95, 96, 99].includes(code)) return {
        main: 'Thunderstorm',
        description: 'thunderstorm'
    };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return {
        main: 'Snow',
        description: 'snow'
    };
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return {
        main: 'Rain',
        description: 'rain showers'
    };
    if ([45, 48].includes(code)) return {
        main: 'Mist',
        description: 'mist'
    };
    if ([1, 2, 3].includes(code)) return {
        main: 'Clouds',
        description: code === 1 ? 'mainly clear' : 'partly cloudy'
    };
    return {
        main: 'Clear',
        description: 'clear sky'
    };
};

export const getWeatherByCity = (city, units = 'metric') => getOpenMeteoByCity(city, units);

export const getWeatherByCoordinates = (latitude, longitude, units = 'metric', place = {}) =>
    getOpenMeteoByCoordinates(latitude, longitude, units, place);

export async function searchLocations(query, countryCode) {
    const params = new URLSearchParams({
        name: query,
        count: '100',
        language: 'en',
        format: 'json'
    });
    if (countryCode) params.set('countryCode', countryCode);
    const data = await cachedJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
        ttl: 86400,
        message: 'Location search is unavailable.'
    });
    return data.results || [];
}

export async function getCurrencies() {
    return cachedJson(`${EXCHANGE_RATE_URL}/currencies`, {
        ttl: 86400,
        message: 'Currency list is unavailable. Please try again later.'
    });
}

export async function getExchangeRate(base, quote) {
    const params = new URLSearchParams({
        base,
        symbols: quote
    });
    const data = await cachedJson(`${EXCHANGE_RATE_URL}/latest?${params}`, {
        ttl: 3600,
        message: 'Exchange rate is unavailable. Please try again later.'
    });
    const rate = data.rates?.[quote];
    if (typeof rate !== 'number') throw new Error(`No exchange rate is available for ${base} to ${quote}.`);
    return {
        rate,
        date: data.date
    };
}

async function getOpenMeteoByCity(city, units) {
    const places = await searchLocations(city);
    const place = places.find((item) => item.feature_code === 'PPLC' || item.feature_code === 'PPLA') || places[0];
    if (!place) throw new Error(`Could not find “${city}”. Try a city or country name.`);
    return getOpenMeteoByCoordinates(place.latitude, place.longitude, units, place);
}

async function getOpenMeteoByCoordinates(latitude, longitude, units, place = {}) {
    const temperatureUnit = units === 'imperial' ? 'fahrenheit' : 'celsius';
    const windSpeedUnit = units === 'imperial' ? 'mph' : 'ms';
    const params = new URLSearchParams({
        latitude,
        longitude,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,wind_speed_10m_max,precipitation_probability_max',
        temperature_unit: temperatureUnit,
        wind_speed_unit: windSpeedUnit,
        timezone: 'auto',
        forecast_days: '7'
    });
    const data = await cachedJson(`${OPEN_METEO_URL}?${params}`, {
        ttl: 900,
        message: 'Weather service is unavailable.'
    });
    const currentCondition = openMeteoCondition(data.current.weather_code);
    const weather = {
        name: place.name || 'Your location',
        sys: {
            country: place.country || place.country_code || ''
        },
        weather: [currentCondition],
        main: {
            temp: data.current.temperature_2m,
            feels_like: data.current.apparent_temperature,
            humidity: data.current.relative_humidity_2m,
            time: data.current.time
        },
        wind: {
            speed: data.current.wind_speed_10m
        }
    };
    const forecast = {
        list: data.daily.time.map((date, index) => ({
            dt: new Date(`${date}T12:00:00`).getTime() / 1000,
            dt_txt: `${date} 12:00:00`,
            weather: [openMeteoCondition(data.daily.weather_code[index])],
            main: {
                temp_max: data.daily.temperature_2m_max[index],
                temp_min: data.daily.temperature_2m_min[index],
                humidity: data.daily.relative_humidity_2m_mean[index]
            },
            wind: { speed: data.daily.wind_speed_10m_max[index] },
            precipitation_probability: data.daily.precipitation_probability_max[index]
        }))
    };
    return [weather, forecast];
}
