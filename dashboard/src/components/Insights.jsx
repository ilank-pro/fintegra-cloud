import { useEffect, useState, useRef, useMemo } from 'react';
import insightsData from '../data/insights.json';
import progressData from '../data/progress.json';
import plansData from '../data/plans.json';
import spendingData from '../data/spending.json';
import incomeData from '../data/income.json';
import trendsData from '../data/trends.json';
import transactionsData from '../data/transactions.json';
import { Lightbulb, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Activity, ChevronDown, ChevronUp, Trophy, Gauge, Target } from 'lucide-react';

const formatCurrency = (val) => {
    if (val === undefined || val === null) return '₪0';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(val).replace('ILS', '₪');
};

const formatDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
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

const PROGRESS_STATUS_LABELS = {
    POSITIVE_CASHFLOW: { label: 'Positive Cash Flow', badge: 'good' },
    NEGATIVE_CASHFLOW: { label: 'Negative Cash Flow', badge: 'bad' },
    NEGATIVE_CASHFLOWS_POSITIVE_OSH: { label: 'Negative Cash Flow — Savings Growing', badge: 'warn' },
    POSITIVE_CASHFLOWS_NEGATIVE_OSH: { label: 'Positive Cash Flow — Savings Declining', badge: 'warn' },
};

// Non-cuttable categories (fixed obligations)
const FIXED_CATEGORIES = new Set(['משכנתא', 'ביטוח', 'העברות', 'תשלומים', 'השקעה וחיסכון', 'שיק', 'עמלות']);

// Achievability: how realistic is a % cut for this category
const ACHIEVABILITY = {
    'מזומן': 0.25, 'כלכלה': 0.15, 'אוכל בחוץ': 0.30, 'קניות': 0.25,
    'תרומה': 0.20, 'דיגיטל': 0.20, 'תחבורה ציבורית': 0.15, 'רכב': 0.15,
    'חינוך': 0.10, 'תיירות': 0.30, 'בריאות': 0.10, 'ביגוד והנעלה': 0.25,
    'פנאי': 0.25, 'כללי': 0.20, 'חשמל': 0.10, 'תקשורת': 0.10, 'פארמה': 0.10,
};

function generateSavingAdvisor(spending) {
    if (!Array.isArray(spending)) return [];
    const total = spending.reduce((s, c) => s + c.total, 0);

    return spending
        .filter(c => !FIXED_CATEGORIES.has(c.name) && c.total > 200)
        .map(c => {
            const cutRate = ACHIEVABILITY[c.name] || 0.15;
            const monthlySaving = c.total * cutRate;
            const yearlySaving = monthlySaving * 12;
            const impact = monthlySaving; // rank by monthly saving
            const pct = total > 0 ? (c.total / total) * 100 : 0;
            return {
                name: c.name,
                nameEn: CATEGORY_TRANSLATIONS[c.name] || c.name,
                total: c.total,
                pct,
                cutRate,
                monthlySaving,
                yearlySaving,
                impact,
                isHighSpend: pct > 5,
            };
        })
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 5);
}

// SVG circular progress ring
function ProgressRing({ percent, size = 80, stroke = 7, color = '#10b981', animate = false }) {
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const [offset, setOffset] = useState(circumference);

    useEffect(() => {
        if (!animate) { setOffset(circumference * (1 - percent / 100)); return; }
        const timer = setTimeout(() => setOffset(circumference * (1 - percent / 100)), 80);
        return () => clearTimeout(timer);
    }, [percent, circumference, animate]);

    return (
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
            <circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke}
            />
            <circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none" stroke={color} strokeWidth={stroke}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)' }}
            />
        </svg>
    );
}

function AdvisorCard({ item, index }) {
    const [expanded, setExpanded] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), index * 100 + 50);
        return () => clearTimeout(t);
    }, [index]);

    const severity = item.pct > 10 ? 'high' : item.pct > 5 ? 'medium' : 'low';
    const severityColor = severity === 'high' ? 'var(--accent-danger)' : severity === 'medium' ? 'var(--accent-warning)' : 'var(--accent-primary)';
    const severityBg = severity === 'high' ? 'rgba(239,68,68,0.12)' : severity === 'medium' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)';

    const emoji = severity === 'high' ? '🔴' : severity === 'medium' ? '🟡' : '💡';

    return (
        <div
            className="advisor-card"
            style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(12px)',
                transition: `opacity 0.4s ease, transform 0.4s ease`,
            }}
            onClick={() => setExpanded(e => !e)}
        >
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{
                    flexShrink: 0,
                    width: '38px', height: '38px',
                    background: severityBg,
                    borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px',
                }}>
                    {emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px' }}>{item.nameEn}</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '8px', background: severityBg, color: severityColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {severity}
                        </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
                        If you cut <strong style={{ color: 'var(--text-primary)' }}>{item.nameEn}</strong> by{' '}
                        <strong style={{ color: severityColor }}>{Math.round(item.cutRate * 100)}%</strong>:
                        save <strong style={{ color: 'var(--accent-success)' }}>{formatCurrency(item.monthlySaving)}/mo</strong>{' '}
                        → <strong style={{ color: 'var(--accent-success)' }}>{formatCurrency(item.yearlySaving)}/year</strong>
                    </p>
                </div>
                <div style={{ flexShrink: 0, color: 'var(--text-muted)', paddingTop: '4px' }}>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </div>

            {expanded && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px' }}>
                        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Current Spend</div>
                            <div style={{ fontWeight: 700, color: 'var(--accent-danger)' }}>{formatCurrency(item.total)}</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>% of Budget</div>
                            <div style={{ fontWeight: 700, color: severityColor }}>{item.pct.toFixed(1)}%</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Yearly Saving</div>
                            <div style={{ fontWeight: 700, color: 'var(--accent-success)' }}>{formatCurrency(item.yearlySaving)}</div>
                        </div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Target: reduce from {formatCurrency(item.total)} to {formatCurrency(item.total * (1 - item.cutRate))}/mo
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Category classification for 50/30/20 ───────────────────────────
const NEEDS_CATEGORIES = new Set(['משכנתא', 'כלכלה', 'ביטוח', 'חשמל', 'תקשורת', 'בריאות', 'פארמה', 'תחבורה ציבורית', 'רכב']);
const WANTS_CATEGORIES = new Set(['אוכל בחוץ', 'קניות', 'ביגוד והנעלה', 'פנאי', 'תיירות', 'דיגיטל']);
const SAVINGS_CATEGORIES = new Set(['השקעה וחיסכון']);

function BudgetBenchmark() {
    const [expanded, setExpanded] = useState(null); // 'needs' | 'wants' | 'savings'

    const totalIncome = Array.isArray(incomeData)
        ? incomeData.reduce((s, i) => s + (Number(i.amount) || 0), 0)
        : 0;

    const buckets = useMemo(() => {
        if (!Array.isArray(spendingData) || totalIncome <= 0) return null;
        const needs = { total: 0, categories: [] };
        const wants = { total: 0, categories: [] };
        const savings = { total: progressData?.averageSavings || 0, categories: [] };
        const other = { total: 0, categories: [] };

        for (const cat of spendingData) {
            const entry = { name: cat.name, nameEn: CATEGORY_TRANSLATIONS[cat.name] || cat.name, total: cat.total };
            if (NEEDS_CATEGORIES.has(cat.name)) { needs.total += cat.total; needs.categories.push(entry); }
            else if (WANTS_CATEGORIES.has(cat.name)) { wants.total += cat.total; wants.categories.push(entry); }
            else if (SAVINGS_CATEGORIES.has(cat.name)) { savings.total += cat.total; savings.categories.push(entry); }
            else { other.total += cat.total; other.categories.push(entry); }
        }

        const totalSpend = needs.total + wants.total + savings.total + other.total;
        return { needs, wants, savings, other, totalSpend, totalIncome };
    }, [totalIncome]);

    if (!buckets) return null;

    const { needs, wants, savings } = buckets;
    const refAmount = buckets.totalIncome;

    const sections = [
        { key: 'needs', label: 'Needs', ideal: 50, actual: (needs.total / refAmount) * 100, amount: needs.total, idealAmount: refAmount * 0.5, color: '#3b82f6', categories: needs.categories },
        { key: 'wants', label: 'Wants', ideal: 30, actual: (wants.total / refAmount) * 100, amount: wants.total, idealAmount: refAmount * 0.3, color: '#8b5cf6', categories: wants.categories },
        { key: 'savings', label: 'Savings', ideal: 20, actual: (savings.total / refAmount) * 100, amount: savings.total, idealAmount: refAmount * 0.2, color: '#10b981', categories: savings.categories },
    ];

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Target size={18} color="var(--accent-primary)" />
                <h3 style={{ fontWeight: 600 }}>Budget Health Check — 50/30/20 Rule</h3>
            </div>

            {/* Comparison bars */}
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '12px' }}>
                {['Your Actual', 'Ideal 50/30/20'].map((label, idx) => (
                    <div key={label} style={{ marginBottom: idx === 0 ? '12px' : 0 }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>{label}</div>
                        <div style={{ display: 'flex', height: '28px', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                            {sections.map(s => {
                                const pct = idx === 0 ? s.actual : s.ideal;
                                return (
                                    <div key={s.key} style={{
                                        width: `${pct}%`, background: s.color + (idx === 0 ? 'cc' : '55'),
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '10px', fontWeight: 700, color: '#fff', minWidth: pct > 5 ? '0' : '0',
                                        transition: 'width 0.6s ease',
                                    }}>
                                        {pct >= 8 && `${s.label} ${Math.round(pct)}%`}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Bucket cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {sections.map(s => {
                    const diff = s.amount - s.idealAmount;
                    const isOver = diff > 0;
                    const isExpanded = expanded === s.key;
                    return (
                        <div key={s.key} className="glass-panel" style={{ padding: '16px', cursor: 'pointer', transition: 'transform 0.2s' }}
                            onClick={() => setExpanded(isExpanded ? null : s.key)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontWeight: 700, fontSize: '14px', color: s.color }}>{s.label}</span>
                                {isExpanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{formatCurrency(s.amount)}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                {Math.round(s.actual)}% of income (ideal: {s.ideal}%)
                            </div>
                            <div style={{
                                fontSize: '12px', fontWeight: 600,
                                color: s.key === 'savings' ? (isOver ? 'var(--accent-success)' : 'var(--accent-danger)') : (isOver ? 'var(--accent-danger)' : 'var(--accent-success)'),
                            }}>
                                {s.key === 'savings'
                                    ? (isOver ? `+${formatCurrency(Math.abs(diff))} above target` : `${formatCurrency(Math.abs(diff))} below target`)
                                    : (isOver ? `${formatCurrency(diff)} over budget` : `${formatCurrency(Math.abs(diff))} under budget`)}
                            </div>
                            {isExpanded && s.categories.length > 0 && (
                                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                                    {s.categories.sort((a, b) => b.total - a.total).map(c => (
                                        <div key={c.name} className="flex-between" style={{ padding: '4px 0', fontSize: '12px' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>{c.nameEn}</span>
                                            <span style={{ fontWeight: 600 }}>{formatCurrency(c.total)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Spending Volatility Monitor ─────────────────────────────────────
function SpendingVolatility() {
    const sorted = useMemo(() =>
        Array.isArray(trendsData) ? [...trendsData].sort((a, b) => a.month.localeCompare(b.month)) : []
    , []);

    if (sorted.length < 2) return null;

    const expenses = sorted.map(d => d.expenses || 0);
    const avg = expenses.reduce((s, v) => s + v, 0) / expenses.length;
    const variance = expenses.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / expenses.length;
    const stddev = Math.sqrt(variance);
    const cv = avg > 0 ? (stddev / avg) * 100 : 0;
    const stabilityScore = Math.max(0, Math.min(100, Math.round(100 - cv)));

    const minExp = Math.min(...expenses);
    const maxExp = Math.max(...expenses);
    const range = maxExp - minExp;

    const scoreLabel = stabilityScore >= 80 ? 'Very Stable' : stabilityScore >= 60 ? 'Moderate' : 'Volatile';
    const scoreColor = stabilityScore >= 80 ? 'var(--accent-success)' : stabilityScore >= 60 ? 'var(--accent-warning)' : 'var(--accent-danger)';

    // Find spike month
    const spikeIdx = expenses.reduce((maxI, v, i, arr) => v > arr[maxI] ? i : maxI, 0);
    const spikeMonth = sorted[spikeIdx];
    const spikeAmount = expenses[spikeIdx] - avg;

    // Spike culprits from transactions (if the spike month has transaction data)
    const spikeCulprits = useMemo(() => {
        if (!spikeMonth || !Array.isArray(transactionsData)) return [];
        const monthPrefix = spikeMonth.month;
        const monthTxns = transactionsData.filter(t => t.date?.startsWith(monthPrefix) && !t.isIncome);
        if (monthTxns.length === 0) return [];

        const catTotals = {};
        for (const t of monthTxns) {
            catTotals[t.category] = (catTotals[t.category] || 0) + (t.amount || 0);
        }

        // Compare to avg from spending data
        const avgCats = {};
        if (Array.isArray(spendingData)) {
            for (const c of spendingData) avgCats[c.name] = c.total;
        }

        return Object.entries(catTotals)
            .map(([cat, total]) => ({
                name: cat,
                nameEn: CATEGORY_TRANSLATIONS[cat] || cat,
                total,
                avgTotal: avgCats[cat] || 0,
                spike: total - (avgCats[cat] || 0),
            }))
            .filter(c => c.spike > 0)
            .sort((a, b) => b.spike - a.spike)
            .slice(0, 3);
    }, [spikeMonth]);

    // Semicircular gauge
    const gaugeSize = 160;
    const gaugeStroke = 12;
    const gaugeRadius = (gaugeSize - gaugeStroke) / 2;
    const gaugeCircumference = Math.PI * gaugeRadius; // semicircle
    const gaugeOffset = gaugeCircumference * (1 - stabilityScore / 100);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Gauge size={18} color="var(--accent-warning)" />
                <h3 style={{ fontWeight: 600 }}>Spending Stability</h3>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', gap: '32px', alignItems: 'center', marginBottom: '20px' }}>
                    {/* Semicircular gauge */}
                    <div style={{ position: 'relative', width: gaugeSize, height: gaugeSize / 2 + 20, flexShrink: 0 }}>
                        <svg width={gaugeSize} height={gaugeSize / 2 + 10} viewBox={`0 0 ${gaugeSize} ${gaugeSize / 2 + 10}`}>
                            {/* Background arc */}
                            <path
                                d={`M ${gaugeStroke/2} ${gaugeSize/2} A ${gaugeRadius} ${gaugeRadius} 0 0 1 ${gaugeSize - gaugeStroke/2} ${gaugeSize/2}`}
                                fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={gaugeStroke} strokeLinecap="round"
                            />
                            {/* Value arc */}
                            <path
                                d={`M ${gaugeStroke/2} ${gaugeSize/2} A ${gaugeRadius} ${gaugeRadius} 0 0 1 ${gaugeSize - gaugeStroke/2} ${gaugeSize/2}`}
                                fill="none" stroke={scoreColor} strokeWidth={gaugeStroke} strokeLinecap="round"
                                strokeDasharray={gaugeCircumference}
                                strokeDashoffset={gaugeOffset}
                                style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)' }}
                            />
                        </svg>
                        <div style={{ position: 'absolute', bottom: '0', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
                            <div style={{ fontSize: '28px', fontWeight: 800, color: scoreColor }}>{stabilityScore}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{scoreLabel}</div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                            Your expenses vary by <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(range)}</strong> between
                            your lowest ({formatCurrency(minExp)}) and highest ({formatCurrency(maxExp)}) months.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                            {[
                                { label: 'Avg', value: formatCurrency(avg), color: 'var(--text-primary)' },
                                { label: 'Std Dev', value: formatCurrency(stddev), color: 'var(--accent-warning)' },
                                { label: 'Range', value: formatCurrency(range), color: 'var(--accent-danger)' },
                            ].map(({ label, value, color }) => (
                                <div key={label} style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color }}>{value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Monthly expense bars */}
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Monthly Expenses</div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '80px' }}>
                        {sorted.map((d, i) => {
                            const pct = maxExp > 0 ? ((d.expenses || 0) / maxExp) * 100 : 0;
                            const isSpike = i === spikeIdx;
                            return (
                                <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <div style={{
                                        width: '100%', height: `${pct}%`, minHeight: '4px',
                                        background: isSpike ? 'var(--accent-danger)' : 'var(--accent-primary)',
                                        borderRadius: '4px 4px 0 0', opacity: isSpike ? 1 : 0.6,
                                        transition: 'height 0.6s ease',
                                    }} />
                                    <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                                        {new Date(Number(d.month.split('-')[0]), Number(d.month.split('-')[1]) - 1).toLocaleDateString('en-US', { month: 'short' })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* Avg line label */}
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right', marginTop: '4px' }}>
                        — avg: {formatCurrency(avg)}
                    </div>
                </div>

                {/* Spike culprits */}
                {spikeCulprits.length > 0 && (
                    <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
                            Spike Culprits — {new Date(Number(spikeMonth.month.split('-')[0]), Number(spikeMonth.month.split('-')[1]) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {spikeCulprits.map(c => (
                                <div key={c.name} style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.06)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.15)' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>{c.nameEn}</div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-danger)' }}>{formatCurrency(c.total)}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>+{formatCurrency(c.spike)} above avg</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Best Month Replay & Challenge ───────────────────────────────────
function BestMonthChallenge() {
    const sorted = useMemo(() =>
        Array.isArray(trendsData) ? [...trendsData].sort((a, b) => a.month.localeCompare(b.month)) : []
    , []);

    if (sorted.length < 2) return null;

    const bestMonth = sorted.reduce((best, d) => (d.net || 0) > (best.net || 0) ? d : best, sorted[0]);
    const latestMonth = sorted[sorted.length - 1];

    const bestLabel = new Date(Number(bestMonth.month.split('-')[0]), Number(bestMonth.month.split('-')[1]) - 1)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const latestLabel = new Date(Number(latestMonth.month.split('-')[0]), Number(latestMonth.month.split('-')[1]) - 1)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Category breakdown from transactions (if available for both months)
    const categoryComparison = useMemo(() => {
        if (!Array.isArray(transactionsData)) return [];

        const buildCatMap = (monthStr) => {
            const txns = transactionsData.filter(t => t.date?.startsWith(monthStr) && !t.isIncome);
            const map = {};
            for (const t of txns) {
                map[t.category] = (map[t.category] || 0) + (t.amount || 0);
            }
            return map;
        };

        const bestCats = buildCatMap(bestMonth.month);
        const latestCats = buildCatMap(latestMonth.month);
        const allCats = new Set([...Object.keys(bestCats), ...Object.keys(latestCats)]);

        return [...allCats]
            .map(cat => ({
                name: cat,
                nameEn: CATEGORY_TRANSLATIONS[cat] || cat,
                best: bestCats[cat] || 0,
                latest: latestCats[cat] || 0,
                diff: (latestCats[cat] || 0) - (bestCats[cat] || 0),
            }))
            .filter(c => c.best > 0 || c.latest > 0)
            .sort((a, b) => b.diff - a.diff);
    }, [bestMonth, latestMonth]);

    const annualBest = (bestMonth.net || 0) * 12;
    const annualCurrent = sorted.reduce((s, d) => s + (d.net || 0), 0) / sorted.length * 12;

    // Top 3 categories to match
    const topToMatch = categoryComparison.filter(c => c.diff > 0).slice(0, 3);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Trophy size={18} color="var(--accent-warning)" />
                <h3 style={{ fontWeight: 600 }}>Your Best Month — Can You Repeat It?</h3>
            </div>

            {/* Banner */}
            <div className="glass-panel" style={{
                padding: '20px', marginBottom: '12px',
                background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(16,185,129,0.06))',
                border: '1px solid rgba(245,158,11,0.2)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '36px' }}>🏆</div>
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
                            {bestLabel}
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-success)' }}>
                            +{formatCurrency(bestMonth.net || 0)} net
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Income: {formatCurrency(bestMonth.income || 0)} · Expenses: {formatCurrency(bestMonth.expenses || 0)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Comparison table */}
            {categoryComparison.length > 0 && (
                <div className="glass-panel" style={{ padding: '16px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: 600 }}>
                        Category Comparison: {bestLabel} vs {latestLabel}
                    </div>
                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Category</th>
                                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Best</th>
                                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Latest</th>
                                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Diff</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categoryComparison.map(c => (
                                    <tr key={c.name} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                        <td style={{ padding: '6px 8px', fontWeight: 500 }}>{c.nameEn}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatCurrency(c.best)}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatCurrency(c.latest)}</td>
                                        <td style={{
                                            padding: '6px 8px', textAlign: 'right', fontWeight: 600,
                                            color: c.diff > 0 ? 'var(--accent-danger)' : c.diff < 0 ? 'var(--accent-success)' : 'var(--text-muted)',
                                        }}>
                                            {c.diff > 0 ? '+' : ''}{formatCurrency(c.diff)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Annual Impact + Challenge */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Annual Impact</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        If every month was like {bestLabel}:
                        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-success)', margin: '8px 0' }}>
                            +{formatCurrency(annualBest)}/year
                        </div>
                        vs current average:
                        <div style={{ fontSize: '16px', fontWeight: 700, color: annualCurrent >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                            {annualCurrent >= 0 ? '+' : ''}{formatCurrency(annualCurrent)}/year
                        </div>
                    </div>
                </div>

                <div className="glass-panel" style={{
                    padding: '16px',
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.06))',
                    border: '1px solid rgba(139,92,246,0.2)',
                }}>
                    <div style={{ fontSize: '11px', color: 'var(--accent-purple)', marginBottom: '6px', fontWeight: 600 }}>
                        Repeat {bestLabel.split(' ')[0]} Challenge
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        Focus on these categories to match your best:
                    </div>
                    {topToMatch.length > 0 ? topToMatch.map((c, i) => (
                        <div key={c.name} className="flex-between" style={{ padding: '4px 0', fontSize: '12px' }}>
                            <span>
                                <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>#{i + 1}</span>
                                <span style={{ fontWeight: 600 }}>{c.nameEn}</span>
                            </span>
                            <span style={{ color: 'var(--accent-danger)', fontWeight: 600 }}>-{formatCurrency(c.diff)}</span>
                        </div>
                    )) : (
                        <div style={{ fontSize: '12px', color: 'var(--accent-success)', fontWeight: 600 }}>
                            You're already matching or beating your best month!
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function Insights({ selectedMonths }) {
    const [progress, setProgress] = useState(null);
    const [plans, setPlans] = useState([]);
    const [ringsVisible, setRingsVisible] = useState(false);
    const [advisorItems, setAdvisorItems] = useState([]);

    const positiveTrend = progressData?.topCategoryTrends?.highestPositiveChangeCategory;
    const negativeTrend = progressData?.topCategoryTrends?.highestNegativeChangeCategory;

    useEffect(() => {
        setProgress(progressData);
        if (Array.isArray(plansData)) setPlans(plansData.filter(p => p.state !== 'deleted'));
        setAdvisorItems(generateSavingAdvisor(spendingData));
        const t = setTimeout(() => setRingsVisible(true), 150);
        return () => clearTimeout(t);
    }, []);

    const statusKey = progress?.progressState?.progressStatus || '';
    const statusMeta = PROGRESS_STATUS_LABELS[statusKey] || { label: statusKey, badge: 'warn' };
    const avgCashflow = progress?.averageCashflows || 0;
    const isHealthy = progress?.progressState?.currentOshIsPositive && avgCashflow > -5000;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Financial Health */}
            {progress && (
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div className="flex-between" style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div className="metric-icon flex-center" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent-primary)' }}>
                                <Activity size={20} />
                            </div>
                            <h3 style={{ fontWeight: 600 }}>Financial Health</h3>
                        </div>
                        <span className={`health-score-badge ${isHealthy ? 'good' : statusMeta.badge}`}>
                            {isHealthy ? '✓ On Track' : statusMeta.badge === 'bad' ? '✕ Needs Attention' : '⚠ Watch Spending'}
                        </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>{statusMeta.label}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                        {[
                            { label: 'Avg Monthly Cashflow', value: formatCurrency(avgCashflow), color: avgCashflow >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' },
                            { label: 'Positive Months', value: progress.positiveCashflowsCount, color: 'var(--text-primary)' },
                            { label: 'Avg Monthly Savings', value: formatCurrency(progress.averageSavings), color: 'var(--accent-success)' },
                            { label: 'Total Savings', value: formatCurrency(progress.totalSavings), color: 'var(--accent-success)' },
                        ].map(({ label, value, color }) => (
                            <div key={label} style={{ textAlign: 'center', padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>{label}</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color }}>{value}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Spending Trend Alerts */}
            {(positiveTrend || negativeTrend) && (
                <div>
                    <h3 style={{ fontWeight: 600, marginBottom: '12px', paddingLeft: '2px' }}>Spending Trend Alerts</h3>
                    <div className="trend-alerts-grid">
                        {positiveTrend && (
                            <div className="trend-alert-card danger">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                    <TrendingUp size={18} color="var(--accent-danger)" />
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-danger)' }}>Spending Increased</span>
                                </div>
                                <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
                                    {CATEGORY_TRANSLATIONS[positiveTrend.categoryName] || positiveTrend.categoryName}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>{positiveTrend.categoryName}</div>
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>This Quarter</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-danger)' }}>{formatCurrency(positiveTrend.currentQuarterAmount)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Change</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-danger)' }}>+{(positiveTrend.quarterlyChangePercentage * 100).toFixed(1)}%</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+Amount</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-danger)' }}>+{formatCurrency(positiveTrend.quarterlyChangeAmount)}</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Top merchants</div>
                                {(positiveTrend.topBusinessNames || []).slice(0, 3).map(b => (
                                    <div key={b.businessName} className="flex-between" style={{ padding: '6px 0', borderTop: '1px solid var(--border-light)' }}>
                                        <span style={{ fontSize: '13px' }}>{b.businessName}</span>
                                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{formatCurrency(b.transactionsSum)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {negativeTrend && (
                            <div className="trend-alert-card success">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                    <TrendingDown size={18} color="var(--accent-success)" />
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-success)' }}>Spending Decreased</span>
                                </div>
                                <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
                                    {CATEGORY_TRANSLATIONS[negativeTrend.categoryName] || negativeTrend.categoryName}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>{negativeTrend.categoryName}</div>
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>This Quarter</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-success)' }}>{formatCurrency(negativeTrend.currentQuarterAmount)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Change</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-success)' }}>-{(negativeTrend.quarterlyChangePercentage * 100).toFixed(1)}%</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Saved</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-success)' }}>-{formatCurrency(negativeTrend.quarterlyChangeAmount)}</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Top merchants</div>
                                {(negativeTrend.topBusinessNames || []).slice(0, 3).map(b => (
                                    <div key={b.businessName} className="flex-between" style={{ padding: '6px 0', borderTop: '1px solid var(--border-light)' }}>
                                        <span style={{ fontSize: '13px' }}>{b.businessName}</span>
                                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{formatCurrency(b.transactionsSum)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Savings Plans — Circular Progress Rings */}
            {plans.length > 0 && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <h3 style={{ fontWeight: 600 }}>Savings Plans</h3>
                        <span style={{ padding: '2px 10px', background: 'rgba(139,92,246,0.15)', color: 'var(--accent-purple)', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                            {plans.length}
                        </span>
                    </div>
                    <div style={{ display: 'grid', gap: '12px' }}>
                        {plans.map((plan) => {
                            const pct = plan.targetAmount > 0
                                ? Math.min(100, (plan.currentAmount / plan.targetAmount) * 100)
                                : 0;
                            const isDone = plan.state === 'done';
                            const isOverdue = !isDone && plan.deadline && new Date(plan.deadline) < new Date();
                            const ringColor = isDone ? '#64748b' : plan.onTrack ? '#10b981' : '#f59e0b';
                            const badgeColor = isDone ? '#64748b' : isOverdue ? '#ef4444' : plan.onTrack ? '#10b981' : '#f59e0b';
                            const badgeLabel = isDone ? 'Done' : isOverdue ? 'Overdue' : 'Active';

                            return (
                                <div key={plan._id} className="plan-card" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    {/* SVG Ring */}
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <ProgressRing percent={pct} size={80} stroke={7} color={ringColor} animate={ringsVisible} />
                                        <div style={{
                                            position: 'absolute', top: '50%', left: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            textAlign: 'center', lineHeight: 1.1,
                                        }}>
                                            <div style={{ fontSize: '14px', fontWeight: 700, color: ringColor }}>{Math.round(pct)}%</div>
                                        </div>
                                    </div>

                                    {/* Plan Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="flex-between" style={{ marginBottom: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '18px' }}>{plan.unicodeIcon || '🎯'}</span>
                                                <span style={{ fontWeight: 600, fontSize: '15px' }}>{plan.name}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {plan.deadline && (
                                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Due {formatDate(plan.deadline)}</span>
                                                )}
                                                <span style={{ padding: '3px 10px', background: badgeColor + '22', color: badgeColor, borderRadius: '10px', fontSize: '11px', fontWeight: 600, border: `1px solid ${badgeColor}44` }}>
                                                    {badgeLabel}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                            {formatCurrency(plan.currentAmount)} of {formatCurrency(plan.targetAmount)}
                                        </div>
                                        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {plan.targetAmount - plan.currentAmount > 0
                                                ? `${formatCurrency(plan.targetAmount - plan.currentAmount)} remaining`
                                                : 'Goal reached!'}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Save Further Advisor */}
            {advisorItems.length > 0 && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <h3 style={{ fontWeight: 600 }}>Save Further</h3>
                        <span style={{ padding: '2px 10px', background: 'rgba(16,185,129,0.15)', color: 'var(--accent-success)', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                            Advisor
                        </span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>
                        Top saving opportunities ranked by monthly impact. Tap to expand.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {advisorItems.map((item, i) => (
                            <AdvisorCard key={item.name} item={item} index={i} />
                        ))}
                    </div>
                </div>
            )}

            {/* 50/30/20 Budget Benchmark */}
            <BudgetBenchmark />

            {/* Spending Volatility Monitor */}
            <SpendingVolatility />

            {/* Best Month Challenge */}
            <BestMonthChallenge />
        </div>
    );
}
