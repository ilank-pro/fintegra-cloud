import { useEffect, useState, useRef, useMemo } from 'react';
import { CreditCard, TrendingUp, TrendingDown, DollarSign, PiggyBank, Percent, BarChart3, Flame, Trophy, Zap, Info } from 'lucide-react';
import balanceData from '../data/balance.json';
import progressData from '../data/progress.json';
import trajectoryData from '../data/trajectory.json';
import healthScoreData from '../data/health-score.json';

// Hover tooltip component
function Tooltip({ text, children }) {
    const [show, setShow] = useState(false);
    return (
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
            onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            {children}
            {show && (
                <div style={{
                    position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                    marginBottom: '8px', padding: '10px 14px', borderRadius: '10px',
                    background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e2e8f0', fontSize: '12px', lineHeight: 1.5, whiteSpace: 'normal',
                    width: '240px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    pointerEvents: 'none', textAlign: 'left',
                }}>
                    {text}
                    <div style={{
                        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                        width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
                        borderTop: '6px solid rgba(15,23,42,0.95)',
                    }} />
                </div>
            )}
        </span>
    );
}

const formatCurrency = (val) => {
    if (val === undefined || val === null) return '₪0';
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
    'ארנונה': 'Property Tax', 'דיור': 'Housing', 'סליקת אשראי': 'Credit Clearing',
    'משכורת': 'Salary', 'קצבאות': 'Benefits',
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
            const eased = 1 - Math.pow(1 - progress, 3);
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

export default function Overview({ selectedMonths, availableMonths }) {
    const [mounted, setMounted] = useState(false);
    const [pendingOpen, setPendingOpen] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setMounted(true));
    }, []);

    const metrics = useMemo(() => {
        const selected = (availableMonths || []).filter(d => selectedMonths.has(d.month));
        if (selected.length === 0) return { totalBalance: 0, spending: 0, income: 0, net: 0, savingsRate: 0, totalDeposits: 0, monthCount: 0 };

        const totalIncome = selected.reduce((s, d) => s + d.income, 0);
        const totalExpenses = selected.reduce((s, d) => s + d.expenses, 0);
        const totalNet = selected.reduce((s, d) => s + d.net, 0);

        const balancesArr = balanceData?.balances || [];
        const totalBal = balancesArr.reduce((acc, a) => acc + (Number(a.balance) || 0), 0);
        const deposits = (balanceData?.financialSummary?.savingsAccounts || [])
            .reduce((acc, s) => acc + (Number(s.balanceAmount?.amount) || 0), 0);

        const avgIncome = totalIncome / selected.length;
        const avgSavings = progressData?.averageSavings || 0;
        const savingsRate = avgIncome > 0 ? Math.round((avgSavings / avgIncome) * 100) : 0;

        return {
            totalBalance: totalBal,
            spending: Math.abs(totalExpenses),
            income: totalIncome,
            net: totalNet,
            savingsRate,
            totalDeposits: deposits,
            monthCount: selected.length,
        };
    }, [selectedMonths, availableMonths]);

    const isMultiMonth = metrics.monthCount > 1;

    const progress = progressData;
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
            icon: <TrendingUp size={18} />, iconColor: 'var(--accent-success)',
            label: isMultiMonth ? 'Total Income' : 'Monthly Income',
            sub: isMultiMonth ? `${metrics.monthCount} months combined` : 'Selected month',
            isNegative: false,
            render: (d) => <AnimatedCurrency target={metrics.income} delay={d} className="positive" />,
        },
        {
            icon: <TrendingDown size={18} />, iconColor: 'var(--accent-danger)',
            label: isMultiMonth ? 'Total Spending' : 'Monthly Spending',
            sub: isMultiMonth ? `${metrics.monthCount} months combined` : 'Selected month',
            isNegative: true,
            render: (d) => <AnimatedCurrency target={metrics.spending} delay={d} className="negative" />,
        },
        {
            icon: <DollarSign size={18} />, iconColor: 'var(--accent-purple)',
            label: isMultiMonth ? 'Total Net Cash Flow' : 'Net Cash Flow',
            sub: isMultiMonth ? `${metrics.monthCount} months combined` : 'Income minus spending',
            isNegative: metrics.net < 0,
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

    // Score tooltips — actionable advice for each dimension
    const scoreTooltips = {
        cashFlow: `Cash Flow Score measures if you're spending less than you earn. Your avg net/income ratio determines this score. To improve: reduce variable expenses (dining out, shopping) or increase income. Target: positive net cashflow every month.`,
        emergencyFund: `Emergency Fund Score measures how many months you can survive without income. It's calculated as liquid assets / avg monthly expenses. Target: 6 months of expenses saved. Even small monthly additions compound quickly.`,
        budgetAdherence: `Budget Adherence Score measures how well you stick to budgeted amounts. Each category is compared to its budget — weighted by size. To improve: review categories where you consistently overshoot and adjust either spending or budget targets.`,
        savingsGrowth: `Savings Growth Score measures if your savings are growing. It looks at your avg monthly savings rate relative to income. Target: save at least 5% of income monthly. Automate savings transfers to make this effortless.`,
    };

    const scoreLabels = [
        { key: 'cashFlow', label: 'Cash Flow', color: '#3b82f6' },
        { key: 'emergencyFund', label: 'Emergency Fund', color: '#8b5cf6' },
        { key: 'budgetAdherence', label: 'Budget Adherence', color: '#10b981' },
        { key: 'savingsGrowth', label: 'Savings Growth', color: '#f59e0b' },
    ];

    return (
        <div className="overview-container">
            {/* Financial Health Score — TOP OF PAGE */}
            {healthScoreData && (() => {
                const hs = healthScoreData;
                const gradeColor = hs.grade === 'A' ? 'var(--accent-success)' : hs.grade === 'B' ? 'var(--accent-primary)' : hs.grade === 'C' ? 'var(--accent-warning)' : 'var(--accent-danger)';

                const ringSize = 130;
                const ringStroke = 10;
                const ringRadius = (ringSize - ringStroke) / 2;
                const ringCircumference = 2 * Math.PI * ringRadius;
                const ringOffset = ringCircumference * (1 - hs.composite / 100);

                return (
                    <div
                        className="glass-panel"
                        style={{
                            padding: '24px', marginBottom: '24px',
                            opacity: mounted ? 1 : 0,
                            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                            transition: 'opacity 0.35s ease, transform 0.35s ease',
                        }}
                    >
                        <div style={{ display: 'flex', gap: '28px', alignItems: 'flex-start' }}>
                            {/* Left: Score ring + level */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                                <Tooltip text="Your overall financial health score (0-100) is a weighted average of 4 dimensions: Cash Flow (30%), Emergency Fund (25%), Budget Adherence (25%), and Savings Growth (20%). Improve any dimension to raise your grade.">
                                    <div style={{ position: 'relative', cursor: 'help' }}>
                                        <svg width={ringSize} height={ringSize} style={{ transform: 'rotate(-90deg)' }}>
                                            <circle cx={ringSize/2} cy={ringSize/2} r={ringRadius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={ringStroke} />
                                            <circle cx={ringSize/2} cy={ringSize/2} r={ringRadius} fill="none" stroke={gradeColor} strokeWidth={ringStroke}
                                                strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} strokeLinecap="round"
                                                style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)' }} />
                                        </svg>
                                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                                            <div style={{ fontSize: '36px', fontWeight: 800, color: gradeColor, lineHeight: 1 }}>{hs.grade}</div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>{hs.composite}/100</div>
                                        </div>
                                    </div>
                                </Tooltip>
                                {/* Level */}
                                <Tooltip text={`Level ${hs.level}: ${hs.levelTitle}. Your level is based on your composite score. Reach score ${hs.level * 10 + 1} to advance to the next level. Keep improving your weakest dimension!`}>
                                    <div style={{ marginTop: '12px', textAlign: 'center', cursor: 'help' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Level {hs.level}</div>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)' }}>{hs.levelTitle}</div>
                                        <div style={{ width: '90px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', marginTop: '4px' }}>
                                            <div style={{ width: `${hs.xpInLevel * 10}%`, height: '100%', borderRadius: '2px', background: 'var(--accent-primary)', transition: 'width 0.6s ease' }} />
                                        </div>
                                    </div>
                                </Tooltip>
                            </div>

                            {/* Middle: Sub-scores with tooltips */}
                            <div style={{ flex: 1 }}>
                                <div className="flex-between" style={{ marginBottom: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 style={{ fontWeight: 600 }}>Financial Health</h3>
                                        <Tooltip text="This scorecard tracks 4 key dimensions of your financial wellness. Hover over each bar for specific advice on how to improve that area.">
                                            <Info size={14} color="var(--text-muted)" style={{ cursor: 'help' }} />
                                        </Tooltip>
                                    </div>
                                    {hs.streak > 0 && (
                                        <Tooltip text={`You've had ${hs.streak} consecutive month(s) with positive net cash flow. Keep the streak going! A longer streak means more financial stability.`}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', cursor: 'help' }}>
                                                <Flame size={14} color="var(--accent-warning)" />
                                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-warning)' }}>{hs.streak}-month streak</span>
                                            </div>
                                        </Tooltip>
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {scoreLabels.map(({ key, label, color }) => {
                                        const value = hs.scores[key];
                                        const valColor = value >= 60 ? 'var(--accent-success)' : value >= 30 ? 'var(--accent-warning)' : 'var(--accent-danger)';
                                        return (
                                            <Tooltip key={key} text={scoreTooltips[key]}>
                                                <div style={{ width: '100%', cursor: 'help' }}>
                                                    <div className="flex-between" style={{ marginBottom: '3px' }}>
                                                        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</span>
                                                        <span style={{ fontSize: '12px', fontWeight: 700, color: valColor }}>{value}/100</span>
                                                    </div>
                                                    <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)' }}>
                                                        <div style={{ height: '100%', borderRadius: '3px', width: `${value}%`, background: color, opacity: 0.75, transition: 'width 0.8s ease' }} />
                                                    </div>
                                                </div>
                                            </Tooltip>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Right: Challenge + badges */}
                            <div style={{ width: '220px', flexShrink: 0 }}>
                                {/* Active Challenge */}
                                <Tooltip text={`This challenge targets your weakest area: ${hs.challenge.weakestDim} (score: ${hs.challenge.weakestScore}). Completing it will have the biggest impact on your overall score.`}>
                                    <div style={{ padding: '14px', background: 'rgba(139,92,246,0.06)', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.15)', marginBottom: '12px', cursor: 'help' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                            <Zap size={14} color="var(--accent-purple)" />
                                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-purple)' }}>Monthly Challenge</span>
                                        </div>
                                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{hs.challenge.title}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{hs.challenge.desc}</div>
                                    </div>
                                </Tooltip>

                                {/* Badges with names */}
                                <div style={{ padding: '10px' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
                                        Badges ({hs.badges.filter(b => b.earned).length}/{hs.badges.length})
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {hs.badges.map(b => (
                                            <Tooltip key={b.id} text={`${b.name}: ${b.desc}${b.earned ? ' (Earned!)' : ' (Not yet earned — keep working toward it!)'}`}>
                                                <span style={{
                                                    fontSize: '18px', cursor: 'help',
                                                    opacity: b.earned ? 1 : 0.2,
                                                    filter: b.earned ? 'none' : 'grayscale(1)',
                                                }}>
                                                    {b.icon}
                                                </span>
                                            </Tooltip>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* EOM Cash Flow Projection */}
            {trajectoryData?.cashflow && (() => {
                const traj = trajectoryData;
                const cf = traj.cashflow;
                const pctElapsed = traj.pctMonthElapsed || 0;
                const [showPending, setShowPending] = [pendingOpen, setPendingOpen];

                const maxBar = Math.max(cf.totalIncome, cf.totalExpenses) || 1;
                const incActualPct = (cf.actualIncome / maxBar) * 100;
                const incExpectedPct = (cf.expectedIncome / maxBar) * 100;
                const expActualPct = (cf.actualExpenses / maxBar) * 100;
                const expExpectedPct = (cf.expectedExpenses / maxBar) * 100;

                return (
                    <div
                        className="glass-panel"
                        style={{
                            padding: '24px', marginBottom: '24px',
                            opacity: mounted ? 1 : 0,
                            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                            transition: 'opacity 0.45s ease 0.4s, transform 0.45s ease 0.4s',
                        }}
                    >
                        <div className="flex-between" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <BarChart3 size={18} color="var(--accent-primary)" />
                                <h3 style={{ fontWeight: 600 }}>EOM Cash Flow Projection</h3>
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {traj.budgetDate} · Day {traj.daysElapsed}/{traj.daysInMonth}
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                            <div style={{ padding: '16px', background: 'rgba(0,255,159,0.04)', borderRadius: '10px', border: '1px solid rgba(0,255,159,0.12)' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Projected Income</div>
                                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--accent-success)', marginBottom: '4px' }}>{formatCurrency(cf.totalIncome)}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {formatCurrency(cf.actualIncome)} received
                                    {cf.expectedIncome > 0 && <> + {formatCurrency(cf.expectedIncome)} expected</>}
                                </div>
                            </div>
                            <div style={{ padding: '16px', background: 'rgba(255,0,85,0.04)', borderRadius: '10px', border: '1px solid rgba(255,0,85,0.12)' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Projected Expenses</div>
                                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--accent-danger)', marginBottom: '4px' }}>{formatCurrency(cf.totalExpenses)}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {formatCurrency(cf.actualExpenses)} spent + {formatCurrency(cf.expectedExpenses)} expected
                                </div>
                            </div>
                            <div style={{ padding: '16px', background: cf.projectedNet >= 0 ? 'rgba(0,255,159,0.04)' : 'rgba(255,0,85,0.04)', borderRadius: '10px', border: `1px solid ${cf.projectedNet >= 0 ? 'rgba(0,255,159,0.12)' : 'rgba(255,0,85,0.12)'}` }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Projected Net</div>
                                <div style={{ fontSize: '22px', fontWeight: 800, color: cf.projectedNet >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', marginBottom: '4px' }}>
                                    {cf.projectedNet >= 0 ? '+' : ''}{formatCurrency(cf.projectedNet)}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>by end of month</div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                            <div>
                                <div className="flex-between" style={{ marginBottom: '4px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-success)' }}>Income</span>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatCurrency(cf.totalIncome)}</span>
                                </div>
                                <div style={{ height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,0.05)', display: 'flex', overflow: 'hidden' }}>
                                    <div style={{ width: `${incActualPct}%`, background: 'var(--accent-success)', opacity: 0.8, transition: 'width 0.6s ease' }} />
                                    {incExpectedPct > 0 && <div style={{ width: `${incExpectedPct}%`, background: 'var(--accent-success)', opacity: 0.25, borderLeft: '1px dashed rgba(255,255,255,0.2)' }} />}
                                </div>
                            </div>
                            <div>
                                <div className="flex-between" style={{ marginBottom: '4px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-danger)' }}>Expenses</span>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatCurrency(cf.totalExpenses)}</span>
                                </div>
                                <div style={{ height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,0.05)', display: 'flex', overflow: 'hidden' }}>
                                    <div style={{ width: `${expActualPct}%`, background: 'var(--accent-danger)', opacity: 0.8, transition: 'width 0.6s ease' }} />
                                    <div style={{ width: `${expExpectedPct}%`, background: 'var(--accent-danger)', opacity: 0.25, borderLeft: '1px dashed rgba(255,255,255,0.2)' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', fontSize: '10px', color: 'var(--text-muted)' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '12px', height: '6px', borderRadius: '3px', background: 'var(--text-muted)', opacity: 0.8 }} /> Actual</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '12px', height: '6px', borderRadius: '3px', background: 'var(--text-muted)', opacity: 0.25 }} /> Expected</span>
                            </div>
                        </div>

                        {cf.pendingExpenses?.length > 0 && (
                            <div>
                                <button
                                    onClick={() => setPendingOpen(v => !v)}
                                    style={{
                                        background: 'none', border: '1px solid var(--border-light)', borderRadius: '8px',
                                        color: 'var(--text-secondary)', padding: '8px 14px', cursor: 'pointer', width: '100%',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                                    }}
                                >
                                    <span>Upcoming Expenses ({cf.pendingExpenses.length} items · {formatCurrency(cf.expectedExpenses)})</span>
                                    <span style={{ fontSize: '10px' }}>{showPending ? '▲' : '▼'}</span>
                                </button>
                                {showPending && (
                                    <div style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                        {cf.pendingExpenses.map((item, i) => (
                                            <div key={i} className="flex-between" style={{ padding: '6px 8px', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', minWidth: '65px' }}>
                                                        {item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                                    </span>
                                                    <span style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                                                </div>
                                                <span style={{ fontWeight: 600 }}>{formatCurrency(item.amount)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })()}

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
                            <div className="metric-icon flex-center" style={{
                                color: iconColor,
                                background: 'rgba(10, 12, 16, 0.3)',
                                boxShadow: `0 0 15px ${iconColor}22`
                            }}>{icon}</div>
                            <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</span>
                        </div>
                        <div className="metric-value" style={{ fontWeight: 800, letterSpacing: '-1.5px', marginTop: '4px' }}>
                            {mounted ? render(i * 70) : '₪0'}
                        </div>
                        <div className="text-muted" style={{ fontSize: '11px', fontWeight: 500, opacity: 0.8 }}>{sub}</div>
                    </div>
                ))}
            </div>

            {/* (Health score moved to top of page) */}
        </div>
    );
}
