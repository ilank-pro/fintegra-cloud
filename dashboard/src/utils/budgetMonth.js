// Salary transactions (category "משכורת") in the last 4 days of a month
// are treated as income for the following month.
export function getBudgetMonth(transaction) {
    const date = transaction.date;
    if (!date) return null;
    const month = date.slice(0, 7); // "YYYY-MM"

    if (transaction.category === 'משכורת' || transaction.category === 'קצבאות') {
        const day = parseInt(date.slice(8, 10), 10);
        if (day >= 28) {
            const [y, m] = month.split('-').map(Number);
            const next = new Date(y, m, 1); // m is already 1-based, so this gives next month
            return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
        }
    }

    return month;
}
