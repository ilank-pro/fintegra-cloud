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
import { useSpending, useTransactions, useSpendingGoals } from '../hooks/useData';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getBudgetMonth } from '../utils/budgetMonth';
import { Target, XCircle } from 'lucide-react';
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
    'עמלות': 'Fees', 'ארנונה': 'Property Tax', 'דיור': 'Housing',
};

const resolveCategory = (t) => t.expense || t.category;

const formatCurrency = (val) => {
    if (!val) return '₪0';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(val).replace('ILS', '₪');
};

const CHART_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
    '#8b5cf6', '#a855f7',
];

export default function SpendingBreakdown({ selectedMonths, onCategoryClick }) {
    const _spendingData = useSpending();
    const _transactionsData = useTransactions();
    const spendingData = _spendingData || [];
    const transactionsData = _transactionsData || [];
    const spendingGoals = useSpendingGoals() || [];
    const setGoalMutation = useMutation(api.mutations.setSpendingGoal);
    const removeGoalMutation = useMutation(api.mutations.removeSpendingGoal);
    const [goalInput, setGoalInput] = useState({});
    const goalMap = useMemo(() => Object.fromEntries(spendingGoals.map(g => [g.category, g])), [spendingGoals]);

    const { categories, total } = useMemo(() => {
        // Check if we have transaction data for the selected months
        const allTxns = Array.isArray(transactionsData) ? transactionsData : [];
        const txnBudgetMonths = new Set(allTxns.map(t => getBudgetMonth(t)).filter(Boolean));
        const selectedArr = selectedMonths ? [...selectedMonths] : [];
        const hasAllTxnData = selectedArr.length > 0 && selectedArr.every(m => txnBudgetMonths.has(m));

        if (hasAllTxnData && selectedArr.length > 0) {
            // Recompute from transactions for selected months
            const filtered = allTxns.filter(t => {
                const m = getBudgetMonth(t);
                return m && selectedMonths.has(m) && !t.isIncome;
            });
            // Build merchant → expense map from transactions with envelope data
            const merchantExpenseMap = {};
            for (const t of filtered) {
                if (t.expense && t.businessName) merchantExpenseMap[t.businessName] = t.expense;
            }
            const resolveWithMap = (t) => t.expense || merchantExpenseMap[t.businessName] || t.category;

            const catMap = {};
            for (const t of filtered) {
                const cat = resolveWithMap(t) || 'Other';
                if (!catMap[cat]) catMap[cat] = { name: cat, total: 0, count: 0, fixedCount: 0, recurringCount: 0, installmentCount: 0, dominantFreq: null };
                catMap[cat].total += t.amount || 0;
                catMap[cat].count += 1;
                if (t.placement === 'fixed') catMap[cat].fixedCount += 1;
                if (t.monthsInterval) { catMap[cat].recurringCount += 1; catMap[cat].dominantFreq = t.monthsInterval; }
                if (t.isInstallment) catMap[cat].installmentCount += 1;
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

    const numMonths = selectedMonths && selectedMonths.size > 0 ? selectedMonths.size : 1;
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
                        const en = CATEGORY_TRANSLATIONS[cat.name] || cat.name;
                        const goal = goalMap[cat.name];
                        const monthlyAvg = cat.total / numMonths;
                        const goalPct = goal ? (monthlyAvg / goal.monthlyTarget) * 100 : 0;
                        const goalColor = goal
                            ? goalPct <= 90 ? 'var(--accent-success)' : goalPct <= 100 ? 'var(--accent-warning)' : 'var(--accent-danger)'
                            : 'var(--text-muted)';

                        return (
                            <div key={cat.name} className="category-card" style={{ cursor: onCategoryClick ? 'pointer' : 'default' }}>
                                <div onClick={() => onCategoryClick?.(cat.name)}>
                                    <div className="flex-between" style={{ marginBottom: '8px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {en}
                                        </span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {cat.name}
                                        </span>
                                    </div>
                                    <div className="flex-between">
                                        <span style={{ fontSize: '16px', fontWeight: 700, color: goal ? goalColor : (i < 5 ? 'var(--accent-danger)' : i < 10 ? 'var(--accent-warning)' : 'var(--text-muted)') }}>
                                            {formatCurrency(cat.total)}
                                        </span>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {cat.count} txns · {pct}%
                                        </span>
                                    </div>
                                    {/* Rich metadata badges */}
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                                        {cat.fixedCount > 0 && cat.fixedCount >= cat.count * 0.5 && (
                                            <span style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: 'rgba(139,92,246,0.12)', color: 'var(--accent-purple)' }}>Fixed</span>
                                        )}
                                        {cat.fixedCount > 0 && cat.fixedCount < cat.count * 0.5 && (
                                            <span style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>Variable</span>
                                        )}
                                        {cat.dominantFreq && (
                                            <span style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: 'rgba(59,130,246,0.12)', color: 'var(--accent-primary)' }}>
                                                {cat.dominantFreq === 1 ? 'Monthly' : cat.dominantFreq === 2 ? 'Bi-monthly' : `Every ${cat.dominantFreq}mo`}
                                            </span>
                                        )}
                                        {cat.installmentCount > 0 && (
                                            <span style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: 'rgba(245,158,11,0.12)', color: 'var(--accent-warning)' }}>
                                                {cat.installmentCount} installment{cat.installmentCount > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Goal progress or set goal */}
                                {goal ? (
                                    <div style={{ marginTop: '10px' }}>
                                        <div className="flex-between" style={{ marginBottom: '4px' }}>
                                            <span style={{ fontSize: '10px', color: goalColor, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <Target size={10} />
                                                {formatCurrency(monthlyAvg)}/mo of {formatCurrency(goal.monthlyTarget)} goal
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: goalColor }}>{Math.round(goalPct)}%</span>
                                                <button onClick={(e) => { e.stopPropagation(); removeGoalMutation({ id: goal._id }); }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-muted)' }} title="Remove goal">
                                                    <XCircle size={10} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="progress-bar-track">
                                            <div className="progress-bar-fill" style={{ width: `${Math.min(goalPct, 100)}%`, background: goalColor, opacity: 0.8 }} />
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ marginTop: '10px' }}>
                                        <div className="progress-bar-track" style={{ marginBottom: '6px' }}>
                                            <div className="progress-bar-fill" style={{ width: `${pct}%`, background: i < 5 ? 'var(--accent-danger)' : i < 10 ? 'var(--accent-warning)' : 'var(--text-muted)', opacity: 0.7 }} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={e => e.stopPropagation()}>
                                            <Target size={10} color="var(--text-muted)" />
                                            <input type="number" placeholder={`${Math.round(monthlyAvg)}`}
                                                value={goalInput[cat.name] || ''}
                                                onChange={e => setGoalInput(p => ({ ...p, [cat.name]: e.target.value }))}
                                                onKeyDown={e => { if (e.key === 'Enter' && goalInput[cat.name]) { setGoalMutation({ category: cat.name, monthlyTarget: Number(goalInput[cat.name]) }); setGoalInput(p => ({ ...p, [cat.name]: '' })); } }}
                                                style={{ width: '65px', padding: '2px 5px', borderRadius: '4px', fontSize: '10px', border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
                                            />
                                            <button onClick={() => { if (goalInput[cat.name]) { setGoalMutation({ category: cat.name, monthlyTarget: Number(goalInput[cat.name]) }); setGoalInput(p => ({ ...p, [cat.name]: '' })); } }}
                                                disabled={!goalInput[cat.name]}
                                                style={{ fontSize: '10px', background: 'none', border: 'none', cursor: goalInput[cat.name] ? 'pointer' : 'default', color: goalInput[cat.name] ? 'var(--accent-purple)' : 'var(--text-muted)', fontFamily: 'inherit', fontWeight: 600 }}>
                                                Set goal
                                            </button>
                                        </div>
                                    </div>
                                )}
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
