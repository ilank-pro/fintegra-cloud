import { useState, useMemo } from 'react';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { PiggyBank, Upload, TrendingUp, Clock, Shield } from 'lucide-react';
import initialAccounts from '../data/pension-accounts.json';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const CURRENT_AGE = 53;

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

// Project a single account forward
function projectAccount(account, retirementAge) {
    const yearsToRetire = Math.max(0, retirementAge - CURRENT_AGE);
    const depositYears = Math.max(0, Math.min(account.depositStopAge, retirementAge) - CURRENT_AGE);
    const monthlyRate = (account.annualInterest / 100) / 12;
    const depositMonths = depositYears * 12;
    const totalMonths = yearsToRetire * 12;

    // Growth with deposits
    let balance = account.currentBalance;
    for (let m = 0; m < totalMonths; m++) {
        balance *= (1 + monthlyRate);
        if (m < depositMonths) balance += account.monthlyDeposit;
    }
    return Math.round(balance);
}

// Build year-by-year trajectory for chart
function buildTrajectory(accounts, retirementAge, monthlySpending) {
    const maxAge = 90;
    const points = [];

    for (let age = CURRENT_AGE; age <= maxAge; age++) {
        let total = 0;
        for (const acc of accounts) {
            const yearsFromNow = age - CURRENT_AGE;
            const depositYears = Math.max(0, Math.min(acc.depositStopAge, retirementAge) - CURRENT_AGE);
            const monthlyRate = (acc.annualInterest / 100) / 12;
            const months = yearsFromNow * 12;
            const depositMonths = depositYears * 12;

            let bal = acc.currentBalance;
            for (let m = 0; m < months; m++) {
                bal *= (1 + monthlyRate);
                if (m < depositMonths) bal += acc.monthlyDeposit;
                // Withdraw after retirement
                if (CURRENT_AGE + m / 12 >= retirementAge) {
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
    for (let age = CURRENT_AGE; age <= maxAge; age++) {
        if (age <= retirementAge) {
            // Growth phase
            let total = 0;
            for (const acc of accounts) {
                total += projectAccountToAge(acc, age);
            }
            runningTotal = total;
        } else {
            // Drawdown phase — subtract spending, add interest on remaining
            const avgRate = accounts.reduce((s, a) => s + a.annualInterest, 0) / accounts.length / 100;
            runningTotal = runningTotal * (1 + avgRate) - monthlySpending * 12;
            if (runningTotal < 0) runningTotal = 0;
        }
        result.push({ age, total: Math.round(runningTotal) });
    }
    return result;
}

function projectAccountToAge(account, targetAge) {
    const years = Math.max(0, targetAge - CURRENT_AGE);
    const depositYears = Math.max(0, Math.min(account.depositStopAge, targetAge) - CURRENT_AGE);
    const monthlyRate = (account.annualInterest / 100) / 12;
    const totalMonths = years * 12;
    const depositMonths = depositYears * 12;

    let balance = account.currentBalance;
    for (let m = 0; m < totalMonths; m++) {
        balance *= (1 + monthlyRate);
        if (m < depositMonths) balance += account.monthlyDeposit;
    }
    return balance;
}

const tooltipDefaults = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    titleColor: '#fff', bodyColor: '#cbd5e1',
    borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12,
};

export default function Pension() {
    const [accounts, setAccounts] = useState(initialAccounts);
    const [retirementAge, setRetirementAge] = useState(63);
    const [monthlySpending, setMonthlySpending] = useState(40000);
    const [importing, setImporting] = useState(false);

    // Computed values
    const totalToday = useMemo(() => accounts.reduce((s, a) => s + a.currentBalance, 0), [accounts]);
    const projections = useMemo(() => accounts.map(a => ({
        ...a, projected: projectAccount(a, retirementAge),
    })), [accounts, retirementAge]);
    const totalProjected = useMemo(() => projections.reduce((s, a) => s + a.projected, 0), [projections]);
    const totalMonthlyPension = useMemo(() => accounts.reduce((s, a) => s + (a.monthlyPension || 0), 0), [accounts]);
    const totalMonthlyDeposit = useMemo(() => accounts.reduce((s, a) => s + a.monthlyDeposit, 0), [accounts]);

    // Sufficiency calculation
    const yearsLasting = useMemo(() => {
        if (monthlySpending <= 0) return 99;
        const netSpending = monthlySpending - totalMonthlyPension;
        if (netSpending <= 0) return 99;
        // Iterative with interest
        const avgRate = accounts.reduce((s, a) => s + a.annualInterest, 0) / accounts.length / 100;
        let bal = totalProjected;
        let years = 0;
        while (bal > 0 && years < 50) {
            bal = bal * (1 + avgRate) - netSpending * 12;
            years++;
        }
        return years;
    }, [totalProjected, monthlySpending, totalMonthlyPension, accounts]);

    const depletionAge = retirementAge + yearsLasting;

    // Chart data
    const chartData = useMemo(() => {
        const trajectory = buildTrajectory(accounts, retirementAge, monthlySpending - totalMonthlyPension);
        const labels = trajectory.map(p => String(p.age));
        const values = trajectory.map(p => p.total);

        // Split into growth and drawdown
        const retIdx = retirementAge - CURRENT_AGE;
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
    }, [accounts, retirementAge, monthlySpending, totalMonthlyPension]);

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
                    callback: (_, i) => (CURRENT_AGE + i) % 5 === 0 ? CURRENT_AGE + i : '',
                },
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b', callback: (v) => '₪' + (v / 1000000).toFixed(1) + 'M' },
            },
        },
    };

    // Update account field
    const updateAccount = (id, field, value) => {
        setAccounts(prev => prev.map(a => a.id === id ? { ...a, [field]: Number(value) || 0 } : a));
    };

    // Import from XLS
    const handleImport = async () => {
        setImporting(true);
        try {
            const res = await fetch('/api/import-pension');
            const data = await res.json();
            if (data.ok && data.accounts) setAccounts(data.accounts);
        } catch {} finally { setImporting(false); }
    };

    const suffColor = yearsLasting >= 25 ? 'var(--accent-success)' : yearsLasting >= 15 ? 'var(--accent-warning)' : 'var(--accent-danger)';
    const suffPct = Math.min(100, (yearsLasting / 35) * 100);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {[
                    { icon: <PiggyBank size={18} />, label: 'Total Savings Today', value: formatFull(totalToday), color: 'var(--accent-primary)', sub: `${accounts.length} accounts` },
                    { icon: <TrendingUp size={18} />, label: `Projected at ${retirementAge}`, value: formatFull(totalProjected), color: 'var(--accent-success)', sub: `${retirementAge - CURRENT_AGE} years growth` },
                    { icon: <Shield size={18} />, label: 'Monthly Pension', value: formatFull(totalMonthlyPension), color: 'var(--accent-purple)', sub: 'From pension products' },
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
                    <button onClick={handleImport} disabled={importing} style={{
                        padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        cursor: importing ? 'wait' : 'pointer', fontFamily: 'inherit',
                        border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)',
                        color: 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-end',
                    }}>
                        <Upload size={14} /> {importing ? 'Importing...' : 'Import XLS'}
                    </button>
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
                            Net monthly need: {formatFull(Math.max(0, monthlySpending - totalMonthlyPension))}
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

            {/* Accounts Table */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontWeight: 600, marginBottom: '16px' }}>Savings Accounts</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600 }}>Account</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600 }}>Company</th>
                                <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>Current ₪</th>
                                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600 }}>Interest %</th>
                                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600 }}>Monthly Deposit</th>
                                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600 }}>Until Age</th>
                                <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>Projected</th>
                                <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>Pension/mo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projections.map(acc => (
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
                                        <input type="number" min={CURRENT_AGE} max={75} value={acc.depositStopAge}
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
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid var(--border-light)' }}>
                                <td colSpan={2} style={{ padding: '10px 8px', fontWeight: 700, fontSize: '13px' }}>Total</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>{formatFull(totalToday)}</td>
                                <td />
                                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, fontSize: '12px', color: 'var(--accent-warning)' }}>{formatFull(totalMonthlyDeposit)}</td>
                                <td />
                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontSize: '13px', color: 'var(--accent-success)' }}>{formatFull(totalProjected)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-purple)' }}>{totalMonthlyPension > 0 ? formatFull(totalMonthlyPension) : '—'}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}
