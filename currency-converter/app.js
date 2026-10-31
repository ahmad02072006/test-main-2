import { getFiatRates, getHistorical, getRate, isCrypto } from './api.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'rate-prefs';
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'KRW', 'UZS', 'BTC', 'ETH', 'SOL'];
const state = {
    rate: 0,
    updatedAt: null,
    requestId: 0,
    comparisonId: 0,
    favorites: ['EUR', 'GBP', 'JPY']
};

function readPreferences() {
    try {
        const preferences = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return preferences && typeof preferences === 'object' && !Array.isArray(preferences)
            ? preferences
            : {};
    } catch (error) {
        console.warn('Could not read saved currency preferences.', error);
        return {};
    }
}

function savePreferences() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            from: $('from').value,
            to: $('to').value,
            favorites: state.favorites
        }));
    } catch (error) {
        console.warn('Could not save currency preferences.', error);
        $('status').textContent = 'Your preferences could not be saved in this browser; changes may be lost after refresh.';
    }
}

const saved = readPreferences();
if (saved.from && CURRENCIES.includes(saved.from)) $('from').value = saved.from;
if (saved.to && CURRENCIES.includes(saved.to)) $('to').value = saved.to;
if (Array.isArray(saved.favorites)) {
    state.favorites = saved.favorites.filter((currency) => CURRENCIES.includes(currency));
}

function drawChart({ labels, values }) {
    if (!window.Chart) throw new Error('The chart library did not load. Check your connection and reload.');
    if (window.rateChart) window.rateChart.destroy();
    window.rateChart = new Chart($('rate-chart'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: values,
                borderColor: '#b24936',
                backgroundColor: 'rgba(238,115,93,.12)',
                fill: true,
                tension: .35,
                pointRadius: 2,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#625e56', maxTicksLimit: 7 } },
                y: { grid: { color: '#e1ddd5' }, ticks: { color: '#625e56' } }
            }
        }
    });
}

function formatAmount(value, currency) {
    if (isCrypto(currency)) {
        return `${value.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${currency}`;
    }
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2
    }).format(value);
}

function formatUpdatedAt(value) {
    if (!value) return 'Same currency; no rate lookup needed.';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? `Provider update: ${value}` :
        `Provider update: ${date.toLocaleString()}`;
}

function renderFavoriteOptions() {
    $('favorite-options').innerHTML = CURRENCIES.map((currency) => `
        <label class="favorite-option">
            <input type="checkbox" value="${currency}" ${state.favorites.includes(currency) ? 'checked' : ''}/>
            <span>${currency}</span>
        </label>`).join('');
}

async function updateChart(from, to, requestId) {
    const chartWrap = document.querySelector('.chart-wrap');
    chartWrap.setAttribute('aria-busy', 'true');
    try {
        const history = await getHistorical(from, to);
        if (requestId !== state.requestId) return;
        if (!history.values.length) throw new Error('Historical rates are unavailable for this pair.');
        drawChart(history);
        $('history-source').textContent = `Historical rates: ${history.provider}. Reference rates may not include weekends.`;
        chartWrap.setAttribute('aria-busy', 'false');
    } catch (error) {
        if (requestId !== state.requestId) return;
        const message = error instanceof Error ? error.message : 'Historical rates are unavailable.';
        $('history-source').textContent = message;
        chartWrap.setAttribute('aria-busy', 'false');
    }
}

async function updateComparison() {
    const requestId = ++state.comparisonId;
    const amount = Number($('comparison-amount').value);
    const base = $('from').value;
    $('comparison-base').textContent = base;
    if (!Number.isFinite(amount) || amount < 0) {
        $('comparison-results').textContent = 'Enter an amount of zero or more.';
        return;
    }
    const targets = state.favorites.filter((currency) => currency !== base);
    if (!targets.length) {
        $('comparison-results').textContent = 'Choose one or more currencies other than the base currency.';
        return;
    }
    $('comparison-results').textContent = 'Comparing current provider rates...';
    try {
        const comparisons = await Promise.all(targets.map(async (currency) => {
            const { rate } = await getRate(base, currency);
            return `${formatAmount(amount * rate, currency)} (${currency})`;
        }));
        if (requestId !== state.comparisonId || base !== $('from').value || amount !== Number($('comparison-amount').value)) return;
        $('comparison-results').textContent = comparisons.join(' · ');
    } catch (error) {
        if (requestId !== state.comparisonId) return;
        $('comparison-results').textContent = error instanceof Error ? error.message : 'Could not compare currencies.';
    }
}

async function updateBudget() {
    const daily = Number($('daily-budget').value);
    const days = Number($('trip-days').value);
    const currency = $('budget-currency').value;
    if (!Number.isFinite(daily) || daily < 0 || !Number.isInteger(days) || days < 1 || !currency) {
        $('budget-total').textContent = 'Enter a non-negative daily budget and a trip length of at least one day.';
        return;
    }
    $('budget-total').textContent = `${formatAmount(daily * days, currency)} estimated total (${formatAmount(daily, currency)} × ${days} days). Flights and accommodation are not included.`;
}

async function convert() {
    const requestId = ++state.requestId;
    state.comparisonId++;
    const amount = Number($('amount').value);
    const from = $('from').value;
    const to = $('to').value;
    $('status').textContent = 'Getting the latest provider rate...';
    $('result').textContent = '—';
    $('rate-updated').textContent = '';
    document.querySelector('.chart-wrap').setAttribute('aria-busy', 'true');
    if (!Number.isFinite(amount) || amount < 0 || !from || !to) {
        $('status').textContent = 'Enter an amount of zero or more.';
        document.querySelector('.chart-wrap').setAttribute('aria-busy', 'false');
        $('history-source').textContent = 'Enter a valid amount to load rate history.';
        return;
    }
    try {
        const quote = await getRate(from, to);
        if (requestId !== state.requestId) return;
        state.rate = quote.rate;
        state.updatedAt = quote.updatedAt;
        $('result-label').textContent = `${amount.toLocaleString()} ${from} equals`;
        $('result').textContent = formatAmount(amount * quote.rate, to);
        $('rate-note').textContent = `1 ${from} = ${quote.rate.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${to}`;
        $('rate-updated').textContent = `${formatUpdatedAt(quote.updatedAt)} · ${quote.provider}`;
        $('trend-pair').textContent = `${from} / ${to}`;
        $('status').textContent = 'Rate loaded successfully.';
        savePreferences();
        await Promise.all([updateChart(from, to, requestId), updateComparison()]);
    } catch (error) {
        if (requestId !== state.requestId) return;
        $('result').textContent = '—';
        $('status').textContent = error instanceof Error ? error.message : 'The rate could not be loaded.';
        $('rate-updated').textContent = 'Please retry in a moment. Rates are indicative and may differ from provider fees.';
        document.querySelector('.chart-wrap').setAttribute('aria-busy', 'false');
        $('comparison-results').textContent = 'Comparison is unavailable until rates can be loaded.';
        await updateChart(from, to, requestId);
    }
}

function initializeCurrencyOptions() {
    for (const id of ['from', 'to', 'budget-currency']) {
        const select = $(id);
        const initial = select.value;
        CURRENCIES.forEach((currency) => {
            if ([...select.options].some((option) => option.value === currency)) return;
            const option = document.createElement('option');
            option.value = currency;
            option.textContent = currency;
            select.append(option);
        });
        if (initial) select.value = initial;
    }
    $('budget-currency').value = $('to').value;
    renderFavoriteOptions();
}

['amount', 'from', 'to'].forEach((id) => {
    $(id).addEventListener(id === 'amount' ? 'input' : 'change', convert);
});

$('swap').addEventListener('click', () => {
    const from = $('from').value;
    $('from').value = $('to').value;
    $('to').value = from;
    convert();
});

$('favorite-options').addEventListener('change', (event) => {
    if (event.target.type !== 'checkbox') return;
    state.favorites = [...$('favorite-options').querySelectorAll('input:checked')].map((input) => input.value);
    savePreferences();
    updateComparison();
});

$('comparison-amount').addEventListener('input', updateComparison);
['daily-budget', 'trip-days', 'budget-currency'].forEach((id) => {
    $(id).addEventListener(id === 'budget-currency' ? 'change' : 'input', updateBudget);
});

initializeCurrencyOptions();
updateBudget();
convert();
