import { useEffect, useState, useRef } from 'react';
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

function useCountUp(target, duration = 800, delay = 0) {
    const [value, setValue] = useState(0);
    const frameRef = useRef(null);

    useEffect(() => {
        if (target === 0) { setValue(0); return; }
        let startTime = null;

        const tick = (timestamp) => {
            if (!startTime) startTime = timestamp + delay;
            if (timestamp < startTime) { frameRef.current = requestAnimationFrame(tick); return; }
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            setValue(Math.abs(target) * eased);
            if (progress < 1) frameRef.current = requestAnimationFrame(tick);
            else setValue(Math.abs(target));
        };

        frameRef.current = requestAnimationFrame(tick);
        return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
    }, [target, duration, delay]);

    return value;
}

function AnimatedCurrency({ target, delay, className }) {
    const raw = useCountUp(target, 800, delay);
    const formatted = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })
        .format(raw).replace('ILS', '₪');
    return <span className={className}>{formatted}</span>;
}

function AnimatedPercent({ target, delay, className }) {
    const raw = useCountUp(target, 800, delay);
    return <span className={className}>{Math.round(raw)}%</span>;
}

export default function Overview() {
    const [metrics, setMetrics] = useState({
        totalBalance: 0, spending: 0, income: 0, net: 0, savingsRate: 0, totalDeposits: 0,
    });
    const [progress, setProgress] = useState(null);
    const [mounted, setMounted] = useState(false);

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

            setMetrics({ totalBalance: totalBal, spending: Math.abs(spd), income: inc, net: inc - Math.abs(spd), savingsRate, totalDeposits: deposits });
            setProgress(progressData);
        } catch (e) { console.error('Error formatting overview data', e); }

        requestAnimationFrame(() => setMounted(true));
    }, []);

    const avgCashflow = progress?.averageCashflows || 0;
    const progressStatus = progress?.progressState?.progressStatus || '';
    const statusLabel = PROGRESS_STATUS_LABELS[progressStatus] || progressStatus;
    const isHealthy = progress?.progressState?.currentOshIsPositive && avgCashflow > -5000;

    const cards = [
        {
            icon: <CreditCard size={18} />, iconColor: 'var(--accent-primary)', label: 'Total Balance',
            sub: 'Across all connected accounts', isNegative: false,
            render: (d) => <AnimatedCurrency target={metrics.totalBalance} delay={d} />,
        },
        {
            icon: <TrendingUp size={18} />, iconColor: 'var(--accent-success)', label: 'Monthly Income',
            sub: 'Current month', isNegative: false,
            render: (d) => <AnimatedCurrency target={metrics.income} delay={d} className="positive" />,
        },
        {
            icon: <TrendingDown size={18} />, iconColor: 'var(--accent-danger)', label: 'Monthly Spending',
            sub: 'Current month', isNegative: true,
            render: (d) => <AnimatedCurrency target={metrics.spending} delay={d} className="negative" />,
        },
        {
            icon: <DollarSign size={18} />, iconColor: 'var(--accent-purple)', label: 'Net Cash Flow',
            sub: 'Income minus spending', isNegative: metrics.net < 0,
            render: (d) => (
                <span className={metrics.net >= 0 ? 'positive' : 'negative'}>
                    {metrics.net > 0 ? '+' : metrics.net < 0 ? '-' : ''}
                    <AnimatedCurrency target={Math.abs(metrics.net)} delay={d} />
                </span>
            ),
        },
        {
            icon: <Percent size={18} />, iconColor: 'var(--accent-warning)', label: 'Avg Savings Rate',
            sub: 'Based on avg monthly savings', isNegative: metrics.savingsRate <= 0,
            render: (d) => (
                <AnimatedPercent
                    target={metrics.savingsRate} delay={d}
                    className={metrics.savingsRate >= 10 ? 'positive' : metrics.savingsRate > 0 ? 'neutral' : 'negative'}
                />
            ),
        },
        {
            icon: <PiggyBank size={18} />, iconColor: 'var(--accent-success)', label: 'Total Deposits',
            sub: 'Savings accounts & deposits', isNegative: false,
            render: (d) => <AnimatedCurrency target={metrics.totalDeposits} delay={d} className="positive" />,
        },
    ];

    return (
        <div className="overview-container">
            <div className="metrics-grid">
                {cards.map(({ icon, iconColor, label, sub, isNegative, render }, i) => (
                    <div
                        key={label}
                        className={`metric-card glass-panel${isNegative ? ' metric-card-negative' : ''}`}
                        style={{
                            opacity: mounted ? 1 : 0,
                            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                            transition: `opacity 0.45s ease ${i * 0.07}s, transform 0.45s ease ${i * 0.07}s`,
                        }}
                    >
                        <div className="metric-header">
                            <div className="metric-icon flex-center" style={{ color: iconColor }}>{icon}</div>
                            <span>{label}</span>
                        </div>
                        <div className="metric-value">
                            {mounted ? render(i * 70) : '₪0'}
                        </div>
                        <div className="text-muted" style={{ fontSize: '12px' }}>{sub}</div>
                    </div>
                ))}
            </div>

            {progress && (
                <div
                    className="glass-panel"
                    style={{
                        marginTop: '24px', padding: '24px',
                        opacity: mounted ? 1 : 0,
                        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                        transition: 'opacity 0.45s ease 0.5s, transform 0.45s ease 0.5s',
                    }}
                >
                    <div className="flex-between" style={{ marginBottom: '20px' }}>
                        <h3 style={{ fontWeight: 600 }}>Financial Health</h3>
                        <span className={`health-score-badge ${isHealthy ? 'good' : avgCashflow > -30000 ? 'warn' : 'bad'}`}>
                            {isHealthy ? '✓ On Track' : avgCashflow > -30000 ? '⚠ Watch Spending' : '✕ Needs Attention'}
                        </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>{statusLabel}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        {[
                            { label: 'Avg Monthly Cashflow', value: formatCurrency(avgCashflow), color: avgCashflow >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' },
                            { label: 'Positive Months', value: progress.positiveCashflowsCount, color: 'var(--text-primary)' },
                            { label: 'Avg Monthly Savings', value: formatCurrency(progress.averageSavings), color: 'var(--accent-success)' },
                            { label: 'Total Savings', value: formatCurrency(progress.totalSavings), color: 'var(--accent-success)' },
                        ].map(({ label, value, color }) => (
                            <div key={label} style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</div>
                                <div style={{ fontSize: '20px', fontWeight: 600, color }}>{value}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
