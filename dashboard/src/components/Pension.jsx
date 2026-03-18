import { useState, useMemo } from 'react';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { PiggyBank, Upload, TrendingUp, Clock, Shield, Plus, Trash2, Save } from 'lucide-react';
import initialHistory from '../data/pension-history.json';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const DEFAULT_AGE = 53;

const formatCurrency = (val) => {
    if (!val && val !== 0) return '₪0';
    if (Math.abs(val) >= 1000000) return '₪' + (val / 1000000).toFixed(2) + 'M';
    if (Math.abs(val) >= 1000) return '₪' + (val / 1000).toFixed(0) + 'K';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(val).replace('ILS', '₪');
};

const formatFull = (val) => {
    if (!val && val !== 0) return '₪0';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(val).replace('ILS', '₪');
};

// Project a single account forward (with custom current age)
function projectAccountWithAge(account, retirementAge, currentAge = DEFAULT_AGE) {
    const growthYears = Math.max(0, Math.min(account.depositStopAge, retirementAge) - currentAge);
    const monthlyRate = (account.annualInterest / 100) / 12;
    const totalMonths = growthYears * 12;

    // Growth with deposits — both stop at depositStopAge
    let balance = account.currentBalance;
    for (let m = 0; m < totalMonths; m++) {
        balance *= (1 + monthlyRate);
        balance += account.monthlyDeposit;
    }
    return Math.round(balance);
}

// Build year-by-year trajectory for chart
function buildTrajectory(accounts, retirementAge, monthlySpending, currentAge = DEFAULT_AGE) {
    const maxAge = 90;
    const points = [];

    for (let age = currentAge; age <= maxAge; age++) {
        let total = 0;
        for (const acc of accounts) {
            const yearsFromNow = age - currentAge;
            const depositYears = Math.max(0, Math.min(acc.depositStopAge, retirementAge) - currentAge);
            const monthlyRate = (acc.annualInterest / 100) / 12;
            const months = yearsFromNow * 12;
            const depositMonths = depositYears * 12;

            let bal = acc.currentBalance;
            for (let m = 0; m < months; m++) {
                bal *= (1 + monthlyRate);
                if (m < depositMonths) bal += acc.monthlyDeposit;
                // Withdraw after retirement
                if (currentAge + m / 12 >= retirementAge) {
                    // Proportional withdrawal from this account
                    // Simplified: withdraw proportionally
                }
            }
            total += bal;
        }
        points.push({ age, total });
    }

    // Simpler approach: compute total at each age including drawdown
    const result = [];
    let runningTotal = 0;

    // Pre-compute total at each year
    for (let age = currentAge; age <= maxAge; age++) {
        if (age <= retirementAge) {
            // Growth phase
            let total = 0;
            for (const acc of accounts) {
                total += projectAccountToAge(acc, age, currentAge);
            }
            runningTotal = total;
        } else {
            // Drawdown phase — subtract spending, add interest on remaining
            const avgRate = accounts.length > 0 ? accounts.reduce((s, a) => s + a.annualInterest, 0) / accounts.length / 100 : 0.04;
            runningTotal = runningTotal * (1 + avgRate) - monthlySpending * 12;
            if (runningTotal < 0) runningTotal = 0;
        }
        result.push({ age, total: Math.round(runningTotal) });
    }
    return result;
}

function projectAccountToAge(account, targetAge, currentAge = DEFAULT_AGE) {
    const growthYears = Math.max(0, Math.min(account.depositStopAge, targetAge) - currentAge);
    const monthlyRate = (account.annualInterest / 100) / 12;
    const totalMonths = growthYears * 12;

    let balance = account.currentBalance;
    for (let m = 0; m < totalMonths; m++) {
        balance *= (1 + monthlyRate);
        balance += account.monthlyDeposit;
    }
    return balance;
}

const tooltipDefaults = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    titleColor: '#fff', bodyColor: '#cbd5e1',
    borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12,
};

const OWNERS = {
    ilan: { label: 'Ilan', age: 53, defaultRetirement: 63 },
    spouse: { label: 'Spouse', age: 51, defaultRetirement: 65 },
};

export default function Pension({ allAccounts, setAllAccounts, retirementAges, setRetirementAges }) {
    const [selectedOwners, setSelectedOwners] = useState(new Set(['ilan']));
    const [monthlySpending, setMonthlySpending] = useState(40000);
    const [importing, setImporting] = useState(false);
    const [history, setHistory] = useState(Array.isArray(initialHistory) ? initialHistory : []);
    const [showAddRow, setShowAddRow] = useState(false);
    const [newAccount, setNewAccount] = useState({ name: '', company: '', currentBalance: 0, annualInterest: 4, monthlyDeposit: 0, depositStopAge: 63, monthlyPension: 0 });
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });

    const isCombined = selectedOwners.size > 1;
    const activeOwner = isCombined ? 'ilan' : [...selectedOwners][0] || 'ilan'; // primary owner for imports/adds
    const ownerConfig = OWNERS[activeOwner] || OWNERS.ilan;
    const accounts = useMemo(() => allAccounts.filter(a => selectedOwners.has(a.owner || 'ilan')), [allAccounts, selectedOwners]);
    const retirementAge = isCombined ? Math.max(...[...selectedOwners].map(o => retirementAges[o] || 63)) : retirementAges[activeOwner];
    const setRetirementAge = (age) => {
        if (isCombined) {
            setRetirementAges(prev => Object.fromEntries([...selectedOwners].map(o => [o, age])));
        } else {
            setRetirementAges(prev => ({ ...prev, [activeOwner]: age }));
        }
        // Sync depositStopAge for all accounts of selected owner(s)
        setAllAccounts(prev => prev.map(a =>
            selectedOwners.has(a.owner || 'ilan') ? { ...a, depositStopAge: age } : a
        ));
    };

    // For combined view, use the youngest age (longest projection)
    const currentAge = isCombined
        ? Math.min(...[...selectedOwners].map(o => OWNERS[o]?.age || 53))
        : ownerConfig.age;

    const toggleOwner = (key, e) => {
        if (e.metaKey || e.ctrlKey) {
            setSelectedOwners(prev => {
                const next = new Set(prev);
                if (next.has(key)) { if (next.size > 1) next.delete(key); }
                else next.add(key);
                return next;
            });
        } else {
            setSelectedOwners(new Set([key]));
        }
    };

    // Computed values — project each account with its owner's age
    const totalToday = useMemo(() => accounts.reduce((s, a) => s + a.currentBalance, 0), [accounts]);
    const projections = useMemo(() => accounts.map(a => {
        const ownerAge = OWNERS[a.owner || 'ilan']?.age || 53;
        const ownerRet = retirementAges[a.owner || 'ilan'] || 63;
        return { ...a, projected: projectAccountWithAge(a, ownerRet, ownerAge) };
    }), [accounts, retirementAges]);
    const totalProjected = useMemo(() => projections.reduce((s, a) => s + a.projected, 0), [projections]);
    const totalMonthlyDeposit = useMemo(() => accounts.reduce((s, a) => s + a.monthlyDeposit, 0), [accounts]);

    // Sufficiency: drawdown from total projected
    const yearsLasting = useMemo(() => {
        if (monthlySpending <= 0 || accounts.length === 0) return 99;
        const avgRate = accounts.reduce((s, a) => s + a.annualInterest, 0) / accounts.length / 100;
        let bal = totalProjected;
        let years = 0;
        while (bal > 0 && years < 50) {
            bal = bal * (1 + avgRate) - monthlySpending * 12;
            years++;
        }
        return years;
    }, [totalProjected, monthlySpending, accounts]);

    const depletionAge = retirementAge + yearsLasting;

    // Max affordable monthly spending (savings last 25 years)
    const maxAffordable = useMemo(() => {
        if (accounts.length === 0) return 0;
        const avgRate = accounts.reduce((s, a) => s + a.annualInterest, 0) / accounts.length / 100;
        let lo = 0, hi = 200000;
        while (hi - lo > 100) {
            const mid = (lo + hi) / 2;
            let bal = totalProjected;
            let yrs = 0;
            while (bal > 0 && yrs < 50) { bal = bal * (1 + avgRate) - mid * 12; yrs++; }
            if (yrs >= 25) lo = mid; else hi = mid;
        }
        return Math.round(lo);
    }, [totalProjected, accounts]);

    // Chart data — ALL accounts in trajectory
    const chartData = useMemo(() => {
        // For combined view, build trajectory using each account's owner age
        const trajectoryAccounts = accounts.map(a => ({
            ...a,
            _ownerAge: OWNERS[a.owner || 'ilan']?.age || 53,
            _ownerRet: retirementAges[a.owner || 'ilan'] || 63,
        }));
        const trajectory = buildTrajectory(trajectoryAccounts, retirementAge, monthlySpending, currentAge);
        const labels = trajectory.map(p => String(p.age));
        const values = trajectory.map(p => p.total);

        // Split into growth and drawdown
        const retIdx = retirementAge - currentAge;
        const growthData = values.map((v, i) => i <= retIdx ? v : null);
        const drawdownData = values.map((v, i) => i >= retIdx ? v : null);

        return {
            labels,
            datasets: [
                {
                    label: 'Growth Phase',
                    data: growthData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16,185,129,0.1)',
                    fill: true, tension: 0.3, borderWidth: 2,
                    pointRadius: 0, spanGaps: false,
                },
                {
                    label: 'Drawdown Phase',
                    data: drawdownData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245,158,11,0.08)',
                    fill: true, tension: 0.3, borderWidth: 2,
                    pointRadius: 0, spanGaps: false,
                },
            ],
        };
    }, [accounts, retirementAge, monthlySpending]);

    const chartOptions = {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'top', labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } } },
            tooltip: {
                ...tooltipDefaults,
                callbacks: {
                    title: (items) => `Age ${items[0].label}`,
                    label: (ctx) => ctx.raw !== null ? ` ${ctx.dataset.label}: ${formatFull(ctx.raw)}` : null,
                },
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: {
                    color: '#64748b',
                    callback: function(_, i) { return (currentAge + i) % 5 === 0 ? currentAge + i : ''; },
                },
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b', callback: (v) => '₪' + (v / 1000000).toFixed(1) + 'M' },
            },
        },
    };

    const handleSort = (key) => {
        setSortConfig(prev => prev.key === key
            ? { key, direction: prev.direction === 'desc' ? 'asc' : 'desc' }
            : { key, direction: 'desc' }
        );
    };

    const sortedProjections = useMemo(() => {
        if (!sortConfig.key) return projections;
        const sorted = [...projections].sort((a, b) => {
            const accessors = {
                name: x => (x.nameEn || '').toLowerCase(),
                company: x => (x.company || '').toLowerCase(),
                currentBalance: x => x.currentBalance || 0,
                annualInterest: x => x.annualInterest || 0,
                monthlyDeposit: x => x.monthlyDeposit || 0,
                depositStopAge: x => x.depositStopAge || 0,
                projected: x => x.projected || 0,
                monthlyPension: x => x.monthlyPension || 0,
            };
            const get = accessors[sortConfig.key];
            if (!get) return 0;
            const va = get(a), vb = get(b);
            const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
            return sortConfig.direction === 'asc' ? cmp : -cmp;
        });
        return sorted;
    }, [projections, sortConfig]);

    // Update account field
    const updateAccount = (id, field, value) => {
        setAllAccounts(prev => prev.map(a => a.id === id ? { ...a, [field]: Number(value) || 0 } : a));
    };

    // Import from XLS via file upload
    const handleImport = async (e) => {
        const file = e?.target?.files?.[0];
        if (!file) return;
        setImporting(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch(`/api/import-pension?owner=${activeOwner}`, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.ok && data.accounts) {
                setAllAccounts(data.accounts);
                if (data.history) setHistory(data.history);
            }
        } catch {} finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    // Add manual account
    const addManualAccount = () => {
        if (!newAccount.name) return;
        const id = 'manual-' + Date.now();
        setAllAccounts(prev => [...prev, { ...newAccount, id, nameEn: newAccount.name, type: 'manual', status: 'active', policy: '', managementFee: 0, owner: activeOwner }]);
        setNewAccount({ name: '', company: '', currentBalance: 0, annualInterest: 4, monthlyDeposit: 0, depositStopAge: retirementAge, monthlyPension: 0 });
        setShowAddRow(false);
    };

    // Delete account
    const deleteAccount = (id) => {
        setAllAccounts(prev => prev.filter(a => a.id !== id));
    };

    // Save snapshot to persistent history
    const [saving, setSaving] = useState(false);
    const saveSnapshot = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/save-pension-snapshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accounts: allAccounts }),
            });
            const data = await res.json();
            if (data.ok && data.history) setHistory(data.history);
        } catch {} finally {
            setTimeout(() => setSaving(false), 600);
        }
    };

    // History chart data — per-owner based on selected tabs
    const historyChartData = useMemo(() => {
        if (history.length === 0) return null;
        const labels = history.map(h => h.date);

        if (isCombined) {
            // Combined view: separate lines for each owner + dotted total
            return {
                labels,
                datasets: [
                    {
                        label: 'Ilan',
                        data: history.map(h => h.ownerTotals?.ilan || 0),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.06)',
                        pointStyle: 'star', pointRadius: 8, pointBackgroundColor: '#3b82f6',
                        borderWidth: 2, tension: 0.3,
                    },
                    {
                        label: 'Spouse',
                        data: history.map(h => h.ownerTotals?.spouse || 0),
                        borderColor: '#ec4899',
                        backgroundColor: 'rgba(236,72,153,0.06)',
                        pointStyle: 'circle', pointRadius: 6, pointBackgroundColor: '#ec4899',
                        borderWidth: 2, tension: 0.3,
                    },
                    {
                        label: 'Combined',
                        data: history.map(h => h.totalSavings || 0),
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139,92,246,0.05)',
                        borderDash: [6, 4], pointRadius: 0,
                        borderWidth: 2, tension: 0.3, fill: true,
                    },
                ],
            };
        }

        // Single owner view
        const owner = [...selectedOwners][0] || 'ilan';
        const color = owner === 'spouse' ? '#ec4899' : '#3b82f6';
        const style = owner === 'spouse' ? 'circle' : 'star';
        return {
            labels,
            datasets: [{
                label: OWNERS[owner]?.label || owner,
                data: history.map(h => h.ownerTotals?.[owner] || (owner === 'ilan' ? h.totalSavings : 0)),
                borderColor: color,
                backgroundColor: color.replace(')', ',0.08)').replace('rgb', 'rgba'),
                fill: true, tension: 0.3, borderWidth: 2,
                pointStyle: style, pointRadius: owner === 'spouse' ? 6 : 8, pointBackgroundColor: color,
            }],
        };
    }, [history, selectedOwners, isCombined]);

    const suffColor = yearsLasting >= 25 ? 'var(--accent-success)' : yearsLasting >= 15 ? 'var(--accent-warning)' : 'var(--accent-danger)';
    const suffPct = Math.min(100, (yearsLasting / 35) * 100);

    // Household totals (all owners combined)
    const householdToday = useMemo(() => allAccounts.reduce((s, a) => s + a.currentBalance, 0), [allAccounts]);
    const householdProjected = useMemo(() => {
        return allAccounts.reduce((s, a) => {
            const ownerAge = OWNERS[a.owner || 'ilan']?.age || 53;
            const ownerRet = retirementAges[a.owner || 'ilan'] || 63;
            return s + projectAccountWithAge(a, ownerRet, ownerAge);
        }, 0);
    }, [allAccounts, retirementAges]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Household Summary */}
            <div className="glass-panel" style={{ padding: '16px 20px', overflow: 'visible' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Household Total</div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-primary)' }}>{formatFull(householdToday)}</div>
                        </div>
                        <div style={{ width: '1px', height: '30px', background: 'var(--border-light)' }} />
                        <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Household Projected</div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-success)' }}>{formatFull(householdProjected)}</div>
                        </div>
                        <div style={{ width: '1px', height: '30px', background: 'var(--border-light)' }} />
                        <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Accounts</div>
                            <div style={{ fontSize: '16px', fontWeight: 700 }}>{allAccounts.filter(a => (a.owner || 'ilan') === 'ilan').length} + {allAccounts.filter(a => a.owner === 'spouse').length}</div>
                        </div>
                    </div>

                    {/* Owner sub-tabs (Cmd+Click to multi-select) */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {Object.entries(OWNERS).map(([key, cfg]) => {
                            const isSelected = selectedOwners.has(key);
                            return (
                                <button key={key} onClick={(e) => toggleOwner(key, e)} style={{
                                    padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-light)',
                                    background: isSelected ? 'rgba(0,240,255,0.12)' : 'rgba(255,255,255,0.03)',
                                    color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)',
                                }}>
                                    {cfg.label}
                                </button>
                            );
                        })}
                        {isCombined && <span style={{ fontSize: '11px', color: 'var(--accent-primary)', alignSelf: 'center', marginLeft: '4px' }}>Combined</span>}
                    </div>
                </div>
            </div>

            {/* Per-owner Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                {[
                    { icon: <PiggyBank size={18} />, label: isCombined ? 'Combined Savings' : `${ownerConfig.label}'s Savings`, value: formatFull(totalToday), color: 'var(--accent-primary)', sub: `${accounts.length} accounts` },
                    { icon: <TrendingUp size={18} />, label: `Projected at ${retirementAge}`, value: formatFull(totalProjected), color: 'var(--accent-success)', sub: `${retirementAge - currentAge} years growth` },
                    { icon: <Shield size={18} />, label: 'Max Affordable/mo', value: formatFull(maxAffordable), color: 'var(--accent-success)', sub: 'Savings last 25+ years' },
                    { icon: <Clock size={18} />, label: 'Lasts Until Age', value: yearsLasting >= 50 ? '90+' : String(depletionAge), color: yearsLasting >= 25 ? 'var(--accent-success)' : 'var(--accent-warning)', sub: `At ${formatFull(monthlySpending)}/mo spending` },
                    { icon: <Clock size={18} />, label: 'Monthly Deposits', value: formatFull(totalMonthlyDeposit), color: 'var(--accent-warning)', sub: 'Employee + employer' },
                ].map(({ icon, label, value, color, sub }) => (
                    <div key={label} className="glass-panel" style={{ padding: '16px', overflow: 'visible' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ color }}>{icon}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: 800, color }}>{value}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>
                    </div>
                ))}
            </div>

            {/* Controls Row */}
            <div className="glass-panel" style={{ padding: '20px', overflow: 'visible' }}>
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Retirement Age Slider */}
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <div className="flex-between" style={{ marginBottom: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>Retirement Age</span>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-primary)' }}>{retirementAge}</span>
                        </div>
                        <input type="range" min={55} max={75} step={1} value={retirementAge}
                            onChange={e => setRetirementAge(Number(e.target.value))}
                            className="scenario-slider" />
                        <div className="flex-between" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            <span>55</span><span>75</span>
                        </div>
                    </div>

                    {/* Monthly Spending Input */}
                    <div style={{ minWidth: '180px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Monthly Retirement Spending</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>₪</span>
                            <input type="number" value={monthlySpending} onChange={e => setMonthlySpending(Number(e.target.value) || 0)}
                                style={{
                                    width: '120px', padding: '6px 10px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                                    border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
                                }} />
                        </div>
                    </div>

                    {/* Import Button */}
                    <label style={{
                        padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        cursor: importing ? 'wait' : 'pointer', fontFamily: 'inherit',
                        border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)',
                        color: 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-end',
                    }}>
                        <Upload size={14} /> {importing ? 'Importing...' : 'Import XLS'}
                        <input type="file" accept=".xls,.xlsx" onChange={handleImport} disabled={importing}
                            style={{ display: 'none' }} />
                    </label>
                </div>
            </div>

            {/* Growth & Drawdown Chart */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontWeight: 600, marginBottom: '16px' }}>Savings Trajectory</h3>
                <div style={{ height: '300px' }}>
                    <Line data={chartData} options={chartOptions} />
                </div>
            </div>

            {/* Sufficiency Meter */}
            <div className="glass-panel" style={{ padding: '20px' }}>
                <div className="flex-between" style={{ marginBottom: '10px' }}>
                    <div>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>Post-Retirement Sufficiency</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '10px' }}>
                            Monthly spending: {formatFull(monthlySpending)}
                        </span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: suffColor }}>
                        {yearsLasting >= 50 ? 'Indefinite' : `${yearsLasting} years`}
                        {yearsLasting < 50 && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>until age {depletionAge}</span>}
                    </span>
                </div>
                <div style={{ height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,0.05)', position: 'relative' }}>
                    <div style={{ height: '100%', borderRadius: '5px', width: `${suffPct}%`, background: suffColor, opacity: 0.75, transition: 'width 0.5s ease' }} />
                    {/* 25-year marker */}
                    <div style={{ position: 'absolute', top: '-2px', bottom: '-2px', left: `${(25/35)*100}%`, width: '1.5px', background: 'var(--text-muted)', opacity: 0.3 }} />
                </div>
                <div className="flex-between" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <span>0 years</span><span>25 years</span><span>35+ years</span>
                </div>
            </div>

            {/* Pension History Chart */}
            {historyChartData && history.length > 0 && (
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ fontWeight: 600, marginBottom: '16px' }}>Pension Value Over Time</h3>
                    <div style={{ height: '200px' }}>
                        <Line data={historyChartData} options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: isCombined,
                                    position: 'top',
                                    labels: { color: '#94a3b8', usePointStyle: true, font: { family: 'Plus Jakarta Sans', size: 11 } },
                                },
                                tooltip: { ...tooltipDefaults, callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${formatFull(ctx.raw)}` } },
                            },
                            scales: {
                                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
                                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', callback: (v) => '₪' + (v / 1000000).toFixed(1) + 'M' } },
                            },
                        }} />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                        {history.length} snapshot{history.length !== 1 ? 's' : ''} — save or import to track growth over time
                    </div>
                </div>
            )}

            {/* Accounts Table */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontWeight: 600, marginBottom: '16px' }}>Savings Accounts</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                                {[
                                    { key: 'name', label: 'Account', align: 'left' },
                                    { key: 'company', label: 'Company', align: 'left' },
                                    { key: 'currentBalance', label: 'Current ₪', align: 'right' },
                                    { key: 'annualInterest', label: 'Interest %', align: 'center' },
                                    { key: 'monthlyDeposit', label: 'Monthly Deposit', align: 'center' },
                                    { key: 'depositStopAge', label: 'Until Age', align: 'center' },
                                    { key: 'projected', label: 'Projected', align: 'right' },
                                    { key: 'monthlyPension', label: 'Pension/mo', align: 'right' },
                                ].map(col => (
                                    <th key={col.key} onClick={() => handleSort(col.key)}
                                        style={{ padding: '10px 8px', textAlign: col.align, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                                        {col.label} {sortConfig.key === col.key ? (sortConfig.direction === 'desc' ? '▼' : '▲') : ''}
                                    </th>
                                ))}
                                <th style={{ padding: '10px 8px', width: '40px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedProjections.map(acc => (
                                <tr key={acc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} className="hover-row">
                                    <td style={{ padding: '10px 8px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '12px' }}>{acc.nameEn}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{acc.name}</div>
                                    </td>
                                    <td style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontSize: '11px' }}>{acc.company}</td>
                                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>{formatFull(acc.currentBalance)}</td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                        <input type="number" step="0.1" value={acc.annualInterest}
                                            onChange={e => updateAccount(acc.id, 'annualInterest', e.target.value)}
                                            style={{
                                                width: '60px', padding: '4px 6px', borderRadius: '6px', fontSize: '12px',
                                                border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)',
                                                color: 'var(--accent-primary)', textAlign: 'center', outline: 'none', fontFamily: 'inherit',
                                            }} />
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                        <input type="number" step="100" value={acc.monthlyDeposit}
                                            onChange={e => updateAccount(acc.id, 'monthlyDeposit', e.target.value)}
                                            style={{
                                                width: '80px', padding: '4px 6px', borderRadius: '6px', fontSize: '12px',
                                                border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)',
                                                color: 'var(--text-primary)', textAlign: 'center', outline: 'none', fontFamily: 'inherit',
                                            }} />
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                        <input type="number" min={currentAge} max={75} value={acc.depositStopAge}
                                            onChange={e => updateAccount(acc.id, 'depositStopAge', e.target.value)}
                                            style={{
                                                width: '50px', padding: '4px 6px', borderRadius: '6px', fontSize: '12px',
                                                border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)',
                                                color: 'var(--text-primary)', textAlign: 'center', outline: 'none', fontFamily: 'inherit',
                                            }} />
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-success)' }}>
                                        {formatFull(acc.projected)}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'right', color: acc.monthlyPension > 0 ? 'var(--accent-purple)' : 'var(--text-muted)' }}>
                                        {acc.monthlyPension > 0 ? formatFull(acc.monthlyPension) : '—'}
                                    </td>
                                    <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                                        <button onClick={(e) => { e.stopPropagation(); deleteAccount(acc.id); }} title="Remove account"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', opacity: 0.5 }}>
                                            <Trash2 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {/* Add account row */}
                            {showAddRow && (
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(139,92,246,0.03)' }}>
                                    <td style={{ padding: '8px' }}>
                                        <input type="text" placeholder="Account name" value={newAccount.name}
                                            onChange={e => setNewAccount(p => ({ ...p, name: e.target.value }))}
                                            style={{ width: '100%', padding: '4px 6px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                        <input type="text" placeholder="Company" value={newAccount.company}
                                            onChange={e => setNewAccount(p => ({ ...p, company: e.target.value }))}
                                            style={{ width: '80px', padding: '4px 6px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                        <input type="number" value={newAccount.currentBalance} onChange={e => setNewAccount(p => ({ ...p, currentBalance: Number(e.target.value) || 0 }))}
                                            style={{ width: '90px', padding: '4px 6px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', textAlign: 'right', outline: 'none', fontFamily: 'inherit' }} />
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                        <input type="number" step="0.1" value={newAccount.annualInterest} onChange={e => setNewAccount(p => ({ ...p, annualInterest: Number(e.target.value) || 0 }))}
                                            style={{ width: '60px', padding: '4px 6px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)', color: 'var(--accent-primary)', textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                        <input type="number" value={newAccount.monthlyDeposit} onChange={e => setNewAccount(p => ({ ...p, monthlyDeposit: Number(e.target.value) || 0 }))}
                                            style={{ width: '80px', padding: '4px 6px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                        <input type="number" value={newAccount.depositStopAge} onChange={e => setNewAccount(p => ({ ...p, depositStopAge: Number(e.target.value) || 63 }))}
                                            style={{ width: '50px', padding: '4px 6px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
                                    </td>
                                    <td style={{ padding: '8px' }} />
                                    <td style={{ padding: '8px' }} />
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                        <button onClick={addManualAccount} style={{ background: 'none', border: '1px solid var(--accent-success)', borderRadius: '6px', color: 'var(--accent-success)', padding: '3px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, fontFamily: 'inherit' }}>Save</button>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid var(--border-light)' }}>
                                <td colSpan={2} style={{ padding: '10px 8px', fontWeight: 700, fontSize: '13px' }}>Total</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>{formatFull(totalToday)}</td>
                                <td />
                                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, fontSize: '12px', color: 'var(--accent-warning)' }}>{formatFull(totalMonthlyDeposit)}</td>
                                <td />
                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontSize: '13px', color: 'var(--accent-success)' }}>{formatFull(totalProjected)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-purple)' }}>
                                    {accounts.reduce((s, a) => s + (a.monthlyPension || 0), 0) > 0 ? formatFull(accounts.reduce((s, a) => s + (a.monthlyPension || 0), 0)) : '—'}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    {!showAddRow && (
                        <button onClick={() => setShowAddRow(true)} style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                            border: '1px dashed var(--border-light)', background: 'rgba(255,255,255,0.02)',
                            color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px',
                        }}>
                            <Plus size={14} /> Add Account
                        </button>
                    )}
                    <button onClick={saveSnapshot} disabled={saving} style={{
                        padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
                        border: '1px solid rgba(139,92,246,0.3)', background: saving ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.06)',
                        color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '6px',
                        transition: 'all 0.2s',
                    }}>
                        <Save size={14} /> {saving ? 'Saved!' : 'Save Snapshot'}
                    </button>
                </div>
            </div>
        </div>
    );
}
