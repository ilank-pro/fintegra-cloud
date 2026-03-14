import { useEffect, useState } from 'react';
import { CreditCard, TrendingUp, TrendingDown, DollarSign, PiggyBank, Percent } from 'lucide-react';
import balanceData from '../data/balance.json';
import spendingData from '../data/spending.json';
import incomeData from '../data/income.json';
import progressData from '../data/progress.json';

const formatCurrency = (val) => {
    if (val === undefined || val === null) return '₪0';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(val).replace('ILS', '₪');
};

const PROGRESS_STATUS_LABELS = {
    POSITIVE_CASHFLOW: 'Positive Cash Flow',
    NEGATIVE_CASHFLOW: 'Negative Cash Flow',
    NEGATIVE_CASHFLOWS_POSITIVE_OSH: 'Negative Cash Flow — Savings Growing',
    POSITIVE_CASHFLOWS_NEGATIVE_OSH: 'Positive Cash Flow — Savings Declining',
};

export default function Overview() {
    const [metrics, setMetrics] = useState({
        totalBalance: 0,
        spending: 0,
        income: 0,
        net: 0,
        savingsRate: 0,
        totalDeposits: 0,
    });
    const [progress, setProgress] = useState(null);

    useEffect(() => {
        try {
            const balancesArr = balanceData?.balances || [];
            const totalBal = balancesArr.reduce((acc, a) => acc + (Number(a.balance) || 0), 0);

            const spd = Array.isArray(spendingData)
                ? spendingData.reduce((acc, cat) => acc + (Number(cat.total) || 0), 0)
                : 0;

            const inc = Array.isArray(incomeData)
                ? incomeData.reduce((acc, item) => acc + (Number(item.amount) || 0), 0)
                : 0;

            const deposits = (balanceData?.financialSummary?.savingsAccounts || [])
                .reduce((acc, s) => acc + (Number(s.balanceAmount?.amount) || 0), 0);

            const avgSavings = progressData?.averageSavings || 0;
            const savingsRate = inc > 0 ? Math.round((avgSavings / inc) * 100) : 0;

            setMetrics({
                totalBalance: totalBal,
                spending: Math.abs(spd),
                income: inc,
                net: inc - Math.abs(spd),
                savingsRate,
                totalDeposits: deposits,
            });
            setProgress(progressData);
        } catch (e) {
            console.error('Error formatting overview data', e);
        }
    }, []);

    const avgCashflow = progress?.averageCashflows || 0;
    const progressStatus = progress?.progressState?.progressStatus || '';
    const statusLabel = PROGRESS_STATUS_LABELS[progressStatus] || progressStatus;
    const isHealthy = progress?.progressState?.currentOshIsPositive && avgCashflow > -5000;

    return (
        <div className="overview-container">
            <div className="metrics-grid">
                <div className="metric-card glass-panel">
                    <div className="metric-header">
                        <div className="metric-icon flex-center" style={{ color: 'var(--accent-primary)' }}>
                            <CreditCard size={18} />
                        </div>
                        <span>Total Balance</span>
                    </div>
                    <div className="metric-value">{formatCurrency(metrics.totalBalance)}</div>
                    <div className="text-muted" style={{ fontSize: '12px' }}>Across all connected accounts</div>
                </div>

                <div className="metric-card glass-panel">
                    <div className="metric-header">
                        <div className="metric-icon flex-center" style={{ color: 'var(--accent-success)' }}>
                            <TrendingUp size={18} />
                        </div>
                        <span>Monthly Income</span>
                    </div>
                    <div className="metric-value positive">{formatCurrency(metrics.income)}</div>
                    <div className="text-muted" style={{ fontSize: '12px' }}>Current month</div>
                </div>

                <div className="metric-card glass-panel">
                    <div className="metric-header">
                        <div className="metric-icon flex-center" style={{ color: 'var(--accent-danger)' }}>
                            <TrendingDown size={18} />
                        </div>
                        <span>Monthly Spending</span>
                    </div>
                    <div className="metric-value negative">{formatCurrency(metrics.spending)}</div>
                    <div className="text-muted" style={{ fontSize: '12px' }}>Current month</div>
                </div>

                <div className="metric-card glass-panel">
                    <div className="metric-header">
                        <div className="metric-icon flex-center" style={{ color: 'var(--accent-purple)' }}>
                            <DollarSign size={18} />
                        </div>
                        <span>Net Cash Flow</span>
                    </div>
                    <div className={`metric-value ${metrics.net >= 0 ? 'positive' : 'negative'}`}>
                        {metrics.net > 0 ? '+' : ''}{formatCurrency(metrics.net)}
                    </div>
                    <div className="text-muted" style={{ fontSize: '12px' }}>Income minus spending</div>
                </div>

                <div className="metric-card glass-panel">
                    <div className="metric-header">
                        <div className="metric-icon flex-center" style={{ color: 'var(--accent-warning)' }}>
                            <Percent size={18} />
                        </div>
                        <span>Avg Savings Rate</span>
                    </div>
                    <div className={`metric-value ${metrics.savingsRate >= 10 ? 'positive' : metrics.savingsRate > 0 ? 'neutral' : 'negative'}`}>
                        {metrics.savingsRate}%
                    </div>
                    <div className="text-muted" style={{ fontSize: '12px' }}>Based on avg monthly savings</div>
                </div>

                <div className="metric-card glass-panel">
                    <div className="metric-header">
                        <div className="metric-icon flex-center" style={{ color: 'var(--accent-success)' }}>
                            <PiggyBank size={18} />
                        </div>
                        <span>Total Deposits</span>
                    </div>
                    <div className="metric-value positive">{formatCurrency(metrics.totalDeposits)}</div>
                    <div className="text-muted" style={{ fontSize: '12px' }}>Savings accounts & deposits</div>
                </div>
            </div>

            {/* Financial Health Summary */}
            {progress && (
                <div className="glass-panel" style={{ marginTop: '24px', padding: '24px' }}>
                    <div className="flex-between" style={{ marginBottom: '20px' }}>
                        <h3 style={{ fontWeight: 600 }}>Financial Health</h3>
                        <span className={`health-score-badge ${isHealthy ? 'good' : avgCashflow > -30000 ? 'warn' : 'bad'}`}>
                            {isHealthy ? '✓ On Track' : avgCashflow > -30000 ? '⚠ Watch Spending' : '✕ Needs Attention'}
                        </span>
                    </div>

                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                        {statusLabel}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Avg Monthly Cashflow</div>
                            <div style={{ fontSize: '20px', fontWeight: 600, color: avgCashflow >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                                {formatCurrency(avgCashflow)}
                            </div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Positive Months</div>
                            <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {progress.positiveCashflowsCount}
                            </div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Avg Monthly Savings</div>
                            <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--accent-success)' }}>
                                {formatCurrency(progress.averageSavings)}
                            </div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Total Savings</div>
                            <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--accent-success)' }}>
                                {formatCurrency(progress.totalSavings)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
