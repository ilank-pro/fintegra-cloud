import { useEffect, useState } from 'react';
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
    '#ef4444', '#f97316', '#f59e0b', '#22c55e',
    '#3b82f6', '#8b5cf6', '#14b8a6', '#ec4899',
];

const tooltipDefaults = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    titleColor: '#fff',
    bodyColor: '#cbd5e1',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    padding: 12,
};

export default function CashFlow() {
    const [barData, setBarData] = useState(null);
    const [netData, setNetData] = useState(null);
    const [donutData, setDonutData] = useState(null);

    useEffect(() => {
        try {
            if (Array.isArray(trendsData)) {
                const sorted = [...trendsData].sort((a, b) => a.month.localeCompare(b.month));

                setBarData({
                    labels: sorted.map(d => d.month),
                    datasets: [
                        {
                            label: 'Income',
                            data: sorted.map(d => d.income || 0),
                            backgroundColor: 'rgba(16, 185, 129, 0.5)',
                            borderColor: '#10b981',
                            borderWidth: 1,
                            borderRadius: 4,
                        },
                        {
                            label: 'Expenses',
                            data: sorted.map(d => d.expenses || 0),
                            backgroundColor: 'rgba(239, 68, 68, 0.6)',
                            borderColor: '#ef4444',
                            borderWidth: 1,
                            borderRadius: 4,
                        },
                    ],
                });

                setNetData({
                    labels: sorted.map(d => d.month),
                    datasets: [{
                        label: 'Net Cash Flow',
                        data: sorted.map(d => d.net || 0),
                        borderColor: '#3b82f6',
                        backgroundColor: (ctx) => {
                            const chart = ctx.chart;
                            const { ctx: canvasCtx, chartArea } = chart;
                            if (!chartArea) return 'rgba(59, 130, 246, 0.1)';
                            const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
                            gradient.addColorStop(1, 'rgba(59, 130, 246, 0.01)');
                            return gradient;
                        },
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        borderWidth: 2,
                    }],
                });
            }
        } catch (e) {
            console.error(e);
        }

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
        } catch (e) {
            console.error(e);
        }
    }, []);

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

    const netOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                ...tooltipDefaults,
                callbacks: {
                    label: (ctx) => {
                        const val = ctx.raw;
                        return ` Net: ${val >= 0 ? '+' : ''}${formatCurrency(val)}`;
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
            {/* Panel 1: Income vs Expenses Bar Chart */}
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

            {/* Panel 2: Net Cash Flow Line Chart */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '20px', fontWeight: 600 }}>Net Cash Flow Trend</h3>
                {netData ? (
                    <div style={{ height: '220px' }}>
                        <Line data={netData} options={netOptions} />
                    </div>
                ) : (
                    <div className="flex-center text-muted" style={{ height: '220px' }}>No data available.</div>
                )}
            </div>

            {/* Panel 3: Spending Distribution Donut */}
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
