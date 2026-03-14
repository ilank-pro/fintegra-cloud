import { useEffect, useState, useMemo } from 'react';
import transactionsData from '../data/transactions.json';
import { Search, X } from 'lucide-react';

const formatCurrency = (val) => {
    if (val === undefined || val === null) return '₪0';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(val).replace('ILS', '₪');
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    'משכורת': 'Salary',
};

export default function Transactions() {
    const [transactions, setTransactions] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'income' | 'expenses'
    const [categoryFilter, setCategoryFilter] = useState('');

    useEffect(() => {
        try {
            const raw = transactionsData?.transactions || (Array.isArray(transactionsData) ? transactionsData : []);
            setTransactions(raw);
        } catch (e) {
            console.error(e);
        }
    }, []);

    const categories = useMemo(() => {
        const unique = [...new Set(transactions.map(t => t.category).filter(Boolean))];
        return unique.sort();
    }, [transactions]);

    const filtered = useMemo(() => {
        return transactions.filter(t => {
            const name = (t.businessName || '').toLowerCase();
            const cat = (t.category || '');
            const catEn = (CATEGORY_TRANSLATIONS[cat] || '').toLowerCase();

            if (searchTerm && !name.includes(searchTerm.toLowerCase()) && !catEn.includes(searchTerm.toLowerCase()) && !cat.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            if (typeFilter === 'income' && !t.isIncome) return false;
            if (typeFilter === 'expenses' && t.isIncome) return false;
            if (categoryFilter && cat !== categoryFilter) return false;
            return true;
        });
    }, [transactions, searchTerm, typeFilter, categoryFilter]);

    const displayedRows = filtered.slice(0, 50);

    const footerTotal = filtered.reduce((acc, t) => {
        return t.isIncome ? acc + t.amount : acc - t.amount;
    }, 0);

    const activeFilterCount = [searchTerm, typeFilter !== 'all', categoryFilter].filter(Boolean).length;

    const clearFilters = () => {
        setSearchTerm('');
        setTypeFilter('all');
        setCategoryFilter('');
    };

    return (
        <div className="transactions-container glass-panel" style={{ padding: '24px' }}>
            {/* Header Row */}
            <div className="flex-between" style={{ marginBottom: '16px' }}>
                <h3 style={{ fontWeight: 600 }}>Recent Transactions</h3>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', gap: '8px', borderRadius: '8px' }}>
                        <Search size={15} color="var(--text-muted)" />
                        <input
                            type="text"
                            placeholder="Search merchants..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '180px', fontSize: '13px' }}
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    {activeFilterCount > 0 && (
                        <button onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: 'var(--accent-danger)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                            <X size={12} /> Clear ({activeFilterCount})
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Type Toggle */}
                <div className="filter-toggle-group">
                    {['all', 'income', 'expenses'].map((type) => (
                        <button
                            key={type}
                            className={`filter-toggle-btn ${typeFilter === type ? 'active' : ''}`}
                            onClick={() => setTypeFilter(type)}
                        >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Category Dropdown */}
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{
                        padding: '7px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        background: 'rgba(255,255,255,0.04)',
                        color: categoryFilter ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        outline: 'none',
                        fontFamily: 'inherit',
                    }}
                >
                    <option value="">All Categories</option>
                    {categories.map(cat => (
                        <option key={cat} value={cat} style={{ background: '#1a1f2e' }}>
                            {CATEGORY_TRANSLATIONS[cat] ? `${CATEGORY_TRANSLATIONS[cat]} (${cat})` : cat}
                        </option>
                    ))}
                </select>

                <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {filtered.length} results
                </span>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: '13px' }}>
                            <th style={{ padding: '12px 8px', fontWeight: 500 }}>Date</th>
                            <th style={{ padding: '12px 8px', fontWeight: 500 }}>Merchant</th>
                            <th style={{ padding: '12px 8px', fontWeight: 500 }}>Category</th>
                            <th style={{ padding: '12px 8px', fontWeight: 500 }}>Account</th>
                            <th style={{ padding: '12px 8px', fontWeight: 500, textAlign: 'right' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedRows.map((t, i) => {
                            const catHe = t.category || '';
                            const catEn = CATEGORY_TRANSLATIONS[catHe] || catHe;
                            const isIncome = t.isIncome;
                            return (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }} className="hover-row">
                                    <td style={{ padding: '14px 8px', fontSize: '13px', color: 'var(--text-secondary)' }}>{formatDate(t.date)}</td>
                                    <td style={{ padding: '14px 8px', fontSize: '14px', fontWeight: 500 }}>{t.businessName || 'Unknown'}</td>
                                    <td style={{ padding: '14px 8px' }}>
                                        <span className="category-chip" title={catHe}>{catEn}</span>
                                    </td>
                                    <td style={{ padding: '14px 8px', fontSize: '13px', color: 'var(--text-secondary)' }}>{t.source || '—'}</td>
                                    <td style={{ padding: '14px 8px', fontSize: '14px', fontWeight: 600, textAlign: 'right', color: isIncome ? 'var(--accent-success)' : 'var(--text-primary)' }}>
                                        {isIncome ? '+' : '-'}{formatCurrency(t.amount)}
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan="5" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>No transactions found.</td>
                            </tr>
                        )}
                    </tbody>
                    {filtered.length > 0 && (
                        <tfoot>
                            <tr style={{ borderTop: '1px solid var(--border-light)' }}>
                                <td colSpan="4" style={{ padding: '12px 8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                    Showing {displayedRows.length} of {filtered.length} transactions
                                </td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '14px', fontWeight: 700, color: footerTotal >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                                    {footerTotal >= 0 ? '+' : ''}{formatCurrency(footerTotal)}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
}
