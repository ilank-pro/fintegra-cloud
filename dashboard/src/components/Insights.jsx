import { useEffect, useState } from 'react';
import insightsData from '../data/insights.json';
import progressData from '../data/progress.json';
import plansData from '../data/plans.json';
import { Lightbulb, Target, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Activity } from 'lucide-react';

const formatCurrency = (val) => {
    if (val === undefined || val === null) return '₪0';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(val).replace('ILS', '₪');
};

const formatDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const CATEGORY_TRANSLATIONS = {
    'תחבורה ציבורית': 'Public Transport',
    'סופר': 'Groceries / Supermarket',
    'כלכלה': 'Groceries',
    'אוכל בחוץ': 'Dining Out',
    'ביטוח': 'Insurance',
    'רכב': 'Car',
    'קניות': 'Shopping',
};

const PROGRESS_STATUS_LABELS = {
    POSITIVE_CASHFLOW: { label: 'Positive Cash Flow', badge: 'good' },
    NEGATIVE_CASHFLOW: { label: 'Negative Cash Flow', badge: 'bad' },
    NEGATIVE_CASHFLOWS_POSITIVE_OSH: { label: 'Negative Cash Flow — Savings Growing', badge: 'warn' },
    POSITIVE_CASHFLOWS_NEGATIVE_OSH: { label: 'Positive Cash Flow — Savings Declining', badge: 'warn' },
};

export default function Insights() {
    const [insights, setInsights] = useState([]);
    const [progress, setProgress] = useState(null);
    const [plans, setPlans] = useState([]);

    useEffect(() => {
        try {
            if (Array.isArray(insightsData)) setInsights(insightsData);
            else if (insightsData?.insights) setInsights(insightsData.insights);
            setProgress(progressData);
            if (Array.isArray(plansData)) setPlans(plansData.filter(p => p.state !== 'deleted'));
        } catch (e) {
            console.error(e);
        }
    }, []);

    const statusKey = progress?.progressState?.progressStatus || '';
    const statusMeta = PROGRESS_STATUS_LABELS[statusKey] || { label: statusKey, badge: 'warn' };
    const avgCashflow = progress?.averageCashflows || 0;
    const isHealthy = progress?.progressState?.currentOshIsPositive && avgCashflow > -5000;

    const positiveTrend = progress?.topCategoryTrends?.highestPositiveChangeCategory;
    const negativeTrend = progress?.topCategoryTrends?.highestNegativeChangeCategory;

    const getIconForType = (type) => {
        if (type === 'WARNING') return <AlertTriangle size={20} color="var(--accent-warning)" />;
        if (type === 'SUCCESS') return <CheckCircle2 size={20} color="var(--accent-success)" />;
        return <Lightbulb size={20} color="var(--accent-primary)" />;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Section A: Financial Health Score */}
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

                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                        {statusMeta.label}
                    </p>

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

            {/* Section B: Category Trend Alerts */}
            {(positiveTrend || negativeTrend) && (
                <div>
                    <h3 style={{ fontWeight: 600, marginBottom: '12px', paddingLeft: '2px' }}>Spending Trend Alerts</h3>
                    <div className="trend-alerts-grid">
                        {/* Spending Increased (bad) */}
                        {positiveTrend && (
                            <div className="trend-alert-card danger">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                    <TrendingUp size={18} color="var(--accent-danger)" />
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-danger)' }}>
                                        Spending Increased
                                    </span>
                                </div>
                                <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
                                    {CATEGORY_TRANSLATIONS[positiveTrend.categoryName] || positiveTrend.categoryName}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                                    {positiveTrend.categoryName}
                                </div>
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>This Quarter</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-danger)' }}>
                                            {formatCurrency(positiveTrend.currentQuarterAmount)}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Change</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-danger)' }}>
                                            +{(positiveTrend.quarterlyChangePercentage * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+Amount</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-danger)' }}>
                                            +{formatCurrency(positiveTrend.quarterlyChangeAmount)}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Top merchants</div>
                                {(positiveTrend.topBusinessNames || []).slice(0, 3).map((b) => (
                                    <div key={b.businessName} className="flex-between" style={{ padding: '6px 0', borderTop: '1px solid var(--border-light)' }}>
                                        <span style={{ fontSize: '13px' }}>{b.businessName}</span>
                                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{formatCurrency(b.transactionsSum)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Spending Decreased (good) */}
                        {negativeTrend && (
                            <div className="trend-alert-card success">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                    <TrendingDown size={18} color="var(--accent-success)" />
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-success)' }}>
                                        Spending Decreased
                                    </span>
                                </div>
                                <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
                                    {CATEGORY_TRANSLATIONS[negativeTrend.categoryName] || negativeTrend.categoryName}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                                    {negativeTrend.categoryName}
                                </div>
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>This Quarter</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-success)' }}>
                                            {formatCurrency(negativeTrend.currentQuarterAmount)}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Change</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-success)' }}>
                                            -{(negativeTrend.quarterlyChangePercentage * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Saved</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-success)' }}>
                                            -{formatCurrency(negativeTrend.quarterlyChangeAmount)}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Top merchants</div>
                                {(negativeTrend.topBusinessNames || []).slice(0, 3).map((b) => (
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

            {/* Section C: Savings Plans */}
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
                            const progress = plan.targetAmount > 0
                                ? Math.min(100, (plan.currentAmount / plan.targetAmount) * 100)
                                : 0;
                            const isDone = plan.state === 'done';
                            const isOverdue = !isDone && plan.deadline && new Date(plan.deadline) < new Date();
                            const fillColor = isDone
                                ? 'var(--text-muted)'
                                : plan.onTrack
                                    ? 'var(--accent-success)'
                                    : 'var(--accent-warning)';
                            const badgeColor = isDone ? '#64748b' : isOverdue ? '#ef4444' : plan.onTrack ? '#10b981' : '#f59e0b';
                            const badgeLabel = isDone ? 'Done' : isOverdue ? 'Overdue' : 'Active';

                            return (
                                <div key={plan._id} className="plan-card">
                                    <div className="flex-between" style={{ marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '20px' }}>{plan.unicodeIcon || '🎯'}</span>
                                            <span style={{ fontWeight: 600, fontSize: '15px' }}>{plan.name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {plan.deadline && (
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    Due {formatDate(plan.deadline)}
                                                </span>
                                            )}
                                            <span style={{ padding: '3px 10px', background: badgeColor + '22', color: badgeColor, borderRadius: '10px', fontSize: '11px', fontWeight: 600, border: `1px solid ${badgeColor}44` }}>
                                                {badgeLabel}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex-between" style={{ marginBottom: '8px', fontSize: '13px' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>
                                            {formatCurrency(plan.currentAmount)} of {formatCurrency(plan.targetAmount)}
                                        </span>
                                        <span style={{ fontWeight: 600 }}>{progress.toFixed(0)}%</span>
                                    </div>

                                    <div className="progress-bar-track">
                                        <div
                                            className="progress-bar-fill"
                                            style={{ width: `${progress}%`, background: fillColor }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Section D: AI Insights */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <h3 style={{ fontWeight: 600 }}>Smart Recommendations</h3>
                    {insights.length > 0 && (
                        <span style={{ padding: '2px 10px', background: 'rgba(59,130,246,0.15)', color: 'var(--accent-primary)', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                            {insights.length}
                        </span>
                    )}
                </div>
                <div style={{ display: 'grid', gap: '12px' }}>
                    {insights.length > 0 ? insights.map((insight, i) => (
                        <div key={i} className="glass-panel animate-fade-in" style={{ padding: '20px', display: 'flex', gap: '16px', animationDelay: `${i * 0.1}s` }}>
                            <div style={{ flexShrink: 0, marginTop: '2px' }}>
                                {getIconForType(insight.type || (i % 3 === 0 ? 'WARNING' : 'INFO'))}
                            </div>
                            <div>
                                <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                                    {insight.title || insight.headline || 'Financial Insight'}
                                </h4>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
                                    {insight.description || insight.body || JSON.stringify(insight)}
                                </p>
                            </div>
                        </div>
                    )) : (
                        <div className="glass-panel flex-center" style={{ padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>
                            No AI insights available for this cycle.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
