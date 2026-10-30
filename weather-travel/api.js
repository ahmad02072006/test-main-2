const API_KEY = 'YOUR_OPENWEATHERMAP_API_KEY';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const EXCHANGE_RATE_URL = 'https://api.frankfurter.dev/v1';

const openMeteoCondition = (code) => {
    if (code >= 95) return {
        main: 'Thunderstorm',
        description: 'thunderstorm'
    };
    if (code >= 71) return {
        main: 'Snow',
        description: 'snow'
    };
    if (code >= 51) return {
        main: 'Rain',
        description: 'rain showers'
    };
    if (code >= 45) return {
        main: 'Mist',
        description: 'mist'
    };
    if (code >= 1 && code <= 3) return {
        main: 'Clouds',
        description: code === 1 ? 'mainly clear' : 'partly cloudy'
    };
    return {
        main: 'Clear',
        description: 'clear sky'
    };
};

async function request(path, params) {
    if (API_KEY === 'YOUR_OPENWEATHERMAP_API_KEY') throw new Error('Add your OpenWeatherMap API key in weather-travel/api.js.');
    const query = new URLSearchParams({
        ...params,
        appid: API_KEY
    });
    const response = await fetch(`${BASE_URL}/${path}?${query}`);
    if (!response.ok) throw new Error('Weather service could not find that place.');
    return response.json();
}

export const getWeatherByCity = (city, units = 'metric') => API_KEY !== 'YOUR_OPENWEATHERMAP_API_KEY' ?
    Promise.all([request('weather', {
        q: city,
        units
    }), request('forecast', {
        q: city,
        units
    })]) :
    getOpenMeteoByCity(city, units);

export const getWeatherByCoordinates = (latitude, longitude, units = 'metric', place = {}) => API_KEY !== 'YOUR_OPENWEATHERMAP_API_KEY' ?
    Promise.all([request('weather', {
        lat: latitude,
        lon: longitude,
        units
    }), request('forecast', {
        lat: latitude,
        lon: longitude,
        units
    })]) :
    getOpenMeteoByCoordinates(latitude, longitude, units, place);

export async function searchLocations(query, countryCode) {
    const params = new URLSearchParams({
        name: query,
        count: '100',
        language: 'en',
        format: 'json'
    });
    if (countryCode) params.set('countryCode', countryCode);
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
    if (!response.ok) throw new Error('Location search is unavailable.');
    return (await response.json()).results || [];
}

export async function getCurrencies() {
    const response = await fetch(`${EXCHANGE_RATE_URL}/currencies`);
    if (!response.ok) throw new Error('Currency list is unavailable. Please try again later.');
    return response.json();
}

export async function getExchangeRate(base, quote) {
    const params = new URLSearchParams({
        base,
        symbols: quote
    });
    const response = await fetch(`${EXCHANGE_RATE_URL}/latest?${params}`);
    if (!response.ok) throw new Error('Exchange rate is unavailable. Please try again later.');
    const data = await response.json();
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
    const response = await fetch(`${OPEN_METEO_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=${temperatureUnit}&wind_speed_unit=kmh&timezone=auto&forecast_days=6`);
    if (!response.ok) throw new Error('Weather service is unavailable.');
    const data = await response.json();
    const currentCondition = openMeteoCondition(data.current.weather_code);
    const wind = units === 'imperial' ? data.current.wind_speed_10m / 2.237 : data.current.wind_speed_10m / 3.6;
    const weather = {
        name: place.name || 'Your location',
        sys: {
            country: place.country || place.country_code || ''
        },
        weather: [currentCondition],
        main: {
            temp: data.current.temperature_2m,
            feels_like: data.current.apparent_temperature,
            humidity: data.current.relative_humidity_2m
        },
        wind: {
            speed: wind
        }
    };
    const forecast = {
        list: data.daily.time.slice(1).map((date, index) => ({
            dt: new Date(`${date}T12:00:00`).getTime() / 1000,
            dt_txt: `${date} 12:00:00`,
            weather: [openMeteoCondition(data.daily.weather_code[index + 1])],
            main: {
                temp_max: data.daily.temperature_2m_max[index + 1],
                temp_min: data.daily.temperature_2m_min[index + 1]
            }
        }))
    };
    return [weather, forecast];
}
