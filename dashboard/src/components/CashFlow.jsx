import React, { useEffect, useState, useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { useTrends, useSpending, useTransactions } from '../hooks/useData';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Scissors } from 'lucide-react';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement,
    BarElement, Title, Tooltip, Legend, Filler
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
    const trendsData = useTrends() || [];
    const spendingData = useSpending() || [];
    const transactionsData = useTransactions() || [];

    const [barData, setBarData] = useState(null);
    const [savingsBoost, setSavingsBoost] = useState(2000);
    const [showProjection, setShowProjection] = useState(true);
    const [expandedCategory, setExpandedCategory] = useState(null);
    const [heatmapCell, setHeatmapCell] = useState(null); // { category, month }

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
    }, [sorted]);

    // Category spending analysis from transaction data
    const categoryAnalysis = useMemo(() => {
        const expenses = transactionsData.filter(t => !t.isIncome && t.category && t.date);
        if (!expenses.length) return { categories: [], months: [], totalExpenses: 0 };

        // Get all months, sorted, take last 6
        const allMonths = [...new Set(expenses.map(t => t.date.slice(0, 7)))].sort();
        const months = allMonths.slice(-6);
        const monthSet = new Set(months);

        // Group by category
        const catMap = {};
        for (const t of expenses) {
            const m = t.date.slice(0, 7);
            if (!monthSet.has(m)) continue;
            const cat = t.category;
            if (!catMap[cat]) catMap[cat] = { name: cat, nameEn: CATEGORY_TRANSLATIONS[cat] || cat, transactions: [], monthlyTotals: {} };
            catMap[cat].transactions.push(t);
            catMap[cat].monthlyTotals[m] = (catMap[cat].monthlyTotals[m] || 0) + t.amount;
        }

        // Compute stats per category
        const categories = Object.values(catMap).map(cat => {
            const monthlyArr = months.map(m => cat.monthlyTotals[m] || 0);
            const total = monthlyArr.reduce((s, v) => s + v, 0);
            const avg = total / months.length;
            const variance = monthlyArr.reduce((s, v) => s + (v - avg) ** 2, 0) / months.length;
            const stdDev = Math.sqrt(variance);

            // Transaction-level outlier detection
            const txnAmounts = cat.transactions.map(t => t.amount);
            const txnAvg = txnAmounts.reduce((s, v) => s + v, 0) / txnAmounts.length;
            const txnVariance = txnAmounts.reduce((s, v) => s + (v - txnAvg) ** 2, 0) / txnAmounts.length;
            const txnStdDev = Math.sqrt(txnVariance);
            const outlierThreshold = txnAvg + 1.5 * txnStdDev;

            const outliers = cat.transactions
                .filter(t => t.amount > outlierThreshold && t.amount > txnAvg * 2)
                .sort((a, b) => b.amount - a.amount);

            // Monthly outlier detection
            const monthlyOutlierThreshold = avg + 1.5 * stdDev;
            const outlierMonths = new Set(months.filter(m => (cat.monthlyTotals[m] || 0) > monthlyOutlierThreshold));

            // Trend: compare last 2 months avg to overall avg
            const recent = monthlyArr.slice(-2);
            const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
            const trend = recentAvg > avg * 1.15 ? 'up' : recentAvg < avg * 0.85 ? 'down' : 'stable';

            // Savings potential: if outlier transactions were at avg, how much saved per month
            const outlierExcess = outliers.reduce((s, t) => s + (t.amount - txnAvg), 0);
            const savingsPotential = months.length > 0 ? outlierExcess / months.length : 0;

            return {
                ...cat, total, avg, stdDev, monthlyArr, outliers, outlierMonths,
                trend, savingsPotential, txnAvg, outlierThreshold, txnCount: cat.transactions.length,
            };
        });

        categories.sort((a, b) => b.total - a.total);
        const totalExpenses = categories.reduce((s, c) => s + c.total, 0);
        return { categories: categories.slice(0, 10), months, totalExpenses };
    }, [transactionsData]);

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

            {/* Section A: Sparkline Table + Outliers */}
            {categoryAnalysis.categories.length > 0 && (
            <div className="glass-panel" style={{ padding: '24px' }}>
                <div className="flex-between" style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontWeight: 600 }}>Category Spend Analysis</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {categoryAnalysis.months.length} months | Total: {formatCurrency(categoryAnalysis.totalExpenses)}
                    </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                                <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Category</th>
                                <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600, width: '120px' }}>Trend</th>
                                <th style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>Total</th>
                                <th style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>Avg/mo</th>
                                <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600, width: '40px' }}></th>
                                <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>Outliers</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categoryAnalysis.categories.map(cat => {
                                const isExpanded = expandedCategory === cat.name;
                                const TrendIcon = cat.trend === 'up' ? TrendingUp : cat.trend === 'down' ? TrendingDown : Minus;
                                const trendColor = cat.trend === 'up' ? 'var(--accent-danger)' : cat.trend === 'down' ? 'var(--accent-success)' : 'var(--text-muted)';
                                // Sparkline SVG
                                const sparkMax = Math.max(...cat.monthlyArr, 1);
                                const sparkW = 100, sparkH = 24;
                                const sparkPoints = cat.monthlyArr.map((v, i) => `${(i / Math.max(cat.monthlyArr.length - 1, 1)) * sparkW},${sparkH - (v / sparkMax) * sparkH}`).join(' ');
                                return (
                                    <React.Fragment key={cat.name}>
                                    <tr
                                        onClick={() => setExpandedCategory(isExpanded ? null : cat.name)}
                                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                                        className="hover-row"
                                    >
                                        <td style={{ padding: '10px 8px', fontWeight: 600 }}>{cat.nameEn}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                            <svg width={sparkW} height={sparkH} style={{ verticalAlign: 'middle' }}>
                                                <polyline points={sparkPoints} fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" />
                                            </svg>
                                        </td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(cat.total)}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(cat.avg)}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                            <TrendIcon size={14} color={trendColor} />
                                        </td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                            {cat.outliers.length > 0 ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(255,0,85,0.08)', border: '1px solid rgba(255,0,85,0.2)', color: 'var(--accent-danger)', fontSize: '11px', fontWeight: 600 }}>
                                                    <AlertTriangle size={10} /> {cat.outliers.length}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && cat.outliers.length > 0 && (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '0 8px 12px 24px', background: 'rgba(255,255,255,0.01)' }}>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', marginTop: '8px' }}>
                                                    Outlier transactions (above {formatCurrency(cat.outlierThreshold)} threshold):
                                                </div>
                                                {cat.outliers.slice(0, 5).map((t, i) => (
                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '11px' }}>
                                                        <span style={{ color: 'var(--text-secondary)' }}>
                                                            <AlertTriangle size={10} color="var(--accent-danger)" style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                                            {t.date} — {t.businessName}
                                                        </span>
                                                        <span>
                                                            <strong style={{ color: 'var(--accent-danger)' }}>{formatCurrency(t.amount)}</strong>
                                                            <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>(avg: {formatCurrency(cat.txnAvg)})</span>
                                                        </span>
                                                    </div>
                                                ))}
                                            </td>
                                        </tr>
                                    )}
                                    {isExpanded && cat.outliers.length === 0 && (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '8px 8px 12px 24px', fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)' }}>
                                                No outlier transactions detected. Spending is consistent.
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {/* Section C: Heatmap Grid */}
            {categoryAnalysis.categories.length > 0 && (
            <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '16px', fontWeight: 600 }}>Spending Heatmap</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                            <tr style={{ color: 'var(--text-muted)' }}>
                                <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>Category</th>
                                {categoryAnalysis.months.map(m => (
                                    <th key={m} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600 }}>{monthLabel(m)}</th>
                                ))}
                                <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categoryAnalysis.categories.map(cat => {
                                const maxVal = Math.max(...cat.monthlyArr, 1);
                                return (
                                    <React.Fragment key={cat.name}>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '6px 8px', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' }}>{cat.nameEn}</td>
                                        {categoryAnalysis.months.map((m, i) => {
                                            const val = cat.monthlyArr[i];
                                            const intensity = val / maxVal;
                                            const isOutlier = cat.outlierMonths.has(m);
                                            const isSelected = heatmapCell?.category === cat.name && heatmapCell?.month === m;
                                            return (
                                                <td key={m} style={{ padding: '4px' }}>
                                                    <div
                                                        onClick={() => setHeatmapCell(isSelected ? null : { category: cat.name, month: m })}
                                                        style={{
                                                            padding: '8px 6px', borderRadius: '6px', textAlign: 'center', cursor: 'pointer',
                                                            fontSize: '10px', fontWeight: 600, position: 'relative',
                                                            background: val > 0
                                                                ? `rgba(139, 92, 246, ${0.08 + intensity * 0.4})`
                                                                : 'rgba(255,255,255,0.02)',
                                                            border: isOutlier
                                                                ? '2px solid var(--accent-danger)'
                                                                : isSelected
                                                                    ? '2px solid var(--accent-primary)'
                                                                    : '1px solid transparent',
                                                            color: val > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                                                            transition: 'all 0.15s',
                                                        }}
                                                    >
                                                        {val > 0 ? formatCurrency(val) : '—'}
                                                        {isOutlier && <AlertTriangle size={8} color="var(--accent-danger)" style={{ position: 'absolute', top: 2, right: 2 }} />}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>{formatCurrency(cat.total)}</td>
                                    </tr>
                                    {heatmapCell?.category === cat.name && (() => {
                                        const cellTxns = cat.transactions
                                            .filter(t => t.date?.startsWith(heatmapCell.month))
                                            .sort((a, b) => b.amount - a.amount);
                                        return cellTxns.length > 0 ? (
                                            <tr>
                                                <td colSpan={categoryAnalysis.months.length + 2} style={{ padding: '6px 8px 12px 24px', background: 'rgba(255,255,255,0.01)' }}>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                                        {cat.nameEn} — {monthLabel(heatmapCell.month)} ({cellTxns.length} transactions)
                                                    </div>
                                                    {cellTxns.slice(0, 8).map((t, i) => (
                                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '11px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                            <span style={{ color: 'var(--text-secondary)' }}>{t.date} — {t.businessName}</span>
                                                            <span style={{ fontWeight: 600, color: t.amount > cat.outlierThreshold ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
                                                                {formatCurrency(t.amount)}
                                                                {t.amount > cat.outlierThreshold && <AlertTriangle size={9} style={{ marginLeft: '3px', verticalAlign: 'middle' }} color="var(--accent-danger)" />}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </td>
                                            </tr>
                                        ) : null;
                                    })()}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--text-muted)' }}>
                    <AlertTriangle size={9} style={{ verticalAlign: 'middle', marginRight: '3px' }} color="var(--accent-danger)" />
                    = outlier month (&gt;1.5× category standard deviation above average). Click any cell for details.
                </div>
            </div>
            )}

            {/* Section D: Category Cards with Savings Potential */}
            {(() => {
                const withSavings = categoryAnalysis.categories.filter(c => c.savingsPotential > 0).sort((a, b) => b.savingsPotential - a.savingsPotential);
                const totalPotential = withSavings.reduce((s, c) => s + c.savingsPotential, 0);
                if (!withSavings.length) return null;
                return (
                    <div className="glass-panel" style={{ padding: '24px' }}>
                        <div className="flex-between" style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Scissors size={16} color="var(--accent-success)" />
                                <h3 style={{ fontWeight: 600 }}>Savings Potential</h3>
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-success)' }}>
                                ~{formatCurrency(totalPotential)}/mo across {withSavings.length} categories
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                            {withSavings.slice(0, 6).map(cat => {
                                const sparkMax = Math.max(...cat.monthlyArr, 1);
                                const sparkW = 80, sparkH = 28;
                                const sparkPoints = cat.monthlyArr.map((v, i) => `${(i / Math.max(cat.monthlyArr.length - 1, 1)) * sparkW},${sparkH - (v / sparkMax) * sparkH}`).join(' ');
                                const topOutlier = cat.outliers[0];
                                return (
                                    <div key={cat.name} style={{
                                        padding: '16px', borderRadius: '10px',
                                        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)',
                                    }}>
                                        <div className="flex-between" style={{ marginBottom: '10px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 700 }}>{cat.nameEn}</span>
                                            <svg width={sparkW} height={sparkH}>
                                                <polyline points={sparkPoints} fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" />
                                            </svg>
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                            <span>Total: <strong>{formatCurrency(cat.total)}</strong></span>
                                            <span>Avg: <strong>{formatCurrency(cat.avg)}</strong>/mo</span>
                                        </div>
                                        {topOutlier && (
                                            <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,0,85,0.05)', border: '1px solid rgba(255,0,85,0.12)', fontSize: '11px', marginBottom: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-danger)', fontWeight: 600, marginBottom: '3px' }}>
                                                    <AlertTriangle size={10} /> Top spike
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)' }}>
                                                    {topOutlier.businessName} — <strong>{formatCurrency(topOutlier.amount)}</strong>
                                                    <span style={{ color: 'var(--text-muted)' }}> (avg txn: {formatCurrency(cat.txnAvg)})</span>
                                                </div>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                            <Scissors size={12} color="var(--accent-success)" />
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-success)' }}>
                                                Save ~{formatCurrency(cat.savingsPotential)}/mo
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
