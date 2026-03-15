import { useEffect, useState, useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import spendingData from '../data/spending.json';
import transactionsData from '../data/transactions.json';
import HeatmapCalendar from './HeatmapCalendar';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const CATEGORY_TRANSLATIONS = {
    'מזומן': 'Cash',
    'העברות': 'Transfers',
    'תשלומים': 'Payments',
    'כלכלה': 'Groceries',
    'משכנתא': 'Mortgage',
    'אוכל בחוץ': 'Dining Out',
    'ביטוח': 'Insurance',
    'תרומה': 'Donations',
    'השקעה וחיסכון': 'Investments',
    'קניות': 'Shopping',
    'כללי': 'General',
    'רכב': 'Car',
    'דיגיטל': 'Digital',
    'חשמל': 'Electricity',
    'תקשורת': 'Telecom',
    'פארמה': 'Pharmacy',
    'תחבורה ציבורית': 'Public Transport',
    'שיק': 'Check',
    'חינוך': 'Education',
    'תיירות': 'Travel',
    'בריאות': 'Health',
    'ביגוד והנעלה': 'Clothing',
    'פנאי': 'Leisure',
    'עמלות': 'Fees',
};

const formatCurrency = (val) => {
    if (!val) return '₪0';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(val).replace('ILS', '₪');
};

const CHART_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
    '#8b5cf6', '#a855f7',
];

export default function SpendingBreakdown({ selectedMonths }) {
    const { categories, total } = useMemo(() => {
        // Check if we have transaction data for the selected months
        const allTxns = Array.isArray(transactionsData) ? transactionsData : [];
        const txnMonths = new Set(allTxns.map(t => t.date?.slice(0, 7)).filter(Boolean));
        const selectedArr = selectedMonths ? [...selectedMonths] : [];
        const hasAllTxnData = selectedArr.length > 0 && selectedArr.every(m => txnMonths.has(m));

        if (hasAllTxnData && selectedArr.length > 0) {
            // Recompute from transactions for selected months
            const filtered = allTxns.filter(t => {
                const m = t.date?.slice(0, 7);
                return m && selectedMonths.has(m) && !t.isIncome;
            });
            const catMap = {};
            for (const t of filtered) {
                const cat = t.category || 'Other';
                if (!catMap[cat]) catMap[cat] = { name: cat, total: 0, count: 0 };
                catMap[cat].total += t.amount || 0;
                catMap[cat].count += 1;
            }
            const sorted = Object.values(catMap).sort((a, b) => b.total - a.total);
            const sum = sorted.reduce((acc, c) => acc + c.total, 0);
            return { categories: sorted, total: sum };
        }

        // Fallback to spending.json snapshot
        if (Array.isArray(spendingData)) {
            const sorted = [...spendingData].sort((a, b) => b.total - a.total);
            const sum = sorted.reduce((acc, c) => acc + c.total, 0);
            return { categories: sorted, total: sum };
        }
        return { categories: [], total: 0 };
    }, [selectedMonths]);

    const top12 = categories.slice(0, 12);

    const chartData = {
        labels: top12.map(c => {
            const en = CATEGORY_TRANSLATIONS[c.name] || c.name;
            return `${en} (${c.name})`;
        }),
        datasets: [{
            label: 'Spending',
            data: top12.map(c => c.total),
            backgroundColor: top12.map((_, i) => CHART_COLORS[i % CHART_COLORS.length] + 'cc'),
            borderColor: top12.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
            borderWidth: 1,
            borderRadius: 4,
        }],
    };

    const chartOptions = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#fff',
                bodyColor: '#cbd5e1',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                padding: 12,
                callbacks: {
                    label: (ctx) => {
                        const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                        return ` ${formatCurrency(ctx.raw)}  (${pct}% of total)`;
                    },
                },
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: {
                    color: '#64748b',
                    callback: (v) => '₪' + v.toLocaleString(),
                },
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.03)' },
                ticks: { color: '#94a3b8', font: { size: 12 } },
            },
        },
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Horizontal Bar Chart */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <div className="flex-between" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontWeight: 600 }}>Top Categories by Spend</h3>
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Total: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(total)}</strong>
                    </span>
                </div>
                <div style={{ height: `${top12.length * 42}px`, minHeight: '300px' }}>
                    <Bar data={chartData} options={chartOptions} />
                </div>
            </div>

            {/* Category Cards Grid */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontWeight: 600, marginBottom: '16px' }}>All Categories</h3>
                <div className="category-grid">
                    {categories.map((cat, i) => {
                        const pct = total > 0 ? ((cat.total / total) * 100).toFixed(1) : 0;
                        const accentColor = i < 5
                            ? 'var(--accent-danger)'
                            : i < 10
                                ? 'var(--accent-warning)'
                                : 'var(--text-muted)';
                        const en = CATEGORY_TRANSLATIONS[cat.name] || cat.name;

                        return (
                            <div key={cat.name} className="category-card">
                                <div className="flex-between" style={{ marginBottom: '8px' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {en}
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {cat.name}
                                    </span>
                                </div>
                                <div className="flex-between">
                                    <span style={{ fontSize: '16px', fontWeight: 700, color: accentColor }}>
                                        {formatCurrency(cat.total)}
                                    </span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {cat.count} txns · {pct}%
                                    </span>
                                </div>
                                <div className="progress-bar-track" style={{ marginTop: '10px' }}>
                                    <div
                                        className="progress-bar-fill"
                                        style={{
                                            width: `${pct}%`,
                                            background: accentColor,
                                            opacity: 0.7,
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Heatmap Calendar */}
            <HeatmapCalendar />
        </div>
    );
}
