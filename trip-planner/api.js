import { searchLocations } from '../weather-travel/api.js';

const curatedBudgets = {
    seoul: {
        currency: 'KRW',
        symbol: '₩',
        base: 72000
    },
    paris: {
        currency: 'EUR',
        symbol: '€',
        base: 82
    },
    london: {
        currency: 'GBP',
        symbol: '£',
        base: 76
    },
    tokyo: {
        currency: 'JPY',
        symbol: '¥',
        base: 9300
    },
    tashkent: {
        currency: 'UZS',
        symbol: 'soʻm',
        base: 380000
    }
};

const COUNTRY_DATA_URL = 'https://raw.githubusercontent.com/annexare/Countries/master/dist/countries.min.json';
const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';
const USD_RATES_URL = 'https://open.er-api.com/v6/latest/USD';

let countryDirectoryRequest;
let usdRatesRequest;

function normalizeName(value) {
    return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

async function fetchJson(url, message) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(message);
    return response.json();
}

export function getCountryDirectory() {
    if (!countryDirectoryRequest) {
        countryDirectoryRequest = fetchJson(COUNTRY_DATA_URL, 'Country suggestions are unavailable. Please try again later.')
            .then((data) => {
                const countries = Object.entries(data)
                    .filter(([, country]) => country && typeof country.name === 'string')
                    .map(([code, country]) => ({ code, ...country }));
                if (!countries.length) throw new Error('The country directory returned no countries.');
                return countries.sort((first, second) => first.name.localeCompare(second.name));
            })
            .catch((error) => {
                countryDirectoryRequest = undefined;
                throw error;
            });
    }
    return countryDirectoryRequest;
}

function matchCountry(query, countries) {
    const normalizedQuery = normalizeName(query);
    return countries.find((country) => {
        const names = [country.name, country.native, ...(Array.isArray(country.alias) ? country.alias : [])];
        return names.some((name) => typeof name === 'string' && normalizeName(name) === normalizedQuery);
    });
}

function selectLocation(locations, countryCode, query = '', exactOnly = false) {
    const normalizedQuery = normalizeName(query);
    const matches = countryCode
        ? locations.filter((location) => location.country_code?.toUpperCase() === countryCode.toUpperCase())
        : locations;
    const relevant = normalizedQuery
        ? matches.filter((location) => {
            const name = normalizeName(location.name);
            return name === normalizedQuery || (!exactOnly && (normalizedQuery.includes(name) || name.includes(normalizedQuery)));
        })
        : matches;
    return relevant.sort((first, second) => {
        const relevance = (location) => {
            const name = normalizeName(location.name);
            if (!normalizedQuery) return 0;
            if (name === normalizedQuery) return 2;
            return 1;
        };
        const rank = (location) => location.feature_code === 'PPLC' ? 2 : location.feature_code?.startsWith('PPLA') ? 1 : 0;
        return relevance(second) - relevance(first)
            || rank(second) - rank(first)
            || (second.population || 0) - (first.population || 0);
    })[0];
}

async function getPlaceTypes(pages) {
    const pageIds = [...new Set(pages
        .map((page) => page.pageprops?.wikibase_item)
        .filter((id) => /^Q\d+$/.test(id || '')))];
    if (!pageIds.length) return new Map();

    const entityBatches = await Promise.all(Array.from({ length: Math.ceil(pageIds.length / 50) }, (_, index) => {
        const parameters = new URLSearchParams({
            action: 'wbgetentities',
            ids: pageIds.slice(index * 50, (index + 1) * 50).join('|'),
            props: 'claims|sitelinks',
            format: 'json',
            origin: '*'
        });
        return fetchJson(`${WIKIDATA_API_URL}?${parameters}`, 'Nearby place categories could not be loaded.');
    }));
    const entities = entityBatches.flatMap((batch) => Object.values(batch.entities || {}));
    const classIds = [...new Set(entities.flatMap((entity) => (entity.claims?.P31 || [])
        .map((claim) => claim.mainsnak?.datavalue?.value?.id)
        .filter((id) => /^Q\d+$/.test(id || ''))))];
    let labels = new Map();

    if (classIds.length) {
        const labelBatches = await Promise.all(Array.from({ length: Math.ceil(classIds.length / 50) }, (_, index) => {
            const parameters = new URLSearchParams({
                action: 'wbgetentities',
                ids: classIds.slice(index * 50, (index + 1) * 50).join('|'),
                props: 'labels',
                languages: 'en',
                format: 'json',
                origin: '*'
            });
            return fetchJson(`${WIKIDATA_API_URL}?${parameters}`, 'Nearby place categories could not be loaded.');
        }));
        labels = new Map(labelBatches.flatMap((batch) => Object.values(batch.entities || {})
            .map((entity) => [entity.id, entity.labels?.en?.value || ''])));
    }

    return new Map(entities.map((entity) => [
        entity.id,
        {
            classes: (entity.claims?.P31 || [])
                .map((claim) => labels.get(claim.mainsnak?.datavalue?.value?.id))
                .filter(Boolean),
            popularity: Object.keys(entity.sitelinks || {}).length
        }
    ]));
}

async function searchPopularPages(name) {
    const searches = [
        'landmarks',
        'tourist attractions',
        'museums',
        'monuments',
        'parks',
        'historic sites',
        'temples',
        'shrines',
        'skyscrapers',
        'squares'
    ];
    const results = await Promise.all(searches.map((type) => {
        const parameters = new URLSearchParams({
            action: 'query',
            list: 'search',
            srsearch: `${name} ${type}`,
            srnamespace: '0',
            srlimit: '20',
            format: 'json',
            origin: '*'
        });
        return fetchJson(`${WIKIPEDIA_API_URL}?${parameters}`, 'Popular place search is unavailable. Please try again later.');
    }));
    const pageIds = [...new Set(results.flatMap((result) => result.query?.search || [])
        .map((result) => result.pageid)
        .filter((id) => Number.isInteger(id)))];
    if (!pageIds.length) return [];

    const pageBatches = await Promise.all(Array.from({ length: Math.ceil(pageIds.length / 50) }, (_, index) => {
        const parameters = new URLSearchParams({
            action: 'query',
            pageids: pageIds.slice(index * 50, (index + 1) * 50).join('|'),
            prop: 'coordinates|pageprops',
            coprop: 'type',
            format: 'json',
            origin: '*'
        });
        return fetchJson(`${WIKIPEDIA_API_URL}?${parameters}`, 'Popular place details are unavailable. Please try again later.');
    }));
    return pageBatches.flatMap((batch) => Object.values(batch.query?.pages || {}));
}

function isWithinPopularPlaceRadius(page, latitude, longitude) {
    const coordinate = page.coordinates?.[0];
    if (!Number.isFinite(coordinate?.lat) || !Number.isFinite(coordinate?.lon)) return false;
    const radians = Math.PI / 180;
    const latitudeDelta = (coordinate.lat - latitude) * radians;
    const longitudeDelta = (coordinate.lon - longitude) * radians;
    const haversine = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(latitude * radians) * Math.cos(coordinate.lat * radians) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) <= 20000;
}

async function searchNearbyPlaces(latitude, longitude, allowEmpty = false, cityName, countryName) {
    const longitudeOffset = 0.035 / Math.max(Math.cos(latitude * Math.PI / 180), 0.2);
    const searchCenters = [
        [latitude, longitude],
        [latitude + 0.035, longitude],
        [latitude - 0.035, longitude],
        [latitude, longitude + longitudeOffset],
        [latitude, longitude - longitudeOffset]
    ];
    const pageBatches = await Promise.all(searchCenters.map(async ([centerLatitude, centerLongitude]) => {
        const parameters = new URLSearchParams({
            action: 'query',
            generator: 'geosearch',
            ggscoord: `${centerLatitude}|${centerLongitude}`,
            ggsradius: '10000',
            ggsort: 'distance',
            ggsnamespace: '0',
            ggslimit: '100',
            prop: 'coordinates|pageprops',
            coprop: 'type',
            format: 'json',
            origin: '*'
        });
        const data = await fetchJson(`${WIKIPEDIA_API_URL}?${parameters}`, 'Nearby places could not be loaded. Please try again later.');
        return Object.values(data.query?.pages || {});
    }));
    const popularPages = cityName && countryName
        ? (await searchPopularPages(cityName)).filter((page) => isWithinPopularPlaceRadius(page, latitude, longitude))
        : [];
    const uniquePages = new Map();
    [...pageBatches.flat(), ...popularPages].forEach((page) => {
        const key = page.pageid || page.title;
        const existingPage = uniquePages.get(key);
        if (!existingPage || page.index < existingPage.index) uniquePages.set(key, page);
    });
    const pages = [...uniquePages.values()];
    const placeTypes = await getPlaceTypes(pages);
    const excludedType = /^(?:adm\d\w*|airport|city|country|edu|event|railwaystation|station)$/i;
    const excludedTitle = /\b(?:airport|archdiocese|attack|bank|battle|bombing|borough|commune|corporation|district|embassy|federation|festival|headquarters|hotel|inn|metropolitan area|metro|municipality|oblast|police|province|railway station|region|resort|school|siege|stadium|station|suburb|subway|timeline|train station|university|war)\b/i;
    const attractionTitle = /\b(?:aquarium|arc|amusement park|bazaar|beach|botanical|bridge|building|castle|catacomb|cathedral|cemetery|church|citadel|fort|fountain|gallery|garden|heritage|historic|island|isle|lake|library|market|madrasa|madrasah|mausoleum|memorial|museum|monastery|monument|mosque|mountain|observatory|observation deck|park|palace|pagoda|plaza|promenade|shrine|skyscraper|square|statue|temple|theatre|theater|theme park|tower|waterfall|zoo)\b/i;
    const fictionalClass = /\b(?:fictional|game location|video game)\b/i;
    const attractionClass = /\b(?:aquarium|archaeological site|amusement park|bazaar|beach|bridge|building|castle|cathedral|cave|church|citadel|fort|fountain|gallery|garden|heritage site|historic building|historic site|island|lake|landmark|library|market|madrasa|mausoleum|memorial|monastery|monument|mosque|mountain|museum|observation deck|opera house|pagoda|palace|park|plaza|point of interest|protected area|sculpture|shrine|skyscraper|square|statue|temple|theatre|theater|theme park|tourist attraction|tower|waterfall|zoo)\b/i;
    const seen = new Set();
    const places = pages
        .filter((page) => typeof page.title === 'string' && page.title.trim())
        .filter((page) => !excludedType.test(page.coordinates?.[0]?.type || ''))
        .filter((page) => !excludedTitle.test(page.title))
        .filter((page) => {
            const { classes = [] } = placeTypes.get(page.pageprops?.wikibase_item) || {};
            if (classes.some((label) => fictionalClass.test(label))) return false;
            return page.coordinates?.[0]?.type === 'isle'
                || attractionTitle.test(page.title)
                || classes.some((label) => attractionClass.test(label));
        })
        .sort((first, second) => {
            const firstDetails = placeTypes.get(first.pageprops?.wikibase_item) || {};
            const secondDetails = placeTypes.get(second.pageprops?.wikibase_item) || {};
            const landmarkRank = (page) => page.coordinates?.[0]?.type === 'landmark' ? 1 : 0;
            return landmarkRank(second) - landmarkRank(first)
                || (secondDetails.popularity || 0) - (firstDetails.popularity || 0)
                || first.index - second.index;
        })
        .filter((page) => {
            const title = normalizeName(page.title);
            if (seen.has(title)) return false;
            seen.add(title);
            return true;
        })
        .map((page) => page.title);

    if (!places.length && !allowEmpty) throw new Error('No nearby attractions were found. Try a larger city or its country.');
    return places;
}

async function findWikipediaDestination(query, countries) {
    const searchParams = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: query,
        gsrlimit: '10',
        prop: 'coordinates|pageprops',
        format: 'json',
        origin: '*'
    });
    const searchData = await fetchJson(`${WIKIPEDIA_API_URL}?${searchParams}`, 'Destination search is unavailable. Please try again later.');
    const page = Object.values(searchData.query?.pages || {})
        .find((candidate) => normalizeName(candidate.title) === normalizeName(query) && candidate.coordinates?.[0]);
    const entityId = page?.pageprops?.wikibase_item;
    if (!page || !/^Q\d+$/.test(entityId || '')) return undefined;

    const entityParams = new URLSearchParams({
        action: 'wbgetentities',
        ids: entityId,
        props: 'claims',
        format: 'json',
        origin: '*'
    });
    const entityData = await fetchJson(`${WIKIDATA_API_URL}?${entityParams}`, 'Destination details are unavailable. Please try again later.');
    const entity = entityData.entities?.[entityId];
    const countryId = entity?.claims?.P17?.[0]?.mainsnak?.datavalue?.value?.id;
    let adminId = entity?.claims?.P131?.[0]?.mainsnak?.datavalue?.value?.id;
    if (!/^Q\d+$/.test(countryId || '')) return undefined;

    const labelParams = new URLSearchParams({
        action: 'wbgetentities',
        ids: [countryId, adminId].filter((id) => /^Q\d+$/.test(id || '')).join('|'),
        props: 'labels',
        languages: 'en',
        format: 'json',
        origin: '*'
    });
    const labelData = await fetchJson(`${WIKIDATA_API_URL}?${labelParams}`, 'Destination details are unavailable. Please try again later.');
    const countryName = labelData.entities?.[countryId]?.labels?.en?.value;
    const country = matchCountry(countryName || '', countries);
    if (!country) return undefined;

    let city;
    for (let depth = 0; adminId && depth < 3; depth += 1) {
        const adminName = labelData.entities?.[adminId]?.labels?.en?.value;
        if (adminName) {
            const matches = await searchLocations(adminName, country.code);
            city = selectLocation(
                matches.filter((location) => location.feature_code === 'PPL'
                    || location.feature_code === 'PPLX'
                    || location.feature_code === 'PPLC'
                    || location.feature_code?.startsWith('PPLA')),
                country.code,
                adminName,
                true
            );
            if (city) break;
        }

        const adminParams = new URLSearchParams({
            action: 'wbgetentities',
            ids: adminId,
            props: 'claims|labels',
            languages: 'en',
            format: 'json',
            origin: '*'
        });
        const adminData = await fetchJson(`${WIKIDATA_API_URL}?${adminParams}`, 'Destination details are unavailable. Please try again later.');
        const adminEntity = adminData.entities?.[adminId];
        const parentId = adminEntity?.claims?.P131?.[0]?.mainsnak?.datavalue?.value?.id;
        if (parentId && /^Q\d+$/.test(parentId)) {
            const parentParams = new URLSearchParams({
                action: 'wbgetentities',
                ids: parentId,
                props: 'labels',
                languages: 'en',
                format: 'json',
                origin: '*'
            });
            const parentData = await fetchJson(`${WIKIDATA_API_URL}?${parentParams}`, 'Destination details are unavailable. Please try again later.');
            labelData.entities[parentId] = parentData.entities?.[parentId];
            adminId = parentId;
        } else {
            adminId = undefined;
        }
    }

    const { lat: latitude, lon: longitude } = page.coordinates[0];
    const nearbyPlaces = await searchNearbyPlaces(
        city?.latitude ?? latitude,
        city?.longitude ?? longitude,
        true,
        city?.name || page.title,
        country.name
    );
    const places = [page.title, ...nearbyPlaces.filter((place) => normalizeName(place) !== normalizeName(page.title))];
    const name = city?.name || page.title;
    const budget = await getBudget(
        Array.isArray(country.currency) ? country.currency[0] : '',
        curatedBudgets[normalizeName(name)]
    );
    return {
        name,
        country: country.name,
        currency: budget.currency,
        symbol: budget.symbol,
        base: budget.base,
        budgetNote: budget.note,
        latitude,
        longitude,
        destinationPlace: page.title,
        isCountryDestination: false,
        places,
        query
    };
}

async function getUsdRates() {
    if (!usdRatesRequest) {
        usdRatesRequest = fetchJson(USD_RATES_URL, 'Currency estimates are unavailable.')
            .then((data) => {
                if (data.result !== 'success' || !data.rates) throw new Error('The currency service returned invalid exchange rates.');
                return data.rates;
            })
            .catch((error) => {
                usdRatesRequest = undefined;
                throw error;
            });
    }
    return usdRatesRequest;
}

function getCurrencySymbol(currency) {
    try {
        return new Intl.NumberFormat('en', { style: 'currency', currency })
            .formatToParts(0)
            .find((part) => part.type === 'currency')?.value || currency;
    } catch {
        return currency;
    }
}

async function getBudget(currency, curatedPlan) {
    if (curatedPlan) {
        return {
            currency: curatedPlan.currency,
            symbol: curatedPlan.symbol,
            base: curatedPlan.base
        };
    }

    if (currency && /^[A-Z]{3}$/.test(currency)) {
        try {
            const rates = await getUsdRates();
            if (typeof rates[currency] === 'number') {
                return {
                    currency,
                    symbol: getCurrencySymbol(currency),
                    base: Math.round(85 * rates[currency])
                };
            }
        } catch (error) {
            console.error('Could not load local currency estimates.', error);
        }
    }

    return {
        currency: 'USD',
        symbol: '$',
        base: 85,
        note: 'A local exchange rate was unavailable, so the budget is shown in USD.'
    };
}

export async function resolveDestination(query) {
    const search = query.trim();
    if (!search) throw new Error('Enter a city or country to build your trip.');

    let countries = [];
    let countryDirectoryError;
    try {
        countries = await getCountryDirectory();
    } catch (error) {
        countryDirectoryError = error;
    }
    let country = matchCountry(search, countries);
    let isCountryDestination = Boolean(country);
    let locations;
    let locationQuery = search;

    if (!country && search.includes(',')) {
        const countrySeparator = search.lastIndexOf(',');
        const cityQuery = search.slice(0, countrySeparator).trim();
        const matchedCountry = matchCountry(search.slice(countrySeparator + 1).trim(), countries);
        if (matchedCountry && cityQuery.trim()) {
            country = matchedCountry;
            locationQuery = cityQuery;
        }
    }

    if (country) {
        if (isCountryDestination) {
            if (!country.capital) throw new Error(`A capital city is not listed for ${country.name}. Try entering a city instead.`);
            locationQuery = country.capital;
        }
        locations = await searchLocations(locationQuery, country.code);
    } else {
        locations = await searchLocations(locationQuery);
    }

    let location = selectLocation(locations, country?.code, locationQuery);
    if (!location) {
        const wikipediaDestination = await findWikipediaDestination(locationQuery, countries);
        if (wikipediaDestination) return wikipediaDestination;
        throw new Error(`Could not find “${search}”. Try a city, attraction, or country name.`);
    }

    if (location.feature_code === 'PCLI') {
        isCountryDestination = true;
        country ||= countries.find((item) => item.code.toUpperCase() === location.country_code?.toUpperCase());
        if (!country?.capital) {
            if (countryDirectoryError) throw new Error('The country directory is unavailable. Try entering the capital city instead.');
            throw new Error(`Could not find a capital city for ${location.name}. Try entering a city instead.`);
        }
        locations = await searchLocations(country.capital, country.code);
        location = selectLocation(locations, country.code, country.capital);
        if (!location) throw new Error(`Could not find the capital city of ${country.name}. Please try a city name.`);
    }

    country ||= countries.find((item) => item.code.toUpperCase() === location.country_code?.toUpperCase());
    const currency = Array.isArray(country?.currency) ? country.currency[0] : '';
    const curatedPlan = curatedBudgets[normalizeName(location.name)];
    const budget = await getBudget(currency, curatedPlan);
    if (countryDirectoryError) {
        console.error('Country details could not be loaded for this destination.', countryDirectoryError);
    }
    const places = await searchNearbyPlaces(location.latitude, location.longitude, false, location.name, country?.name || location.country);

    return {
        name: location.name,
        country: country?.name || location.country || 'Unknown country',
        currency: budget.currency,
        symbol: budget.symbol,
        base: budget.base,
        budgetNote: countryDirectoryError
            ? 'Country details could not be loaded, so the budget is shown in USD.'
            : budget.note,
        places,
        latitude: location.latitude,
        longitude: location.longitude,
        isCountryDestination,
        query: search
    };
}

export function buildPlan(destination, days, style) {
    const multiplier = style === 'comfort' ? 1.55 : style === 'slow' ? 0.82 : 1;
    const daily = Math.round(destination.base * multiplier);
    const placeCount = destination.places.length;
    const seenPairs = new Set();
    const itinerary = Array.from({
        length: days
    }, (_, index) => {
        let firstIndex = (index * 2) % placeCount;
        let secondIndex = (firstIndex + 1 + Math.floor(index / 2)) % placeCount;
        let pairKey = [firstIndex, secondIndex].sort((a, b) => a - b).join('|');

        let attempts = 0;
        while (seenPairs.has(pairKey) && attempts < placeCount) {
            secondIndex = (secondIndex + 1) % placeCount;
            pairKey = [firstIndex, secondIndex].sort((a, b) => a - b).join('|');
            attempts += 1;
        }

        seenPairs.add(pairKey);

        return {
            day: index + 1,
            places: placeCount > 1
                ? [destination.places[firstIndex], destination.places[secondIndex]]
                : [destination.places[firstIndex]],
            note: index === 0 ? 'Start gently and get your bearings.' : index === days - 1 ? 'Keep the last day flexible for a final favorite.' : 'Leave space for a slow lunch and an unplanned turn.'
        };
    });
    return {
        ...destination,
        daily,
        total: daily * days,
        itinerary
    };
}
