import { useEffect, useState, useRef } from 'react';
import insightsData from '../data/insights.json';
import progressData from '../data/progress.json';
import plansData from '../data/plans.json';
import spendingData from '../data/spending.json';
import { Lightbulb, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Activity, ChevronDown, ChevronUp } from 'lucide-react';

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

export default function Insights() {
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
        </div>
    );
}
