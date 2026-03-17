import { useState, useMemo, useCallback, useEffect } from 'react';
import './index.css';
import { LayoutDashboard, Wallet, ArrowRightLeft, Lightbulb, BarChart2, PieChart, SlidersHorizontal, CalendarDays, RefreshCw, Sun, Moon, BriefcaseBusiness, Pin, PinOff, PiggyBank } from 'lucide-react';
import Overview from './components/Overview';
import CashFlow from './components/CashFlow';
import Transactions from './components/Transactions';
import Insights from './components/Insights';
import SpendingBreakdown from './components/SpendingBreakdown';
import Simulations from './components/Simulations';
import Advisor from './components/Advisor';
import Pension from './components/Pension';
import trendsData from './data/trends.json';
import transactionsData from './data/transactions.json';
import spendingData from './data/spending.json';
import incomeData from './data/income.json';
import { getBudgetMonth } from './utils/budgetMonth';

function monthLabel(m: string) {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function buildAvailableMonths() {
    const months: Record<string, { month: string; income: number; expenses: number; net: number; source: string }> = {};

    if (Array.isArray(trendsData)) {
        for (const t of trendsData) {
            months[t.month] = { month: t.month, income: t.income || 0, expenses: t.expenses || 0, net: t.net || 0, source: 'trends' };
        }
    }

    if (Array.isArray(transactionsData)) {
        const txnByMonth: Record<string, { income: number; expenses: number }> = {};
        for (const t of transactionsData) {
            const m = getBudgetMonth(t as any);
            if (!m) continue;
            if (!txnByMonth[m]) txnByMonth[m] = { income: 0, expenses: 0 };
            if ((t as any).isIncome) txnByMonth[m].income += (t as any).amount || 0;
            else txnByMonth[m].expenses += (t as any).amount || 0;
        }
        for (const [m, data] of Object.entries(txnByMonth)) {
            if (!months[m]) {
                months[m] = { month: m, income: data.income, expenses: data.expenses, net: data.income - data.expenses, source: 'transactions' };
            }
        }
    }

    // Current month from spending/income if not already present
    const currentIncome = Array.isArray(incomeData) ? (incomeData as any[]).reduce((s, i) => s + (Number(i.amount) || 0), 0) : 0;
    const currentSpending = Array.isArray(spendingData) ? (spendingData as any[]).reduce((s, c) => s + (Number(c.total) || 0), 0) : 0;
    let currentMonth: string | null = null;
    if (Array.isArray(incomeData)) {
        const dates = (incomeData as any[]).map(i => i.date).filter(Boolean).sort();
        if (dates.length > 0) currentMonth = dates[dates.length - 1].slice(0, 7);
    }
    if (!currentMonth && Array.isArray(transactionsData)) {
        const dates = (transactionsData as any[]).map(t => t.date).filter(Boolean).sort();
        if (dates.length > 0) currentMonth = dates[dates.length - 1].slice(0, 7);
    }
    if (currentMonth && !months[currentMonth]) {
        months[currentMonth] = { month: currentMonth, income: currentIncome, expenses: currentSpending, net: currentIncome - currentSpending, source: 'current' };
    }

    return Object.values(months).sort((a, b) => b.month.localeCompare(a.month));
}

function App() {
    const [activeTab, setActiveTab] = useState('overview');
    const [theme, setTheme] = useState<'dark' | 'light'>(() => {
        return (localStorage.getItem('fintegra-theme') as 'dark' | 'light') || 'dark';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('fintegra-theme', theme);
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme(t => t === 'dark' ? 'light' : 'dark');
    }, []);

    const availableMonths = useMemo(() => buildAvailableMonths(), []);
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(() => {
        if (availableMonths.length > 0) return new Set([availableMonths[0].month]);
        return new Set();
    });

    const [refreshing, setRefreshing] = useState(false);
    const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
    const [drillCategory, setDrillCategory] = useState<string | null>(null);
    const [monthBarPinned, setMonthBarPinned] = useState(false);

    const toggleMonth = useCallback((m: string, e: React.MouseEvent) => {
        if (e.metaKey || e.ctrlKey) {
            // Cmd/Ctrl+Click: toggle this month while keeping others
            setSelectedMonths(prev => {
                const next = new Set(prev);
                if (next.has(m)) {
                    if (next.size > 1) next.delete(m);
                } else {
                    next.add(m);
                }
                return next;
            });
        } else {
            // Plain click: select only this month
            setSelectedMonths(new Set([m]));
        }
    }, []);

    const selectAll = useCallback(() => setSelectedMonths(new Set(availableMonths.map(d => d.month))), [availableMonths]);
    const selectLatest = useCallback(() => {
        if (availableMonths.length > 0) setSelectedMonths(new Set([availableMonths[0].month]));
    }, [availableMonths]);

    const handleRefresh = async () => {
        setRefreshing(true);
        setRefreshMsg(null);
        try {
            const res = await fetch('/api/refresh-data');
            const data = await res.json();
            if (data.ok) {
                setRefreshMsg(data.errors?.length ? `Updated (${data.errors.length} warnings) — reloading...` : 'Data updated — reloading...');
                setTimeout(() => window.location.reload(), 800);
            } else {
                const errMsg = data.error?.includes('CLI not built') ? 'CLI not built — run setup first' : 'Refresh failed — check login session';
                setRefreshMsg(errMsg);
                setTimeout(() => setRefreshMsg(null), 5000);
            }
        } catch {
            setRefreshMsg('Refresh failed — server unreachable');
            setTimeout(() => setRefreshMsg(null), 4000);
        } finally {
            setRefreshing(false);
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'overview': return <Overview selectedMonths={selectedMonths} availableMonths={availableMonths} />;
            case 'cashflow': return <CashFlow selectedMonths={selectedMonths} />;
            case 'spending': return <SpendingBreakdown selectedMonths={selectedMonths} onCategoryClick={(cat: string) => { setDrillCategory(cat); setActiveTab('transactions'); }} />;
            case 'transactions': return <Transactions selectedMonths={selectedMonths} drillCategory={drillCategory} onDrillClear={() => setDrillCategory(null)} />;
            case 'insights': return <Insights selectedMonths={selectedMonths} />;
            case 'simulations': return <Simulations selectedMonths={selectedMonths} />;
            case 'advisor': return <Advisor />;
            case 'pension': return <Pension />;
            default: return <Overview selectedMonths={selectedMonths} availableMonths={availableMonths} />;
        }
    };

    const headerTitle: Record<string, string> = {
        overview: 'Financial Overview',
        cashflow: 'Cash Flow Analytics',
        spending: 'Spending by Category',
        transactions: 'Recent Transactions',
        insights: 'Insights & Progress',
        simulations: 'Simulations',
        advisor: 'Financial Advisor',
        pension: 'Savings & Pension',
    };

    return (
        <div className="dashboard-layout">
            {/* Sidebar */}
            <aside className="sidebar glass-panel">
                <div className="logo-container">
                    <div className="logo-icon flex-center">
                        <PieChart size={24} color="var(--accent-primary)" />
                    </div>
                    <h1 className="logo-text text-gradient">Fintegra</h1>
                </div>

                <nav className="nav-menu">
                    {[
                        { id: 'overview', icon: <LayoutDashboard size={20} />, label: 'Overview' },
                        { id: 'cashflow', icon: <Wallet size={20} />, label: 'Cash Flow' },
                        { id: 'spending', icon: <BarChart2 size={20} />, label: 'Spending' },
                        { id: 'transactions', icon: <ArrowRightLeft size={20} />, label: 'Transactions' },
                        { id: 'insights', icon: <Lightbulb size={20} />, label: 'Insights' },
                        { id: 'simulations', icon: <SlidersHorizontal size={20} />, label: 'Simulations' },
                        { id: 'pension', icon: <PiggyBank size={20} />, label: 'Pension' },
                        { id: 'advisor', icon: <BriefcaseBusiness size={20} />, label: 'Advisor' },
                    ].map(({ id, icon, label }) => (
                        <button
                            key={id}
                            className={`nav-item ${activeTab === id ? 'active' : ''}`}
                            onClick={() => setActiveTab(id)}
                        >
                            {icon}
                            <span>{label}</span>
                        </button>
                    ))}
                </nav>

                <button onClick={toggleTheme} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 16px', marginBottom: '16px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-light)',
                    borderRadius: '10px', color: 'var(--text-secondary)', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.2s',
                    width: '100%',
                }}>
                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>

                <div className="user-profile">
                    <div className="avatar flex-center">IK</div>
                    <div className="user-info">
                        <span className="user-name">Ilan Kor</span>
                        <span className="user-status text-success">Logged In</span>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                <header className="top-header flex-between animate-fade-in">
                    <h2>{headerTitle[activeTab] || 'Dashboard'}</h2>
                    <div className="date-badge glass-panel">
                        {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                </header>

                {/* Global Month Selector */}
                <div className="glass-panel animate-fade-in" style={{
                    padding: '8px 16px', marginBottom: '12px',
                    display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
                    ...(monthBarPinned ? { position: 'sticky' as const, top: 0, zIndex: 10 } : {}),
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', flexShrink: 0 }}>
                        <CalendarDays size={14} />
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>Period</span>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', flex: 1, overflowX: 'auto', flexShrink: 1, minWidth: 0 }}>
                        {availableMonths.map(d => {
                            const isSelected = selectedMonths.has(d.month);
                            return (
                                <button
                                    key={d.month}
                                    onClick={(e) => toggleMonth(d.month, e)}
                                    style={{
                                        padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                                        whiteSpace: 'nowrap', flexShrink: 0,
                                        border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-light)',
                                        background: isSelected ? 'rgba(0,240,255,0.12)' : 'rgba(255,255,255,0.03)',
                                        color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)',
                                    }}
                                >
                                    {monthLabel(d.month)}
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                        <button onClick={selectAll} style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                            border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.03)',
                            color: selectedMonths.size === availableMonths.length ? 'var(--accent-primary)' : 'var(--text-muted)',
                        }}>All</button>
                        <button onClick={selectLatest} style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                            border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.03)',
                            color: selectedMonths.size === 1 && availableMonths.length > 0 && selectedMonths.has(availableMonths[0].month) ? 'var(--accent-primary)' : 'var(--text-muted)',
                        }}>Latest</button>

                        <div style={{ width: '1px', height: '20px', background: 'var(--border-light)', margin: '0 2px' }} />

                        <button onClick={handleRefresh} disabled={refreshing} style={{
                            padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                            cursor: refreshing ? 'wait' : 'pointer', fontFamily: 'inherit',
                            border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)',
                            color: 'var(--accent-success)',
                            display: 'flex', alignItems: 'center', gap: '5px',
                            opacity: refreshing ? 0.7 : 1, transition: 'opacity 0.2s',
                        }}>
                            <RefreshCw size={11} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>

                        {refreshMsg && (
                            <span style={{ fontSize: '11px', fontWeight: 600, color: refreshMsg.includes('failed') ? 'var(--accent-danger)' : 'var(--accent-success)' }}>
                                {refreshMsg}
                            </span>
                        )}

                        <button onClick={() => setMonthBarPinned(p => !p)} title={monthBarPinned ? 'Unpin bar' : 'Pin bar to top'} style={{
                            padding: '4px', borderRadius: '6px', fontSize: '11px',
                            cursor: 'pointer', fontFamily: 'inherit',
                            border: monthBarPinned ? '1px solid var(--accent-primary)' : '1px solid var(--border-light)',
                            background: monthBarPinned ? 'rgba(0,240,255,0.12)' : 'rgba(255,255,255,0.03)',
                            color: monthBarPinned ? 'var(--accent-primary)' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center',
                            transition: 'all 0.2s',
                        }}>
                            {monthBarPinned ? <PinOff size={12} /> : <Pin size={12} />}
                        </button>
                    </div>
                </div>

                <div className="content-area animate-fade-in" style={{ animationDelay: '0.1s' }}>
                    {renderContent()}
                </div>
            </main>
        </div>
    );
}

export default App;
