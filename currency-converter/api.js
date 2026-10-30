const EXCHANGE_KEY = 'YOUR_EXCHANGERATE_API_KEY';
const fiatSymbols = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
const cryptoIds = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana'
};
export const isCrypto = (symbol) => Boolean(cryptoIds[symbol]);
export const getFiatRates = async (base) => {
    const url = EXCHANGE_KEY === 'YOUR_EXCHANGERATE_API_KEY' ?
        `https://open.er-api.com/v6/latest/${base}` :
        `https://v6.exchangerate-api.com/v6/${EXCHANGE_KEY}/latest/${base}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Fiat rate service unavailable.');
    const data = await response.json();
    if (data.result === 'error') throw new Error('Fiat rate service unavailable.');
    if (!data.conversion_rates && data.rates) data.conversion_rates = data.rates;
    return data;
};
export const getCryptoPrices = async () => {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd,eur,gbp,jpy,cad,aud');
    if (!response.ok) throw new Error('Crypto rate service unavailable.');
    return response.json();
};
export const getRate = async (from, to) => {
    if (from === to) return 1;
    const crypto = isCrypto(from) || isCrypto(to) ? await getCryptoPrices() : null;
    if (isCrypto(from)) {
        const coin = crypto[cryptoIds[from]];
        if (isCrypto(to)) return coin.usd / crypto[cryptoIds[to]].usd;
        if (coin[to.toLowerCase()]) return coin[to.toLowerCase()];
        const fiat = await getFiatRates('USD');
        return coin.usd * fiat.conversion_rates[to];
    }
    if (isCrypto(to)) {
        const coin = crypto[cryptoIds[to]];
        const fiat = await getFiatRates(from);
        return (fiat.conversion_rates.USD || 1) / coin.usd;
    }
    const fiat = await getFiatRates(from);
    const rate = fiat.conversion_rates[to];
    if (!Number.isFinite(rate)) throw new Error(`No rate is available for ${from} to ${to}.`);
    return rate;
};
export const getHistorical = async (from, to) => {
    const coin = cryptoIds[from] || cryptoIds[to];
    if (coin) {
        const vs = (isCrypto(to) ? 'usd' : to).toLowerCase();
        const data = await fetch(`https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=${vs}&days=7`).then((r) => r.json());
        return data.prices.filter((_, i) => i % 12 === 0).map((point) => point[1]);
    }
    return Array.from({
        length: 7
    }, (_, i) => 1 + Math.sin(i * 1.4) * .012);
};
