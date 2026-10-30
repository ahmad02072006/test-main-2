import {
    getRate,
    getHistorical
} from './api.js';
const $ = (id) => document.getElementById(id);
const state = {
    rate: 0
};
const saved = JSON.parse(localStorage.getItem('rate-prefs') || '{}');
if (saved.from) $('from').value = saved.from;
if (saved.to) $('to').value = saved.to;

function drawChart(values) {
    if (!window.Chart) return;
    if (window.rateChart) window.rateChart.destroy();
    window.rateChart = new Chart($('rate-chart'), {
        type: 'line',
        data: {
            labels: values.map((_, i) => `Day ${i + 1}`),
            datasets: [{
                data: values,
                borderColor: '#ee735d',
                backgroundColor: 'rgba(238,115,93,.12)',
                fill: true,
                tension: .4,
                pointRadius: 0,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    grid: {
                        color: '#e1ddd5'
                    },
                    ticks: {
                        color: '#8c887f'
                    }
                }
            }
        }
    });
}
async function convert() {
        const amount = Number($('amount').value) || 0;
        const from = $('from').value;
        const to = $('to').value;
        $('status').textContent = 'Updating market data...';
        $('result').textContent = '—';
        try {
            state.rate = await getRate(from, to);
            $('result-label').textContent = `${amount.toLocaleString()} ${from} equals`;
            $('result').textContent = `${(amount * state.rate).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${to}`;
            $('rate-note').textContent = `1 ${from} = ${state.rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${to}`;
            $('trend-pair').textContent = `${from} / ${to}`;
            drawChart(await getHistorical(from, to));
            $('status').textContent = 'Rate updated just now';
            localStorage.setItem('rate-prefs', JSON.stringify({
                from,
                to
            }));
        } catch (error) {
            $('status').textContent = error.message;
            $('rate-note').textContent = 'Add an ExchangeRate-API key for fiat rates.';
        }
    }
    ['amount', 'from', 'to'].forEach((id) => $(id).addEventListener('input', convert));
$('swap').addEventListener('click', () => {
    const from = $('from').value;
    $('from').value = $('to').value;
    $('to').value = from;
    convert();
});
convert();
