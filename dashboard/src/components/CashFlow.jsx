import { useEffect, useState, useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import trendsData from '../data/trends.json';
import spendingData from '../data/spending.json';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement,
    BarElement, ArcElement, Title, Tooltip, Legend, Filler
);

const formatCurrency = (val) => {
    if (!val && val !== 0) return '₪0';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(val).replace('ILS', '₪');
};

const CATEGORY_TRANSLATIONS = {
    'מזומן': 'Cash', 'העברות': 'Transfers', 'תשלומים': 'Payments',
    'כלכלה': 'Groceries', 'משכנתא': 'Mortgage', 'אוכל בחוץ': 'Dining Out',
    'ביטוח': 'Insurance', 'תרומה': 'Donations', 'השקעה וחיסכון': 'Investments',
    'קניות': 'Shopping', 'כללי': 'General', 'רכב': 'Car',
    'דיגיטל': 'Digital', 'חשמל': 'Electricity', 'תקשורת': 'Telecom',
    'פארמה': 'Pharmacy', 'תחבורה ציבורית': 'Public Transport', 'שיק': 'Check',
    'חינוך': 'Education', 'תיירות': 'Travel', 'בריאות': 'Health',
    'ביגוד והנעלה': 'Clothing', 'פנאי': 'Leisure', 'עמלות': 'Fees',
};

const DONUT_COLORS = [
    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
    '#ef4444', '#14b8a6', '#f97316', '#ec4899',
];

const tooltipDefaults = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    titleColor: '#fff',
    bodyColor: '#cbd5e1',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    padding: 12,
};

function monthLabel(m) {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function addMonths(monthStr, n) {
    const [y, mo] = monthStr.split('-').map(Number);
    const d = new Date(y, mo - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function breakEvenMonths(lastCumulative, avgNet, savingsBoost) {
    if (lastCumulative >= 0) return 0;
    const effectiveGain = avgNet + savingsBoost;
    if (effectiveGain <= 0) return null;
    return Math.ceil(-lastCumulative / effectiveGain);
}

export default function CashFlow({ selectedMonths }) {
    const [barData, setBarData] = useState(null);
    const [donutData, setDonutData] = useState(null);
    const [savingsBoost, setSavingsBoost] = useState(2000);
    const [showProjection, setShowProjection] = useState(true);

    const sorted = useMemo(() => {
        if (!Array.isArray(trendsData)) return [];
        const all = [...trendsData].sort((a, b) => a.month.localeCompare(b.month));
        if (!selectedMonths || selectedMonths.size === 0) return all;
        return all.filter(d => selectedMonths.has(d.month));
    }, [selectedMonths]);

    useEffect(() => {
        try {
            if (sorted.length > 0) {
                const s = sorted;

                setBarData({
                    labels: s.map(d => monthLabel(d.month)),
                    datasets: [
                        {
                            label: 'Income',
                            data: s.map(d => d.income || 0),
                            backgroundColor: 'rgba(16, 185, 129, 0.5)',
                            borderColor: '#10b981',
                            borderWidth: 1,
                            borderRadius: 4,
                        },
                        {
                            label: 'Expenses',
                            data: s.map(d => d.expenses || 0),
                            backgroundColor: 'rgba(239, 68, 68, 0.6)',
                            borderColor: '#ef4444',
                            borderWidth: 1,
                            borderRadius: 4,
                        },
                    ],
                });
            }
        } catch (e) { console.error(e); }

        try {
            if (Array.isArray(spendingData)) {
                const top8 = [...spendingData].sort((a, b) => b.total - a.total).slice(0, 8);
                setDonutData({
                    labels: top8.map(c => CATEGORY_TRANSLATIONS[c.name] || c.name),
                    datasets: [{
                        data: top8.map(c => c.total),
                        backgroundColor: DONUT_COLORS.map(c => c + 'cc'),
                        borderColor: DONUT_COLORS,
                        borderWidth: 1,
                        hoverOffset: 8,
                    }],
                });
            }
        } catch (e) { console.error(e); }
    }, [sorted]);

    // Cumulative chart derived from sorted + slider
    const cumulativeChartData = (() => {
        if (!sorted.length) return null;

        const historicalLabels = sorted.map(d => monthLabel(d.month));
        const cumulativeValues = [];
        let running = 0;
        for (const d of sorted) {
            running += d.net || 0;
            cumulativeValues.push(running);
        }

        const lastCumulative = cumulativeValues[cumulativeValues.length - 1];
        const avgNet = sorted.reduce((sum, d) => sum + (d.net || 0), 0) / sorted.length;
        const lastMonth = sorted[sorted.length - 1].month;

        const projLabels = [1, 2, 3].map(n => monthLabel(addMonths(lastMonth, n)));
        let baseRunning = lastCumulative;
        let scenarioRunning = lastCumulative;
        const baselineProj = [];
        const scenarioProj = [];
        for (let i = 1; i <= 3; i++) {
            baseRunning += avgNet;
            scenarioRunning += avgNet + savingsBoost;
            baselineProj.push(baseRunning);
            scenarioProj.push(scenarioRunning);
        }

        const allLabels = [...historicalLabels, ...projLabels];
        const historicalFull = [...cumulativeValues, null, null, null];
        const baselineFull = [...Array(sorted.length - 1).fill(null), lastCumulative, ...baselineProj];
        const scenarioFull = [...Array(sorted.length - 1).fill(null), lastCumulative, ...scenarioProj];

        const datasets = [{
            label: 'Cumulative Cash Flow',
            data: historicalFull,
            borderColor: '#00F0FF', // Cyber theme color
            backgroundColor: (ctx) => {
                const chart = ctx.chart;
                const { ctx: canvasCtx, chartArea } = chart;
                if (!chartArea) return 'rgba(0, 240, 255, 0.1)'; // Cyber theme color
                const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, 'rgba(0, 240, 255, 0.25)'); // Cyber theme color
                gradient.addColorStop(1, 'rgba(0, 240, 255, 0.01)'); // Cyber theme color
                return gradient;
            },
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointHoverRadius: 7,
            borderWidth: 2,
            spanGaps: false,
            shadowOffsetX: 0, // Glowing effect
            shadowOffsetY: 0,
            shadowBlur: 10,
            shadowColor: 'rgba(0, 240, 255, 0.7)',
        }];

        if (showProjection) {
            datasets.push({
                label: 'No Change Trajectory',
                data: baselineFull,
                borderColor: 'rgba(148,163,184,0.5)',
                backgroundColor: 'transparent',
                borderDash: [5, 4],
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 5,
                borderWidth: 1.5,
                spanGaps: false,
            });
            datasets.push({
                label: `+${formatCurrency(savingsBoost)}/mo Scenario`,
                data: scenarioFull,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.07)',
                fill: true,
                borderDash: [6, 3],
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 5,
                borderWidth: 2,
                spanGaps: false,
            });
        }

        return { labels: allLabels, datasets, lastCumulative, avgNet };
    })();

    const be = cumulativeChartData
        ? breakEvenMonths(cumulativeChartData.lastCumulative, cumulativeChartData.avgNet, savingsBoost)
        : null;

    const barOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'top', labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } } },
            tooltip: { ...tooltipDefaults, callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } },
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', callback: (v) => '₪' + v.toLocaleString() } },
        },
    };

    const cumulativeOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'top', labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } } },
            tooltip: {
                ...tooltipDefaults,
                callbacks: {
                    label: (ctx) => {
                        if (ctx.raw === null || ctx.raw === undefined) return null;
                        const val = ctx.raw;
                        return ` ${ctx.dataset.label}: ${val >= 0 ? '+' : ''}${formatCurrency(val)}`;
                    },
                },
            },
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b', callback: (v) => (v >= 0 ? '+' : '') + '₪' + Math.abs(v).toLocaleString() },
            },
        },
    };

    const donutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 }, padding: 12 },
            },
            tooltip: {
                ...tooltipDefaults,
                callbacks: {
                    label: (ctx) => {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = ((ctx.raw / total) * 100).toFixed(1);
                        return ` ${formatCurrency(ctx.raw)}  (${pct}%)`;
                    },
                },
            },
        },
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Cumulative Cash Flow + What-If Scenario */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <div className="flex-between" style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontWeight: 600 }}>Cumulative Cash Flow</h3>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={showProjection}
                            onChange={e => setShowProjection(e.target.checked)}
                            style={{ accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                        />
                        Show projection
                    </label>
                </div>

                {showProjection && (
                    <div className="scenario-panel" style={{ marginBottom: '20px' }}>
                        <div className="flex-between" style={{ marginBottom: '10px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600 }}>
                                What if I save{' '}
                                <span style={{ color: 'var(--accent-success)' }}>{formatCurrency(savingsBoost)}</span>
                                /month extra?
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>₪500 — ₪10,000</span>
                        </div>
                        <input
                            type="range"
                            min={500}
                            max={10000}
                            step={500}
                            value={savingsBoost}
                            onChange={e => setSavingsBoost(Number(e.target.value))}
                            className="scenario-slider"
                        />
                        <div style={{ marginTop: '10px', fontSize: '14px' }}>
                            {be === 0 ? (
                                <span style={{ color: 'var(--accent-success)' }}>You already have a positive cumulative balance.</span>
                            ) : be === null ? (
                                <span style={{ color: 'var(--accent-danger)' }}>
                                    At <strong>{formatCurrency(savingsBoost)}/mo</strong> extra, the deficit keeps growing — try a higher target.
                                </span>
                            ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>
                                    At <strong style={{ color: 'var(--accent-success)' }}>{formatCurrency(savingsBoost)}/mo</strong> extra savings,
                                    you break even in{' '}
                                    <strong style={{ color: 'var(--accent-primary)' }}>{be} month{be !== 1 ? 's' : ''}</strong>.
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {cumulativeChartData ? (
                    <div style={{ height: '300px' }}>
                        <Line data={cumulativeChartData} options={cumulativeOptions} />
                    </div>
                ) : (
                    <div className="flex-center text-muted" style={{ height: '300px' }}>No trend data available.</div>
                )}
            </div>

            {/* Income vs Expenses Bar Chart */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '20px', fontWeight: 600 }}>Income vs Expenses</h3>
                {barData ? (
                    <div style={{ height: '280px' }}>
                        <Bar data={barData} options={barOptions} />
                    </div>
                ) : (
                    <div className="flex-center text-muted" style={{ height: '280px' }}>No trend data available.</div>
                )}
            </div>

            {/* Spending Distribution Donut */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '20px', fontWeight: 600 }}>Spending Distribution (Top 8 Categories)</h3>
                {donutData ? (
                    <div style={{ height: '260px' }}>
                        <Doughnut data={donutData} options={donutOptions} />
                    </div>
                ) : (
                    <div className="flex-center text-muted" style={{ height: '260px' }}>No spending data available.</div>
                )}
            </div>
        </div>
    );
}
