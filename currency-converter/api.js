import { API_BASE_URL } from '../api-config.js';

const cryptoIds = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana'
};
const cache = new Map();
const pending = new Map();

async function cachedFetchJson(url, { ttl = 900, headers = {} } = {}) {
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (pending.has(url)) return pending.get(url);
    const request = fetch(url, { headers }).then(async (response) => {
        if (!response.ok) {
            if (response.status === 429) throw new Error('The rate service is busy. Please wait a moment and retry.');
            if (response.status === 503) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'The rate service needs server configuration.');
            }
            throw new Error('The rate service is temporarily unavailable.');
        }
        const data = await response.json();
        cache.set(url, { data, expiresAt: Date.now() + ttl * 1000 });
        return data;
    }).finally(() => pending.delete(url));
    pending.set(url, request);
    return request;
}

function requireApiUrl() {
    if (!API_BASE_URL) {
        throw new Error('Exchange rates need the API Atlas backend URL. Deploy the Worker and set API_ATLAS_CONFIG.baseUrl in api-config.js.');
    }
    return API_BASE_URL.replace(/\/+$/, '');
}

export const isCrypto = (symbol) => Boolean(cryptoIds[symbol]);

export async function getFiatRates(base) {
    const params = new URLSearchParams({ base });
    const data = await cachedFetchJson(`${requireApiUrl()}/rates?${params}`, { ttl: 900 });
    if (!data.rates || data.base !== base) throw new Error('The exchange-rate service returned invalid data.');
    return {
        base: data.base,
        rates: data.rates,
        updatedAt: data.updatedAt,
        nextUpdateAt: data.nextUpdateAt,
        provider: data.provider
    };
}

export async function getCryptoPrices() {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd,eur,gbp,jpy,cad,aud&include_last_updated_at=true';
    const data = await cachedFetchJson(url, { ttl: 120 });
    return data;
}

export async function getRate(from, to) {
    if (from === to) return { rate: 1, updatedAt: null, provider: 'Same currency' };
    if (!isCrypto(from) && !isCrypto(to)) {
        const data = await getFiatRates(from);
        const rate = data.rates[to];
        if (!Number.isFinite(rate)) throw new Error(`No rate is available for ${from} to ${to}.`);
        return { rate, updatedAt: data.updatedAt, nextUpdateAt: data.nextUpdateAt, provider: data.provider };
    }

    const prices = await getCryptoPrices();
    const fromCoin = cryptoIds[from];
    const toCoin = cryptoIds[to];
    if (fromCoin && toCoin) {
        const fromPrice = prices[fromCoin]?.usd;
        const toPrice = prices[toCoin]?.usd;
        if (!Number.isFinite(fromPrice) || !Number.isFinite(toPrice)) throw new Error('A crypto rate is not available for this pair.');
        return {
            rate: fromPrice / toPrice,
            updatedAt: new Date(Math.min(prices[fromCoin].last_updated_at, prices[toCoin].last_updated_at) * 1000).toISOString(),
            provider: 'CoinGecko'
        };
    }
    if (fromCoin) {
        const rate = prices[fromCoin]?.[to.toLowerCase()];
        if (!Number.isFinite(rate)) throw new Error(`No crypto rate is available for ${from} to ${to}.`);
        return {
            rate,
            updatedAt: new Date(prices[fromCoin].last_updated_at * 1000).toISOString(),
            provider: 'CoinGecko'
        };
    }
    const price = prices[toCoin]?.[from.toLowerCase()];
    if (!Number.isFinite(price) || price === 0) throw new Error(`No crypto rate is available for ${from} to ${to}.`);
    return {
        rate: 1 / price,
        updatedAt: new Date(prices[toCoin].last_updated_at * 1000).toISOString(),
        provider: 'CoinGecko'
    };
}

function dateOnly(date) {
    return date.toISOString().slice(0, 10);
}

function dailyAverages(history, transform = (value) => value) {
    const grouped = new Map();
    history.forEach(([timestamp, rawValue]) => {
        const date = dateOnly(new Date(timestamp));
        const entry = grouped.get(date) || { total: 0, count: 0 };
        entry.total += transform(rawValue);
        entry.count++;
        grouped.set(date, entry);
    });
    return new Map([...grouped].map(([date, entry]) => [date, entry.total / entry.count]));
}

export async function getHistorical(from, to) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    if (!isCrypto(from) && !isCrypto(to)) {
        const url = `https://api.frankfurter.dev/v1/${dateOnly(start)}..${dateOnly(end)}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
        const data = await cachedFetchJson(url, { ttl: 21600 });
        const entries = Object.entries(data.rates || {}).sort(([first], [second]) => first.localeCompare(second));
        if (!entries.length) throw new Error('Historical reference rates are not available for this period.');
        return {
            labels: entries.map(([date]) => date),
            values: entries.map(([, rates]) => rates[to]),
            provider: 'Frankfurter'
        };
    }

    if (isCrypto(from) && isCrypto(to)) {
        const [fromHistory, toHistory] = await Promise.all([
            getCryptoHistory(cryptoIds[from], 'usd'),
            getCryptoHistory(cryptoIds[to], 'usd')
        ]);
        const sourceByDate = dailyAverages(fromHistory);
        const targetByDate = dailyAverages(toHistory);
        const paired = [...sourceByDate].filter(([date]) => targetByDate.has(date)).map(([date, value]) => ({
            date,
            rate: value / targetByDate.get(date)
        }));
        if (!paired.length) throw new Error('Historical crypto comparisons are unavailable.');
        return {
            labels: paired.map(({ date }) => date),
            values: paired.map(({ rate }) => rate),
            provider: 'CoinGecko'
        };
    }
    const fromIsCrypto = isCrypto(from);
    const coin = cryptoIds[fromIsCrypto ? from : to];
    const vs = (fromIsCrypto ? to : from).toLowerCase();
    const series = dailyAverages(
        await getCryptoHistory(coin, vs),
        (value) => fromIsCrypto ? value : 1 / value
    );
    return {
        labels: [...series.keys()],
        values: [...series.values()],
        provider: 'CoinGecko'
    };
}

async function getCryptoHistory(coin, vs) {
    const url = `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=${vs}&days=7`;
    const data = await cachedFetchJson(url, { ttl: 600 });
    if (!Array.isArray(data.prices) || !data.prices.length) throw new Error('Historical crypto prices are unavailable.');
    return data.prices;
}
