import { useEffect, useState, useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import balanceData from '../data/balance.json';
import trendsData from '../data/trends.json';
import progressData from '../data/progress.json';
import spendingData from '../data/spending.json';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const formatCurrency = (val) => {
    if (!val && val !== 0) return '₪0';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(val).replace('ILS', '₪');
};

function monthLabel(m) {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function addMonthsToStr(monthStr, n) {
    const [y, mo] = monthStr.split('-').map(Number);
    const d = new Date(y, mo - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const tooltipDefaults = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    titleColor: '#fff',
    bodyColor: '#cbd5e1',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    padding: 12,
};

const FIXED_CATEGORIES = new Set(['משכנתא', 'ביטוח', 'העברות', 'תשלומים', 'השקעה וחיסכון', 'שיק', 'עמלות']);
const ACHIEVABILITY = {
    'מזומן': 0.25, 'כלכלה': 0.15, 'אוכל בחוץ': 0.30, 'קניות': 0.25,
    'תרומה': 0.20, 'דיגיטל': 0.20, 'תחבורה ציבורית': 0.15, 'רכב': 0.15,
    'חינוך': 0.10, 'תיירות': 0.30, 'בריאות': 0.10, 'ביגוד והנעלה': 0.25,
    'פנאי': 0.25, 'כללי': 0.20, 'חשמל': 0.10, 'תקשורת': 0.10, 'פארמה': 0.10,
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

// ─── Emergency Fund Runway ──────────────────────────────────────────
function EmergencyFundRunway() {
    const [cutPercent, setCutPercent] = useState(0);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setMounted(true));
    }, []);

    const bankBalance = (balanceData?.balances || []).reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const savingsBalance = (balanceData?.financialSummary?.savingsAccounts || [])
        .reduce((s, a) => s + (Number(a.balanceAmount?.amount) || 0), 0);
    const liquidAssets = bankBalance + savingsBalance;

    const sorted = Array.isArray(trendsData) ? [...trendsData].sort((a, b) => a.month.localeCompare(b.month)) : [];
    const avgExpenses = sorted.length > 0 ? sorted.reduce((s, d) => s + (d.expenses || 0), 0) / sorted.length : 1;

    const adjustedExpenses = avgExpenses * (1 - cutPercent / 100);
    const runway = adjustedExpenses > 0 ? liquidAssets / adjustedExpenses : 0;
    const baseRunway = avgExpenses > 0 ? liquidAssets / avgExpenses : 0;
    const targetMonths = 6;
    const gapToTarget = Math.max(0, (targetMonths * adjustedExpenses) - liquidAssets);

    const gaugeMax = Math.max(targetMonths + 1, runway + 1);
    const fillPct = Math.min(100, (runway / gaugeMax) * 100);
    const zone = runway < 1 ? 'red' : runway < 3 ? 'yellow' : runway < 6 ? 'green' : 'bright-green';
    const zoneColor = zone === 'red' ? 'var(--accent-danger)' : zone === 'yellow' ? 'var(--accent-warning)' : 'var(--accent-success)';
    const targetPct = (targetMonths / gaugeMax) * 100;

    return (
        <div className="glass-panel" style={{ padding: '24px', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.45s ease, transform 0.45s ease' }}>
            <div className="flex-between" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontWeight: 600 }}>Emergency Fund Runway</h3>
                <span style={{
                    padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                    background: zoneColor + '22', color: zoneColor, border: `1px solid ${zoneColor}44`,
                }}>
                    {runway.toFixed(1)} months
                </span>
            </div>

            {/* Gauge */}
            <div style={{ position: 'relative', height: '36px', borderRadius: '18px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-light)', overflow: 'hidden', marginBottom: '8px' }}>
                {/* Zone backgrounds */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: `${(1/gaugeMax)*100}%`, height: '100%', background: 'rgba(239,68,68,0.15)' }} />
                <div style={{ position: 'absolute', top: 0, left: `${(1/gaugeMax)*100}%`, width: `${(2/gaugeMax)*100}%`, height: '100%', background: 'rgba(245,158,11,0.10)' }} />
                <div style={{ position: 'absolute', top: 0, left: `${(3/gaugeMax)*100}%`, width: `${(3/gaugeMax)*100}%`, height: '100%', background: 'rgba(16,185,129,0.08)' }} />
                <div style={{ position: 'absolute', top: 0, left: `${(6/gaugeMax)*100}%`, right: 0, height: '100%', background: 'rgba(16,185,129,0.04)' }} />

                {/* Fill bar */}
                <div style={{
                    position: 'absolute', top: '3px', left: '3px', bottom: '3px',
                    width: `calc(${fillPct}% - 6px)`, borderRadius: '14px',
                    background: `linear-gradient(90deg, ${zoneColor}cc, ${zoneColor}88)`,
                    transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)',
                    boxShadow: `0 0 12px ${zoneColor}44`,
                }} />

                {/* Target line at 6 months */}
                <div style={{
                    position: 'absolute', top: '0', left: `${targetPct}%`, width: '2px', height: '100%',
                    background: 'var(--accent-primary)', opacity: 0.7,
                }} />
                <div style={{
                    position: 'absolute', top: '-18px', left: `${targetPct}%`, transform: 'translateX(-50%)',
                    fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                    6mo target
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '20px', padding: '0 4px' }}>
                <span>0</span>
                <span>1mo</span>
                <span>3mo</span>
                <span>6mo</span>
            </div>

            {/* Slider */}
            <div className="scenario-panel" style={{ marginBottom: '20px' }}>
                <div className="flex-between" style={{ marginBottom: '10px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                        What if you cut expenses by{' '}
                        <span style={{ color: 'var(--accent-success)' }}>{cutPercent}%</span>?
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>0% — 40%</span>
                </div>
                <input
                    type="range" min={0} max={40} step={5} value={cutPercent}
                    onChange={e => setCutPercent(Number(e.target.value))}
                    className="scenario-slider"
                />
                {cutPercent > 0 && (
                    <div style={{ marginTop: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Runway: <strong>{baseRunway.toFixed(1)} months</strong> →{' '}
                        <strong style={{ color: 'var(--accent-success)' }}>{runway.toFixed(1)} months</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '12px' }}>
                            (+{(runway - baseRunway).toFixed(1)} months)
                        </span>
                    </div>
                )}
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {[
                    { label: 'Liquid Assets', value: formatCurrency(liquidAssets), color: 'var(--accent-primary)' },
                    { label: 'Avg Monthly Expenses', value: formatCurrency(adjustedExpenses), color: 'var(--accent-danger)' },
                    { label: 'Gap to 6-Month Target', value: gapToTarget > 0 ? formatCurrency(gapToTarget) : 'Covered!', color: gapToTarget > 0 ? 'var(--accent-warning)' : 'var(--accent-success)' },
                ].map(({ label, value, color }) => (
                    <div key={label} style={{ textAlign: 'center', padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color }}>{value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Net Worth Trajectory ───────────────────────────────────────────
function NetWorthTrajectory() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

    const bankBalance = (balanceData?.balances || []).reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const savingsBalance = (balanceData?.financialSummary?.savingsAccounts || [])
        .reduce((s, a) => s + (Number(a.balanceAmount?.amount) || 0), 0);
    const investmentValue = (balanceData?.financialSummary?.securities || [])
        .reduce((s, sec) => s + (Number(sec.currentValue) || 0), 0);
    const currentNetWorth = bankBalance + savingsBalance + investmentValue;

    const sorted = Array.isArray(trendsData) ? [...trendsData].sort((a, b) => a.month.localeCompare(b.month)) : [];
    const avgNet = sorted.length > 0 ? sorted.reduce((s, d) => s + (d.net || 0), 0) / sorted.length : 0;
    const bestNet = sorted.length > 0 ? Math.max(...sorted.map(d => d.net || 0)) : 0;
    const lastMonth = sorted.length > 0 ? sorted[sorted.length - 1].month : '2026-01';

    const projMonths = 12;
    const labels = ['Today'];
    const currentLine = [currentNetWorth];
    const improvedLine = [currentNetWorth];

    for (let i = 1; i <= projMonths; i++) {
        labels.push(monthLabel(addMonthsToStr(lastMonth, i)));
        currentLine.push(currentNetWorth + avgNet * i);
        improvedLine.push(currentNetWorth + bestNet * i);
    }

    const nw12Current = currentNetWorth + avgNet * 12;
    const nw12Improved = currentNetWorth + bestNet * 12;

    const chartData = {
        labels,
        datasets: [
            {
                label: 'Current Trajectory',
                data: currentLine,
                borderColor: '#00F0FF',
                backgroundColor: 'rgba(0,240,255,0.05)',
                fill: true, tension: 0.3, borderWidth: 2,
                pointRadius: (ctx) => ctx.dataIndex === 0 ? 6 : 3,
                pointBackgroundColor: '#00F0FF',
                borderDash: [6, 3],
            },
            {
                label: 'Best-Month Pace',
                data: improvedLine,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.05)',
                fill: true, tension: 0.3, borderWidth: 2,
                pointRadius: 3,
                borderDash: [6, 3],
            },
        ],
    };

    const chartOptions = {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'top', labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } } },
            tooltip: { ...tooltipDefaults, callbacks: { label: (ctx) => ctx.raw !== null ? ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` : null } },
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', maxRotation: 45 } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', callback: (v) => '₪' + (v / 1000).toFixed(0) + 'K' } },
        },
    };

    return (
        <div className="glass-panel" style={{ padding: '24px', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.45s ease 0.1s, transform 0.45s ease 0.1s' }}>
            <h3 style={{ fontWeight: 600, marginBottom: '20px' }}>Net Worth Projection</h3>

            <div style={{ height: '300px', marginBottom: '20px' }}>
                <Line data={chartData} options={chartOptions} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {[
                    { label: 'Net Worth Today', value: formatCurrency(currentNetWorth), color: 'var(--accent-primary)' },
                    { label: 'In 12 Months (Current)', value: formatCurrency(nw12Current), color: nw12Current >= currentNetWorth ? 'var(--accent-success)' : 'var(--accent-danger)' },
                    { label: 'In 12 Months (Best Pace)', value: formatCurrency(nw12Improved), color: 'var(--accent-success)' },
                ].map(({ label, value, color }) => (
                    <div key={label} style={{ textAlign: 'center', padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color }}>{value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Savings Goal Simulator ─────────────────────────────────────────
function SavingsGoalSimulator() {
    const [targetAmount, setTargetAmount] = useState(30000);
    const [months, setMonths] = useState(12);
    const [showHowTo, setShowHowTo] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

    const currentAvgSavings = progressData?.averageSavings || 0;
    const requiredMonthly = targetAmount / months;
    const gap = requiredMonthly - currentAvgSavings;
    const coveragePct = requiredMonthly > 0 ? Math.min(100, (currentAvgSavings / requiredMonthly) * 100) : 100;
    const isFeasible = gap <= 0;

    const targetDate = useMemo(() => {
        const now = new Date();
        const future = new Date(now.getFullYear(), now.getMonth() + months, 1);
        return future.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }, [months]);

    const cutSuggestions = useMemo(() => {
        if (isFeasible || !Array.isArray(spendingData)) return [];
        let remaining = gap;
        return spendingData
            .filter(c => !FIXED_CATEGORIES.has(c.name) && c.total > 200)
            .map(c => {
                const rate = ACHIEVABILITY[c.name] || 0.15;
                const canSave = c.total * rate;
                return { name: c.name, nameEn: CATEGORY_TRANSLATIONS[c.name] || c.name, total: c.total, rate, canSave };
            })
            .sort((a, b) => b.canSave - a.canSave)
            .reduce((acc, item) => {
                if (remaining <= 0) return acc;
                const use = Math.min(item.canSave, remaining);
                remaining -= use;
                acc.push({ ...item, allocated: use });
                return acc;
            }, []);
    }, [gap, isFeasible]);

    // Progress ring
    const ringSize = 100;
    const ringStroke = 8;
    const radius = (ringSize - ringStroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const ringOffset = circumference * (1 - coveragePct / 100);
    const ringColor = isFeasible ? '#10b981' : coveragePct > 50 ? '#f59e0b' : '#ef4444';

    return (
        <div className="glass-panel" style={{ padding: '24px', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.45s ease 0.2s, transform 0.45s ease 0.2s' }}>
            <h3 style={{ fontWeight: 600, marginBottom: '20px' }}>Goal Planner</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                {/* Target Amount Slider */}
                <div className="scenario-panel">
                    <div className="flex-between" style={{ marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>Target Amount</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-primary)' }}>{formatCurrency(targetAmount)}</span>
                    </div>
                    <input type="range" min={5000} max={100000} step={5000} value={targetAmount}
                        onChange={e => setTargetAmount(Number(e.target.value))} className="scenario-slider" />
                    <div className="flex-between" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span>₪5K</span><span>₪100K</span>
                    </div>
                </div>

                {/* Timeline Slider */}
                <div className="scenario-panel">
                    <div className="flex-between" style={{ marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>Timeline</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-primary)' }}>{months} months</span>
                    </div>
                    <input type="range" min={3} max={24} step={1} value={months}
                        onChange={e => setMonths(Number(e.target.value))} className="scenario-slider" />
                    <div className="flex-between" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span>3mo</span><span>24mo</span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginBottom: '20px' }}>
                {/* Progress Ring */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <svg width={ringSize} height={ringSize} style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx={ringSize/2} cy={ringSize/2} r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={ringStroke} />
                        <circle cx={ringSize/2} cy={ringSize/2} r={radius} fill="none" stroke={ringColor} strokeWidth={ringStroke}
                            strokeDasharray={circumference} strokeDashoffset={ringOffset} strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1), stroke 0.3s' }} />
                    </svg>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: ringColor }}>{Math.round(coveragePct)}%</div>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>covered</div>
                    </div>
                </div>

                {/* Required vs Current */}
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Required /mo</div>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-primary)' }}>{formatCurrency(requiredMonthly)}</div>
                        </div>
                        <div style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Current Avg /mo</div>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-success)' }}>{formatCurrency(currentAvgSavings)}</div>
                        </div>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Target date: <strong style={{ color: 'var(--text-primary)' }}>{targetDate}</strong>
                        {isFeasible ? (
                            <span style={{ marginLeft: '12px', color: 'var(--accent-success)', fontWeight: 600 }}>
                                You're already saving enough!
                            </span>
                        ) : (
                            <span style={{ marginLeft: '12px', color: 'var(--accent-warning)' }}>
                                Gap: <strong>{formatCurrency(gap)}/mo</strong>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* How to get there */}
            {!isFeasible && cutSuggestions.length > 0 && (
                <div>
                    <button
                        onClick={() => setShowHowTo(h => !h)}
                        style={{
                            background: 'none', border: '1px solid var(--border-light)', borderRadius: '10px',
                            color: 'var(--text-secondary)', padding: '10px 16px', cursor: 'pointer', width: '100%',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: 600,
                        }}
                    >
                        <span>How to get there — suggested category cuts</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{showHowTo ? '▲' : '▼'}</span>
                    </button>
                    {showHowTo && (
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {cutSuggestions.map(item => (
                                <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                                    <div>
                                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{item.nameEn}</span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                                            cut {Math.round(item.rate * 100)}% of {formatCurrency(item.total)}
                                        </span>
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--accent-success)' }}>
                                        +{formatCurrency(item.allocated)}/mo
                                    </span>
                                </div>
                            ))}
                            {gap - cutSuggestions.reduce((s, i) => s + i.allocated, 0) > 0.5 && (
                                <div style={{ padding: '8px 14px', fontSize: '12px', color: 'var(--accent-warning)', fontStyle: 'italic' }}>
                                    Remaining gap of {formatCurrency(gap - cutSuggestions.reduce((s, i) => s + i.allocated, 0))}/mo — consider increasing your timeline or reducing the target.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main Simulations Component ─────────────────────────────────────
export default function Simulations({ selectedMonths }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <EmergencyFundRunway />
            <NetWorthTrajectory />
            <SavingsGoalSimulator />
        </div>
    );
}
