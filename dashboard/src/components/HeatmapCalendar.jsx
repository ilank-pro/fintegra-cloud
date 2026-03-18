import { useState } from 'react';
import { useTransactions } from '../hooks/useData';

const formatCurrency = (val) => {
    if (!val) return '₪0';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(val).replace('ILS', '₪');
};

function getColor(intensity) {
    if (intensity === 0) return 'rgba(255,255,255,0.03)';
    // dim blue → bright red as intensity increases
    const r = Math.round(59 + intensity * (239 - 59));
    const g = Math.round(130 * (1 - intensity) + 68 * intensity);
    const b = Math.round(246 * (1 - intensity) + 68 * intensity);
    return `rgba(${r}, ${g}, ${b}, ${0.15 + intensity * 0.65})`;
}

export default function HeatmapCalendar() {
    const transactionsData = useTransactions() || [];
    const [hovered, setHovered] = useState(null);

    const expenses = transactionsData.filter(t => !t.isIncome);

    // Group spend by date
    const byDate = {};
    const topMerchantByDate = {};
    for (const t of expenses) {
        byDate[t.date] = (byDate[t.date] || 0) + t.amount;
        if (!topMerchantByDate[t.date] || t.amount > topMerchantByDate[t.date].amount) {
            topMerchantByDate[t.date] = { name: t.businessName, amount: t.amount };
        }
    }

    // Build 28-day grid for Feb 2026 (the available data range)
    const year = 2026, month = 2;
    const daysInMonth = 28;
    const firstDow = new Date(`${year}-${String(month).padStart(2, '0')}-01`).getDay();

    const dates = Array.from({ length: daysInMonth }, (_, i) =>
        `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    );

    const maxSpend = Math.max(...dates.map(d => byDate[d] || 0));

    const grid = [
        ...Array(firstDow).fill(null),
        ...dates,
    ];
    while (grid.length % 7 !== 0) grid.push(null);

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const totalSpend = dates.reduce((sum, d) => sum + (byDate[d] || 0), 0);
    const activeDays = dates.filter(d => byDate[d] > 0).length;
    const avgPerActiveDay = activeDays > 0 ? totalSpend / activeDays : 0;
    const peakDay = dates.reduce((best, d) => (!best || (byDate[d] || 0) > (byDate[best] || 0)) ? d : best, null);

    return (
        <div className="glass-panel" style={{ padding: '24px' }}>
            <div className="flex-between" style={{ marginBottom: '8px' }}>
                <h3 style={{ fontWeight: 600 }}>Daily Spend Intensity — February 2026</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span>Low</span>
                    <div style={{ display: 'flex', gap: '3px' }}>
                        {[0.1, 0.3, 0.5, 0.7, 0.9].map(i => (
                            <div key={i} style={{ width: '16px', height: '16px', borderRadius: '3px', background: getColor(i) }} />
                        ))}
                    </div>
                    <span>High</span>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                    Avg per day: <strong style={{ color: 'var(--text-secondary)' }}>{formatCurrency(avgPerActiveDay)}</strong>
                </span>
                {peakDay && (
                    <span style={{ color: 'var(--text-muted)' }}>
                        Peak: <strong style={{ color: 'var(--accent-danger)' }}>
                            {new Date(peakDay + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {formatCurrency(byDate[peakDay])}
                        </strong>
                    </span>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
                {dayLabels.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', paddingBottom: '4px' }}>{d}</div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {grid.map((date, i) => {
                    if (!date) return <div key={`e-${i}`} style={{ aspectRatio: '1', borderRadius: '6px' }} />;

                    const spend = byDate[date] || 0;
                    const intensity = maxSpend > 0 ? spend / maxSpend : 0;
                    const dayNum = new Date(date + 'T00:00:00').getDate();
                    const isHovered = hovered === date;

                    return (
                        <div
                            key={date}
                            style={{
                                aspectRatio: '1',
                                borderRadius: '6px',
                                background: getColor(intensity),
                                border: `1px solid ${isHovered ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.05)'}`,
                                cursor: spend > 0 ? 'pointer' : 'default',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                                transition: 'border-color 0.15s ease, transform 0.15s ease',
                                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                                zIndex: isHovered ? 10 : 1,
                            }}
                            onMouseEnter={() => spend > 0 && setHovered(date)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <span style={{
                                fontSize: '11px',
                                color: intensity > 0.5 ? 'rgba(255,255,255,0.9)' : 'var(--text-muted)',
                                fontWeight: 500,
                            }}>
                                {dayNum}
                            </span>

                            {isHovered && spend > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: 'calc(100% + 8px)',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(10, 12, 16, 0.97)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: '10px',
                                    padding: '10px 14px',
                                    zIndex: 200,
                                    whiteSpace: 'nowrap',
                                    fontSize: '12px',
                                    pointerEvents: 'none',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                }}>
                                    <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                                        {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </div>
                                    <div style={{ color: 'var(--accent-danger)', fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>
                                        {formatCurrency(spend)}
                                    </div>
                                    {topMerchantByDate[date] && (
                                        <div style={{ color: 'var(--text-muted)' }}>
                                            Top: {topMerchantByDate[date].name}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
