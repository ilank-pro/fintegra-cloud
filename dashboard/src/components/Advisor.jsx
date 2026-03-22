import { useState, useMemo, useRef, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, AlertCircle, Sparkles, Key, ChevronDown, ChevronUp, RefreshCw, Download, Mail, PiggyBank, Shield, Send, MessageCircle } from 'lucide-react';
import { useTrends, useBalance, useSpending, useProgress, useTrajectory, useHealthScore, useIncome, usePensionAccounts, useTransactions, useAdvisorHistory } from '../hooks/useData';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

const formatCurrency = (val) => {
    if (!val && val !== 0) return '₪0';
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
    'ארנונה': 'Property Tax', 'דיור': 'Housing',
};

// ═══════════════════════════════════════════════════
//  Rule Engine
// ═══════════════════════════════════════════════════

function runRules({ trendsData, spendingData, progressData, trajectoryData, healthScoreData, balanceData, incomeData, pensionData }) {
    const findings = [];
    const trends = Array.isArray(trendsData) ? [...trendsData].sort((a, b) => a.month.localeCompare(b.month)) : [];
    const spending = Array.isArray(spendingData) ? spendingData : [];
    const progress = progressData || {};
    const traj = trajectoryData || {};
    const health = healthScoreData || {};
    const balances = balanceData?.balances || [];
    const savings = balanceData?.financialSummary?.savingsAccounts || [];

    const avgIncome = trends.length > 0 ? trends.reduce((s, d) => s + (d.income || 0), 0) / trends.length : 0;
    const avgExpenses = trends.length > 0 ? trends.reduce((s, d) => s + (d.expenses || 0), 0) / trends.length : 0;
    const avgNet = trends.length > 0 ? trends.reduce((s, d) => s + (d.net || 0), 0) / trends.length : 0;
    const totalBalance = balances.reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const totalSavings = savings.reduce((s, a) => s + (Number(a.balanceAmount?.amount) || 0), 0);
    const liquidAssets = totalBalance + totalSavings;
    const runway = avgExpenses > 0 ? liquidAssets / avgExpenses : 0;
    const totalSpending = spending.reduce((s, c) => s + c.total, 0);

    // ── Cash Flow Rules ──
    const negativeMonths = trends.filter(m => (m.net || 0) < 0).length;
    if (negativeMonths >= 2) {
        findings.push({
            id: 'cf-negative-trend', category: 'Cash Flow', severity: 'critical',
            title: 'Persistent Negative Cash Flow',
            finding: `You had negative net cash flow in ${negativeMonths} out of ${trends.length} recent months. Average monthly deficit: ${formatCurrency(Math.abs(avgNet))}.`,
            recommendation: 'Identify your top 3 variable spending categories and set a monthly cap for each. Even a 10% reduction across categories can turn your cash flow positive.',
        });
    }

    if (avgIncome > 0 && avgExpenses / avgIncome > 1.2) {
        findings.push({
            id: 'cf-overspend', category: 'Cash Flow', severity: 'critical',
            title: 'Expenses Exceed Income by 20%+',
            finding: `Your average expenses (${formatCurrency(avgExpenses)}) are ${Math.round((avgExpenses / avgIncome - 1) * 100)}% higher than your income (${formatCurrency(avgIncome)}).`,
            recommendation: 'This is unsustainable. Prioritize cutting non-essential categories (dining, shopping, travel) and review fixed expenses for any that can be renegotiated.',
        });
    }

    const maxExpense = Math.max(...trends.map(m => m.expenses || 0));
    if (avgExpenses > 0 && maxExpense > avgExpenses * 1.5) {
        const spikeMonth = trends.find(m => m.expenses === maxExpense);
        findings.push({
            id: 'cf-spike', category: 'Cash Flow', severity: 'warning',
            title: 'Large Expense Spike Detected',
            finding: `${spikeMonth?.month} had expenses of ${formatCurrency(maxExpense)}, which is ${Math.round((maxExpense / avgExpenses - 1) * 100)}% above your average.`,
            recommendation: 'Investigate what caused this spike. If it was a one-time event, consider setting aside a buffer for unexpected expenses. If recurring, budget for it.',
        });
    }

    // ── Emergency Fund Rules ──
    if (runway < 1) {
        findings.push({
            id: 'ef-critical', category: 'Emergency Fund', severity: 'critical',
            title: 'Emergency Fund Below 1 Month',
            finding: `Your liquid assets (${formatCurrency(liquidAssets)}) cover only ${runway.toFixed(1)} months of expenses. You need ${formatCurrency(avgExpenses - liquidAssets)} more for a 1-month buffer.`,
            recommendation: 'This is your most urgent priority. Set up an automatic monthly transfer to savings — even ₪500/month builds a buffer. Aim for 1 month first, then 3, then 6.',
        });
    } else if (runway < 3) {
        findings.push({
            id: 'ef-warning', category: 'Emergency Fund', severity: 'warning',
            title: 'Emergency Fund Below 3 Months',
            finding: `Your ${runway.toFixed(1)}-month runway is a start, but financial advisors recommend 3-6 months. Gap to 3 months: ${formatCurrency(avgExpenses * 3 - liquidAssets)}.`,
            recommendation: 'Continue building your emergency fund. Consider a high-yield savings account to earn interest while maintaining access.',
        });
    } else if (runway < 6) {
        findings.push({
            id: 'ef-advisory', category: 'Emergency Fund', severity: 'info',
            title: 'Emergency Fund Growing — Not Yet at 6 Months',
            finding: `You have ${runway.toFixed(1)} months of runway (${formatCurrency(liquidAssets)}). Target: ${formatCurrency(avgExpenses * 6)} for full 6-month coverage.`,
            recommendation: 'Good progress. Keep contributing and consider splitting funds between immediate access savings and short-term deposits for better returns.',
        });
    } else {
        findings.push({
            id: 'ef-good', category: 'Emergency Fund', severity: 'success',
            title: 'Strong Emergency Fund',
            finding: `Your ${runway.toFixed(1)}-month emergency fund exceeds the recommended 6 months. Well done!`,
            recommendation: 'Consider redirecting excess emergency fund contributions toward investments for better long-term growth.',
        });
    }

    // ── Spending Rules ──
    for (const cat of spending) {
        const pct = totalSpending > 0 ? (cat.total / totalSpending) * 100 : 0;
        if (pct > 25) {
            const catEn = CATEGORY_TRANSLATIONS[cat.name] || cat.name;
            findings.push({
                id: `sp-concentration-${cat.name}`, category: 'Spending', severity: 'warning',
                title: `High Concentration: ${catEn}`,
                finding: `${catEn} accounts for ${pct.toFixed(1)}% of your total spending (${formatCurrency(cat.total)}).`,
                recommendation: `Review this category for optimization opportunities. Break it down by merchant to find where the bulk goes.`,
            });
        }
    }

    if (avgIncome > 0) {
        const diningCat = spending.find(c => c.name === 'אוכל בחוץ');
        if (diningCat && diningCat.total / avgIncome > 0.15) {
            findings.push({
                id: 'sp-dining', category: 'Spending', severity: 'warning',
                title: 'Dining Out Exceeds 15% of Income',
                finding: `You're spending ${formatCurrency(diningCat.total)} on dining out (${(diningCat.total / avgIncome * 100).toFixed(1)}% of income).`,
                recommendation: 'Meal planning and cooking at home 2 more days per week could save ₪1,500-2,500/month. Consider it a high-impact quick win.',
            });
        }
    }

    // Volatility
    if (trends.length >= 3) {
        const expArr = trends.map(m => m.expenses || 0);
        const mean = expArr.reduce((s, v) => s + v, 0) / expArr.length;
        const stddev = Math.sqrt(expArr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / expArr.length);
        const cv = mean > 0 ? (stddev / mean) * 100 : 0;
        if (cv > 30) {
            findings.push({
                id: 'sp-volatility', category: 'Spending', severity: 'warning',
                title: 'High Spending Volatility',
                finding: `Your monthly expenses vary by ±${formatCurrency(stddev)} (CV: ${cv.toFixed(0)}%). This makes budgeting unreliable.`,
                recommendation: 'Identify the categories causing spikes. Move large irregular expenses to planned monthly installments where possible.',
            });
        }
    }

    // Fixed obligations
    const fixedCats = ['משכנתא', 'ביטוח', 'ארנונה', 'דיור'];
    const fixedTotal = spending.filter(c => fixedCats.includes(c.name)).reduce((s, c) => s + c.total, 0);
    if (avgIncome > 0 && fixedTotal / avgIncome > 0.4) {
        findings.push({
            id: 'sp-fixed-high', category: 'Spending', severity: 'warning',
            title: 'Fixed Obligations Exceed 40% of Income',
            finding: `Fixed costs (mortgage, insurance, property tax, housing) total ${formatCurrency(fixedTotal)} — ${(fixedTotal / avgIncome * 100).toFixed(0)}% of income.`,
            recommendation: 'Review insurance policies for better rates. Consider refinancing mortgage if rates have dropped. Every 0.5% reduction saves significantly over time.',
        });
    }

    // ── Savings & Investments ──
    const savingsRate = avgIncome > 0 ? (progress.averageSavings || 0) / avgIncome : 0;
    if (savingsRate < 0.05) {
        findings.push({
            id: 'sv-low-rate', category: 'Savings', severity: 'critical',
            title: 'Savings Rate Below 5%',
            finding: `Your average monthly savings rate is ${(savingsRate * 100).toFixed(1)}% (${formatCurrency(progress.averageSavings || 0)}/month). Financial advisors recommend at least 10-20%.`,
            recommendation: 'Automate a fixed monthly transfer to savings on payday — "pay yourself first." Start with 5% of income and increase gradually.',
        });
    } else if (savingsRate < 0.1) {
        findings.push({
            id: 'sv-moderate-rate', category: 'Savings', severity: 'info',
            title: 'Savings Rate Below 10%',
            finding: `Your ${(savingsRate * 100).toFixed(1)}% savings rate is a good start but below the recommended 10-20%.`,
            recommendation: 'Look for one spending category to cut by 5% — this could double your savings rate. Small changes compound significantly over time.',
        });
    }

    const securities = balanceData?.financialSummary?.securities || [];
    if (securities.length === 0 && totalSavings > avgExpenses * 3) {
        findings.push({
            id: 'sv-no-investments', category: 'Investments', severity: 'info',
            title: 'No Investment Portfolio Detected',
            finding: 'You have sufficient savings but no investment positions. Cash loses value to inflation over time.',
            recommendation: 'Consider opening an investment account. A diversified index fund (like S&P 500 or TA-125) is a good starting point for long-term growth. Start with a small monthly contribution.',
        });
    }

    // ── Budget Rules ──
    const budgetedCats = (traj.categories || []).filter(c => c.budgeted > 0);
    const overBudget = budgetedCats.filter(c => c.actual > c.budgeted);
    if (overBudget.length >= 3) {
        findings.push({
            id: 'bg-multiple-over', category: 'Budget', severity: 'warning',
            title: `${overBudget.length} Categories Over Budget`,
            finding: `You're exceeding budget in ${overBudget.length} categories this month. Top overshoot: ${CATEGORY_TRANSLATIONS[overBudget[0]?.name] || overBudget[0]?.name} at ${overBudget[0]?.pctBudgetUsed?.toFixed(0)}%.`,
            recommendation: 'Review and adjust unrealistic budget targets. A budget that constantly fails gets ignored. Set achievable targets and tighten gradually.',
        });
    }

    if (health.scores?.budgetAdherence < 50) {
        findings.push({
            id: 'bg-low-adherence', category: 'Budget', severity: 'warning',
            title: 'Budget Adherence Score Below 50',
            finding: `Your budget adherence is ${health.scores?.budgetAdherence}/100. Consistently overshooting budgets undermines financial discipline.`,
            recommendation: 'Reset your budget to match last 3 months average spending per category, then reduce by 5% each month. Achievable targets build habits.',
        });
    }

    // ── Retirement & Pension ──
    const pAccounts = Array.isArray(pensionData) ? pensionData : [];
    const totalPension = pAccounts.reduce((s, a) => s + (a.currentBalance || 0), 0);
    const totalPensionDeposits = pAccounts.reduce((s, a) => s + (a.monthlyDeposit || 0), 0);
    const inactiveAccounts = pAccounts.filter(a => a.status === 'inactive');

    if (totalPension > 0) {
        const retirementScore = health.scores?.retirementReadiness || 0;
        if (retirementScore >= 70) {
            findings.push({
                id: 'rt-on-track', category: 'Retirement', severity: 'success',
                title: 'Retirement Savings On Track',
                finding: `Your pension portfolio (${formatCurrency(totalPension)}) across ${pAccounts.length} accounts with ${formatCurrency(totalPensionDeposits)}/mo in deposits is building toward retirement readiness (score: ${retirementScore}/100).`,
                recommendation: 'Continue current contribution levels. Consider reviewing fund performance annually and consolidating inactive accounts.',
            });
        } else {
            findings.push({
                id: 'rt-needs-attention', category: 'Retirement', severity: 'warning',
                title: 'Retirement Savings May Fall Short',
                finding: `Retirement readiness score is ${retirementScore}/100. Your ${formatCurrency(totalPension)} in pension savings with ${formatCurrency(totalPensionDeposits)}/mo deposits may not reach the target 70% income replacement.`,
                recommendation: 'Consider increasing voluntary contributions (e.g., Gemel fund) or extending your working years. Even 2 extra years of contributions significantly improve the projection.',
            });
        }
    }

    if (inactiveAccounts.length > 0) {
        const inactiveTotal = inactiveAccounts.reduce((s, a) => s + (a.currentBalance || 0), 0);
        findings.push({
            id: 'rt-inactive', category: 'Retirement', severity: 'info',
            title: `${inactiveAccounts.length} Inactive Pension Account(s)`,
            finding: `You have ${inactiveAccounts.length} inactive accounts totaling ${formatCurrency(inactiveTotal)}. These may have higher management fees or lower returns than active funds.`,
            recommendation: 'Review inactive accounts for consolidation opportunities. Transferring to your active pension fund may reduce fees and simplify management.',
        });
    }

    // Diversification check
    const companies = new Set(pAccounts.map(a => a.company));
    if (companies.size <= 2 && pAccounts.length >= 4) {
        findings.push({
            id: 'rt-diversification', category: 'Retirement', severity: 'info',
            title: 'Limited Pension Provider Diversification',
            finding: `Your ${pAccounts.length} accounts are managed by only ${companies.size} provider(s). Concentration in few providers increases institutional risk.`,
            recommendation: 'This is informational — Israeli pension providers are well-regulated. However, comparing fund performance across providers annually is good practice.',
        });
    }

    // Sort: critical first, then warning, then info, then success
    const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 };
    findings.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));

    return findings;
}

// ═══════════════════════════════════════════════════
//  Build data summary for AI prompt
// ═══════════════════════════════════════════════════

function buildDataSummary({ trendsData, spendingData, balanceData, trajectoryData, healthScoreData, progressData, pensionData, incomeData, transactionsData }) {
    const trends = Array.isArray(trendsData) ? trendsData : [];
    const spending = Array.isArray(spendingData) ? spendingData : [];
    const income = Array.isArray(incomeData) ? incomeData : [];
    const transactions = Array.isArray(transactionsData) ? transactionsData : [];
    const balances = balanceData?.balances || [];
    const savings = balanceData?.financialSummary?.savingsAccounts || [];
    const securities = balanceData?.financialSummary?.securities || [];
    const traj = trajectoryData || {};
    const health = healthScoreData || {};
    const progress = progressData || {};
    const cf = traj.cashflow || {};

    return {
        monthlyTrends: trends.map(m => ({ month: m.month, income: Math.round(m.income), expenses: Math.round(m.expenses), net: Math.round(m.net) })),
        bankBalances: balances.map(b => ({ account: b.accountNumberPiiValue, balance: b.balance })),
        savingsAccounts: savings.map(s => ({ name: s.name, amount: Number(s.balanceAmount?.amount) })),
        securitiesCount: securities.length,
        topSpendingCategories: spending.slice(0, 10).map(c => ({ category: CATEGORY_TRANSLATIONS[c.name] || c.name, amount: c.total, count: c.count })),
        healthScores: health.scores,
        compositeScore: health.composite,
        grade: health.grade,
        streak: health.streak,
        averageSavings: progress.averageSavings,
        totalSavings: progress.totalSavings,
        currentMonthProjection: cf.projectedNet ? { income: cf.totalIncome, expenses: cf.totalExpenses, net: cf.projectedNet } : null,
        budgetAdherence: (traj.categories || []).filter(c => c.budgeted > 0).map(c => ({
            category: CATEGORY_TRANSLATIONS[c.name] || c.name,
            budgeted: c.budgeted, actual: c.actual, pctUsed: c.pctBudgetUsed,
        })),
        assetTiers: health.assetTiers,
        retirement: health.retirement,
        pensionAccounts: (Array.isArray(pensionData) ? pensionData : []).map(a => ({
            name: a.nameEn || a.name,
            type: a.type,
            company: a.company,
            status: a.status,
            currentBalance: a.currentBalance,
            annualInterest: a.annualInterest,
            monthlyDeposit: a.monthlyDeposit,
            monthlyPension: a.monthlyPension,
        })),
        incomeBreakdown: income.map(i => ({
            date: i.date, amount: i.amount, source: i.businessName, category: i.category,
        })),
        transactionsByMerchant: Object.values(
            transactions.reduce((acc, t) => {
                if (t.isIncome) return acc;
                const key = t.businessName || 'Unknown';
                if (!acc[key]) acc[key] = { merchant: key, category: CATEGORY_TRANSLATIONS[t.category] || t.category, total: 0, count: 0, months: {} };
                acc[key].total += t.amount;
                acc[key].count += 1;
                const mo = t.date?.slice(0, 7);
                if (mo) acc[key].months[mo] = (acc[key].months[mo] || 0) + Math.round(t.amount);
                // Capture rich fields from first occurrence
                if (!acc[key].expense && t.expense) acc[key].expense = CATEGORY_TRANSLATIONS[t.expense] || t.expense;
                if (!acc[key].frequency && t.monthsInterval) acc[key].frequency = t.monthsInterval === 1 ? 'monthly' : t.monthsInterval === 2 ? 'bi-monthly' : `every ${t.monthsInterval} months`;
                if (!acc[key].placement && t.placement) acc[key].placement = t.placement;
                if (!acc[key].accountNumber && t.accountNumber) acc[key].accountNumber = t.accountNumber;
                if (t.isInstallment && t.totalPayments) acc[key].installment = `${t.paymentNumber || '?'}/${t.totalPayments}`;
                return acc;
            }, {})
        ).sort((a, b) => b.total - a.total).slice(0, 50).map(m => ({ ...m, total: Math.round(m.total) })),
    };
}

function buildMetricsSnapshot(dataSummary) {
    return {
        date: new Date().toISOString().slice(0, 10),
        totalBalance: dataSummary.bankBalances?.reduce((s, b) => s + b.balance, 0) || 0,
        totalSavings: dataSummary.totalSavings || 0,
        topCategories: dataSummary.topSpendingCategories?.slice(0, 5) || [],
        compositeScore: dataSummary.compositeScore || null,
        grade: dataSummary.grade || null,
        monthlyNet: dataSummary.monthlyTrends?.slice(-1)[0]?.net || null,
        pensionTotal: dataSummary.pensionAccounts?.reduce((s, a) => s + a.currentBalance, 0) || 0,
    };
}

// ═══════════════════════════════════════════════════
//  Severity styling
// ═══════════════════════════════════════════════════

const severityConfig = {
    critical: { color: 'var(--accent-danger)', bg: 'rgba(255,0,85,0.06)', border: 'rgba(255,0,85,0.15)', icon: AlertCircle, label: 'Critical' },
    warning: { color: 'var(--accent-warning)', bg: 'rgba(255,230,0,0.06)', border: 'rgba(255,230,0,0.15)', icon: AlertTriangle, label: 'Warning' },
    info: { color: 'var(--accent-primary)', bg: 'rgba(0,240,255,0.04)', border: 'rgba(0,240,255,0.12)', icon: AlertCircle, label: 'Advisory' },
    success: { color: 'var(--accent-success)', bg: 'rgba(0,255,159,0.04)', border: 'rgba(0,255,159,0.12)', icon: CheckCircle2, label: 'Good' },
};

// ═══════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════

export default function Advisor({ aiReport, setAiReport, chatMessages, setChatMessages }) {
    const trendsData = useTrends() || [];
    const balanceData = useBalance() || {};
    const spendingData = useSpending() || [];
    const progressData = useProgress() || {};
    const trajectoryData = useTrajectory() || {};
    const healthScoreData = useHealthScore() || {};
    const incomeData = useIncome() || [];
    const pensionData = usePensionAccounts() || [];
    const transactionsData = useTransactions() || [];
    const advisorHistory = useAdvisorHistory() || [];
    const saveAdvisorReport = useMutation(api.mutations.saveAdvisorReport);

    const dataBundle = { trendsData, balanceData, spendingData, progressData, trajectoryData, healthScoreData, incomeData, pensionData, transactionsData };
    const findings = useMemo(() => runRules(dataBundle), [trendsData, balanceData, spendingData, progressData, trajectoryData, healthScoreData, incomeData, pensionData]);
    const [expandedFindings, setExpandedFindings] = useState(new Set());
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('fintegra-anthropic-key') || '');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const SUGGESTED_QUESTIONS = [
        "How can I reduce my monthly expenses?",
        "What's my pension outlook at age 63?",
        "What if I save ₪2,000 more per month?",
        "Where should I focus first?",
    ];

    const sendChatMessage = async (text) => {
        if (!text?.trim() || !apiKey || chatLoading) return;
        const userMsg = { role: 'user', content: text.trim() };
        const updatedMessages = [...chatMessages, userMsg];
        setChatMessages(updatedMessages);
        setChatInput('');
        setChatLoading(true);
        try {
            const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL || import.meta.env.VITE_CONVEX_URL?.replace('.cloud', '.site') || '';
            const reportSummary = aiReport
                ? `Executive Summary: ${aiReport.executiveSummary || ''}\nKey Findings: ${(aiReport.topFindings || []).map(f => `${f.title}: ${f.detail}`).join('; ')}`
                : '';
            const res = await fetch(`${siteUrl}/advisor-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey,
                    messages: updatedMessages,
                    dataSummary: buildDataSummary(dataBundle),
                    reportSummary,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
            } else {
                setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
            }
        } catch {
            setChatMessages(prev => [...prev, { role: 'assistant', content: 'Network error — check your connection.' }]);
        } finally {
            setChatLoading(false);
        }
    };

    const toggleFinding = (id) => {
        setExpandedFindings(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSaveKey = (key) => {
        setApiKey(key);
        localStorage.setItem('fintegra-anthropic-key', key);
    };

    const generateReport = async () => {
        if (!apiKey) return;
        setAiLoading(true);
        setAiError(null);
        try {
            const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL || import.meta.env.VITE_CONVEX_URL?.replace('.cloud', '.site') || '';
            const dataSummary = buildDataSummary(dataBundle);

            // Build history context from previous reports
            const previousReport = advisorHistory.length > 0 ? advisorHistory[0].report : null;
            const metricsHistory = advisorHistory
                .filter(h => h.metricsSnapshot)
                .map(h => h.metricsSnapshot)
                .reverse();

            const res = await fetch(`${siteUrl}/advisor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey,
                    findings: findings.map(f => ({ category: f.category, severity: f.severity, title: f.title, finding: f.finding })),
                    dataSummary,
                    previousReport,
                    metricsHistory,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                // Parse structured JSON from Claude
                try {
                    const reportText = data.report;
                    // Extract JSON from possible markdown code blocks
                    const jsonMatch = reportText.match(/```json\s*([\s\S]*?)```/) || reportText.match(/```\s*([\s\S]*?)```/);
                    const jsonStr = jsonMatch ? jsonMatch[1].trim() : reportText.trim();
                    const parsed = JSON.parse(jsonStr);
                    setAiReport(parsed);

                    // Save report + metrics snapshot to Convex
                    const snapshot = buildMetricsSnapshot(dataSummary);
                    saveAdvisorReport({ report: parsed, metricsSnapshot: snapshot }).catch(() => {});
                } catch {
                    // Fallback: store raw text if JSON parsing fails
                    setAiReport({ _raw: data.report });
                }
            } else {
                setAiError(data.error || 'Failed to generate report');
            }
        } catch (err) {
            setAiError('Network error — check your connection');
        } finally {
            setAiLoading(false);
        }
    };

    // Convert report to plain text for email
    const reportToText = () => {
        if (!aiReport || aiReport._raw) return aiReport?._raw || '';
        const lines = [];
        lines.push('FINANCIAL ADVISORY REPORT');
        lines.push('========================\n');
        if (aiReport.executiveSummary) lines.push(`Executive Summary\n${aiReport.executiveSummary}\n`);
        if (aiReport.keyMetrics?.length) {
            lines.push('Key Metrics');
            aiReport.keyMetrics.forEach(m => {
                const val = m.format === 'currency' ? formatCurrency(m.value) : m.format === 'percent' ? `${m.value}%` : String(m.value);
                lines.push(`  ${m.label}: ${val} (${m.trend}) - ${m.insight || ''}`);
            });
            lines.push('');
        }
        if (aiReport.topFindings?.length) {
            lines.push('Key Findings');
            aiReport.topFindings.forEach(f => lines.push(`  [${f.severity.toUpperCase()}] ${f.title}: ${f.detail}\n  Action: ${f.action}\n`));
        }
        if (aiReport.improvementPlan?.length) {
            lines.push('Improvement Plan');
            aiReport.improvementPlan.forEach(s => lines.push(`  Step ${s.step}: ${s.title}\n  ${s.description}${s.targetSaving ? `\n  Potential saving: ${formatCurrency(s.targetSaving)}/month` : ''}\n`));
        }
        if (aiReport.categoryTargets?.length) {
            lines.push('Category Targets');
            aiReport.categoryTargets.forEach(c => lines.push(`  ${c.category}: ${formatCurrency(c.current)} -> ${formatCurrency(c.target)} | ${c.strategy}`));
            lines.push('');
        }
        if (aiReport.riskMatrix?.length) {
            lines.push('Risk Assessment');
            aiReport.riskMatrix.forEach(r => lines.push(`  [${r.level.toUpperCase()}] ${r.risk}: ${r.mitigation}`));
            lines.push('');
        }
        if (aiReport.monthlyChecklist?.length) {
            lines.push('Monthly Action Items');
            aiReport.monthlyChecklist.forEach(item => lines.push(`  [ ] ${item}`));
            lines.push('');
        }
        if (aiReport.savingsInsights) {
            lines.push('Savings Account Insights');
            lines.push(aiReport.savingsInsights.status);
            (aiReport.savingsInsights.highlights || []).forEach(h => lines.push(`  ${h.account}: ${h.insight} -> ${h.action}`));
            lines.push('');
        }
        if (aiReport.pensionInsights) {
            lines.push('Pension Status & Insights');
            lines.push(aiReport.pensionInsights.status);
            if (aiReport.pensionInsights.retirementGap) lines.push(`  Gap: ${aiReport.pensionInsights.retirementGap}`);
            (aiReport.pensionInsights.highlights || []).forEach(h => lines.push(`  ${h.account}: ${h.insight} -> ${h.action}`));
            lines.push('');
        }
        if (aiReport.pensionRecommendations?.length) {
            lines.push('Pension & Savings Recommendations');
            aiReport.pensionRecommendations.forEach((r, i) => lines.push(`  ${i+1}. [${r.impact.toUpperCase()}] ${r.title}: ${r.description}`));
            lines.push('');
        }
        if (aiReport.longTermOutlook) lines.push(`Long-Term Outlook\n${aiReport.longTermOutlook}`);
        // Add rule findings
        lines.push('\n---\nAutomated Findings');
        findings.forEach(f => lines.push(`  [${f.severity.toUpperCase()}] ${f.title}: ${f.finding}`));
        return lines.join('\n');
    };

    const handleSavePdf = () => {
        const saved = [];
        const els = document.querySelectorAll('.dashboard-layout, .main-content, .content-area, .print-report, .print-report *, .glass-panel');
        els.forEach(el => {
            saved.push({
                el,
                maxHeight: el.style.maxHeight,
                overflow: el.style.overflow,
                overflowY: el.style.overflowY,
                height: el.style.height,
            });
            el.style.maxHeight = 'none';
            el.style.overflow = 'visible';
            el.style.overflowY = 'visible';
            el.style.height = 'auto';
        });

        const reportEl = document.querySelector('.print-report');
        const flexParent = reportEl?.parentElement;
        let flexParentSaved;
        if (flexParent) {
            flexParentSaved = { display: flexParent.style.display };
            flexParent.style.display = 'block';
        }

        window.print();

        saved.forEach(({ el, maxHeight, overflow, overflowY, height }) => {
            el.style.maxHeight = maxHeight;
            el.style.overflow = overflow;
            el.style.overflowY = overflowY;
            el.style.height = height;
        });
        if (flexParent && flexParentSaved) {
            flexParent.style.display = flexParentSaved.display;
        }
    };

    const handleEmail = () => {
        const subject = encodeURIComponent(`Financial Advisory Report - ${new Date().toLocaleDateString()}`);
        const body = encodeURIComponent(reportToText());
        window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
    };

    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const warningCount = findings.filter(f => f.severity === 'warning').length;
    const goodCount = findings.filter(f => f.severity === 'success').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Header + Summary */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <div className="flex-between" style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontWeight: 600 }}>Financial Advisory Report</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {criticalCount > 0 && <span style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: 'rgba(255,0,85,0.12)', color: 'var(--accent-danger)' }}>{criticalCount} Critical</span>}
                        {warningCount > 0 && <span style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: 'rgba(255,230,0,0.12)', color: 'var(--accent-warning)' }}>{warningCount} Warnings</span>}
                        {goodCount > 0 && <span style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: 'rgba(0,255,159,0.12)', color: 'var(--accent-success)' }}>{goodCount} Good</span>}
                    </div>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    This report analyzes your financial data across {new Set(findings.map(f => f.category)).size} dimensions.
                    {criticalCount > 0 ? ` There are ${criticalCount} critical issue(s) that need immediate attention.` : ' No critical issues found.'}
                    {' '}Click any finding to see the detailed recommendation.
                </p>
            </div>

            {/* Findings by Category */}
            {[...new Set(findings.map(f => f.category))].map(category => {
                const catFindings = findings.filter(f => f.category === category);
                return (
                    <div key={category}>
                        <h4 style={{ fontWeight: 600, fontSize: '14px', marginBottom: '10px', paddingLeft: '2px', color: 'var(--text-secondary)' }}>{category}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {catFindings.map(f => {
                                const sev = severityConfig[f.severity] || severityConfig.info;
                                const Icon = sev.icon;
                                const isExpanded = expandedFindings.has(f.id);
                                return (
                                    <div key={f.id} className="glass-panel" style={{
                                        padding: '14px 18px', cursor: 'pointer',
                                        background: sev.bg, border: `1px solid ${sev.border}`,
                                    }} onClick={() => toggleFinding(f.id)}>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                            <Icon size={16} color={sev.color} style={{ flexShrink: 0, marginTop: '2px' }} />
                                            <div style={{ flex: 1 }}>
                                                <div className="flex-between" style={{ marginBottom: '4px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{f.title}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '10px', fontWeight: 600, color: sev.color, textTransform: 'uppercase' }}>{sev.label}</span>
                                                        {isExpanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                                                    </div>
                                                </div>
                                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{f.finding}</p>
                                                {isExpanded && (
                                                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${sev.border}` }}>
                                                        <div style={{ fontSize: '11px', fontWeight: 600, color: sev.color, marginBottom: '4px' }}>Recommendation</div>
                                                        <p style={{ fontSize: '12px', color: 'var(--text-primary)', margin: 0, lineHeight: 1.6 }}>{f.recommendation}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {/* AI Report Section */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <div className="flex-between" style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Sparkles size={18} color="var(--accent-purple)" />
                        <h3 style={{ fontWeight: 600 }}>AI-Powered Deep Analysis</h3>
                    </div>
                </div>

                {/* API Key input */}
                <div className="no-print" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
                    <Key size={14} color="var(--text-muted)" />
                    <input
                        type="password"
                        placeholder="Enter Anthropic API key..."
                        value={apiKey}
                        onChange={(e) => handleSaveKey(e.target.value)}
                        style={{
                            flex: 1, padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
                            border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)',
                            color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
                        }}
                    />
                    <button
                        onClick={generateReport}
                        disabled={!apiKey || aiLoading}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            cursor: !apiKey || aiLoading ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                            border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)',
                            color: 'var(--accent-purple)',
                            opacity: !apiKey || aiLoading ? 0.5 : 1,
                            display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                    >
                        {aiLoading ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
                        {aiLoading ? 'Generating...' : aiReport ? 'Regenerate' : 'Generate Report'}
                    </button>

                    {(aiReport || findings.length > 0) && (
                        <>
                            <button onClick={handleSavePdf} className="no-print" style={{
                                padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                                border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)',
                                color: 'var(--text-secondary)',
                                display: 'flex', alignItems: 'center', gap: '6px',
                            }}>
                                <Download size={12} /> Save PDF
                            </button>
                            <button onClick={handleEmail} className="no-print" style={{
                                padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                                border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)',
                                color: 'var(--text-secondary)',
                                display: 'flex', alignItems: 'center', gap: '6px',
                            }}>
                                <Mail size={12} /> Email
                            </button>
                        </>
                    )}
                </div>

                {!apiKey && (
                    <p className="no-print" style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Enter your Anthropic API key to generate a comprehensive AI-powered advisory report. Your key is stored locally and never sent to our servers.
                    </p>
                )}

                {aiError && (
                    <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,0,85,0.06)', border: '1px solid rgba(255,0,85,0.15)', fontSize: '12px', color: 'var(--accent-danger)' }}>
                        {aiError}
                    </div>
                )}

                {aiReport && !aiReport._raw && (
                    <div style={{ marginTop: '16px', display: 'flex', gap: '20px' }}>
                    {/* Left: Report */}
                    <div className="print-report" style={{ flex: '1 1 60%', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '80vh', overflowY: 'auto', paddingRight: '8px' }}>
                        <div className="print-title" style={{ display: 'none' }}>Financial Advisory Report</div>
                        <div className="print-date" style={{ display: 'none' }}>Generated {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>

                        {/* Executive Summary + Risk Gauge */}
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                                <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '8px' }}>Executive Summary</h4>
                                <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>{aiReport.executiveSummary}</p>
                            </div>
                            {aiReport.overallRisk && (() => {
                                const riskColors = { low: 'var(--accent-success)', medium: 'var(--accent-warning)', high: 'var(--accent-danger)', critical: 'var(--accent-danger)' };
                                const riskValues = { low: 25, medium: 50, high: 75, critical: 95 };
                                const color = riskColors[aiReport.overallRisk] || 'var(--text-muted)';
                                const val = riskValues[aiReport.overallRisk] || 50;
                                const gaugeSize = 90;
                                const gaugeRadius = 35;
                                const circumference = Math.PI * gaugeRadius;
                                const offset = circumference * (1 - val / 100);
                                return (
                                    <div style={{ flexShrink: 0, textAlign: 'center' }}>
                                        <svg width={gaugeSize} height={gaugeSize / 2 + 10} viewBox={`0 0 ${gaugeSize} ${gaugeSize / 2 + 10}`}>
                                            <path d={`M 5 ${gaugeSize/2} A ${gaugeRadius} ${gaugeRadius} 0 0 1 ${gaugeSize-5} ${gaugeSize/2}`}
                                                fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} strokeLinecap="round" />
                                            <path d={`M 5 ${gaugeSize/2} A ${gaugeRadius} ${gaugeRadius} 0 0 1 ${gaugeSize-5} ${gaugeSize/2}`}
                                                fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
                                                strokeDasharray={circumference} strokeDashoffset={offset}
                                                style={{ transition: 'stroke-dashoffset 1s ease' }} />
                                        </svg>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color, marginTop: '-4px', textTransform: 'uppercase' }}>{aiReport.overallRisk} risk</div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Key Metrics */}
                        {aiReport.keyMetrics?.length > 0 && (
                            <div>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>Key Metrics</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, aiReport.keyMetrics.length)}, 1fr)`, gap: '10px' }}>
                                    {aiReport.keyMetrics.map((m, i) => {
                                        const trendIcon = m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→';
                                        const trendColor = m.trend === 'up' ? 'var(--accent-success)' : m.trend === 'down' ? 'var(--accent-danger)' : 'var(--text-muted)';
                                        const formatted = m.format === 'currency' ? formatCurrency(m.value) : m.format === 'percent' ? `${m.value}%` : m.format === 'months' ? `${m.value} mo` : String(m.value);
                                        return (
                                            <div key={i} style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>{m.label}</div>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                                    <span style={{ fontSize: '20px', fontWeight: 800 }}>{formatted}</span>
                                                    <span style={{ fontSize: '14px', fontWeight: 700, color: trendColor }}>{trendIcon}</span>
                                                </div>
                                                {m.insight && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{m.insight}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Top Findings */}
                        {aiReport.topFindings?.length > 0 && (
                            <div>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>Key Findings</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {aiReport.topFindings.map((f, i) => {
                                        const sev = severityConfig[f.severity] || severityConfig.info;
                                        const Icon = sev.icon;
                                        return (
                                            <div key={i} style={{ padding: '12px 16px', background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: '10px' }}>
                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                    <Icon size={15} color={sev.color} style={{ flexShrink: 0, marginTop: '2px' }} />
                                                    <div>
                                                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '3px' }}>{f.title}</div>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{f.detail}</div>
                                                        <div style={{ fontSize: '11px', color: sev.color, fontWeight: 500 }}>{f.action}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 5-Step Improvement Plan */}
                        {aiReport.improvementPlan?.length > 0 && (
                            <div>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>Improvement Plan</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {aiReport.improvementPlan.map((step, i) => {
                                        const impactColor = step.impact === 'high' ? 'var(--accent-success)' : step.impact === 'medium' ? 'var(--accent-warning)' : 'var(--text-muted)';
                                        const impactBg = step.impact === 'high' ? 'rgba(0,255,159,0.1)' : step.impact === 'medium' ? 'rgba(255,230,0,0.1)' : 'rgba(255,255,255,0.04)';
                                        return (
                                            <div key={i} style={{ display: 'flex', gap: '14px', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                                                <div style={{
                                                    width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                                                    background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '14px', fontWeight: 800, color: '#fff',
                                                }}>{step.step}</div>
                                                <div style={{ flex: 1 }}>
                                                    <div className="flex-between" style={{ marginBottom: '4px' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{step.title}</span>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: impactBg, color: impactColor, textTransform: 'uppercase' }}>{step.impact}</span>
                                                            {step.timeframe && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>{step.timeframe}</span>}
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step.description}</div>
                                                    {step.targetSaving > 0 && (
                                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-success)', marginTop: '6px' }}>
                                                            Potential saving: {formatCurrency(step.targetSaving)}/month
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Category Targets — horizontal bars */}
                        {aiReport.categoryTargets?.length > 0 && (
                            <div>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>Category Spending Targets</h4>
                                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {aiReport.categoryTargets.map((ct, i) => {
                                            const maxVal = Math.max(ct.current, ct.target) || 1;
                                            const currentPct = (ct.current / maxVal) * 100;
                                            const targetPct = (ct.target / maxVal) * 100;
                                            const isOver = ct.current > ct.target;
                                            return (
                                                <div key={i}>
                                                    <div className="flex-between" style={{ marginBottom: '4px' }}>
                                                        <span style={{ fontSize: '12px', fontWeight: 600 }}>{ct.category}</span>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                            {formatCurrency(ct.current)} → {formatCurrency(ct.target)}
                                                            {isOver && <span style={{ color: 'var(--accent-danger)', fontWeight: 600, marginLeft: '6px' }}>-{formatCurrency(ct.current - ct.target)}</span>}
                                                        </span>
                                                    </div>
                                                    <div style={{ position: 'relative', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }}>
                                                        <div style={{ position: 'absolute', height: '100%', borderRadius: '4px', width: `${currentPct}%`, background: isOver ? 'var(--accent-danger)' : 'var(--accent-success)', opacity: 0.7 }} />
                                                        <div style={{ position: 'absolute', top: '-2px', bottom: '-2px', left: `${targetPct}%`, width: '2px', background: 'var(--accent-primary)', borderRadius: '1px' }} />
                                                    </div>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{ct.strategy}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Risk Matrix */}
                        {aiReport.riskMatrix?.length > 0 && (
                            <div>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>Risk Assessment</h4>
                                <div style={{ overflow: 'hidden', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                                <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Risk</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, width: '80px' }}>Level</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Mitigation</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {aiReport.riskMatrix.map((r, i) => {
                                                const dotColor = r.level === 'high' ? 'var(--accent-danger)' : r.level === 'medium' ? 'var(--accent-warning)' : 'var(--accent-success)';
                                                return (
                                                    <tr key={i} style={{ borderTop: '1px solid var(--border-light)' }}>
                                                        <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r.risk}</td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor }} />
                                                                <span style={{ fontSize: '11px', fontWeight: 600, color: dotColor, textTransform: 'uppercase' }}>{r.level}</span>
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{r.mitigation}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Monthly Checklist */}
                        {aiReport.monthlyChecklist?.length > 0 && (
                            <div>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>This Month's Action Items</h4>
                                <div style={{ padding: '14px 16px', background: 'rgba(139,92,246,0.04)', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.12)' }}>
                                    {aiReport.monthlyChecklist.map((item, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '6px 0', borderBottom: i < aiReport.monthlyChecklist.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                            <span style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid var(--accent-purple)', flexShrink: 0, marginTop: '1px' }} />
                                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Savings Insights */}
                        {aiReport.savingsInsights && (
                            <div>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>Savings Account Insights</h4>
                                <div className="glass-panel" style={{ padding: '16px', background: 'rgba(0,240,255,0.03)', border: '1px solid rgba(0,240,255,0.1)' }}>
                                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.6 }}>{aiReport.savingsInsights.status}</p>
                                    {aiReport.savingsInsights.highlights?.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {aiReport.savingsInsights.highlights.map((h, i) => (
                                                <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                                                    <PiggyBank size={16} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                                    <div>
                                                        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>{h.account}</div>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{h.insight}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 500 }}>{h.action}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Pension Insights */}
                        {aiReport.pensionInsights && (
                            <div>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>Pension Status & Insights</h4>
                                <div className="glass-panel" style={{ padding: '16px', background: 'rgba(139,92,246,0.03)', border: '1px solid rgba(139,92,246,0.1)' }}>
                                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.6 }}>{aiReport.pensionInsights.status}</p>
                                    {aiReport.pensionInsights.retirementGap && (
                                        <div style={{ padding: '10px', background: 'rgba(245,158,11,0.06)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.12)', marginBottom: '12px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-warning)', marginBottom: '4px' }}>Retirement Income Gap</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{aiReport.pensionInsights.retirementGap}</div>
                                        </div>
                                    )}
                                    {aiReport.pensionInsights.highlights?.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {aiReport.pensionInsights.highlights.map((h, i) => (
                                                <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                                                    <Shield size={16} color="var(--accent-purple)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                                    <div>
                                                        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>{h.account}</div>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{h.insight}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--accent-purple)', fontWeight: 500 }}>{h.action}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Pension & Savings Recommendations */}
                        {aiReport.pensionRecommendations?.length > 0 && (
                            <div>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>Pension & Savings Recommendations</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {aiReport.pensionRecommendations.map((rec, i) => {
                                        const impactColor = rec.impact === 'high' ? 'var(--accent-success)' : rec.impact === 'medium' ? 'var(--accent-warning)' : 'var(--text-muted)';
                                        const catIcons = { consolidation: '🔗', contribution: '💰', allocation: '📊', fees: '💸', tax: '🏛️' };
                                        return (
                                            <div key={i} style={{ display: 'flex', gap: '14px', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                                                <div style={{
                                                    width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                                                    background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '16px',
                                                }}>{catIcons[rec.category] || '📋'}</div>
                                                <div style={{ flex: 1 }}>
                                                    <div className="flex-between" style={{ marginBottom: '4px' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{rec.title}</span>
                                                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: impactColor + '22', color: impactColor, textTransform: 'uppercase' }}>{rec.impact}</span>
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{rec.description}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Long-Term Outlook */}
                        {aiReport.longTermOutlook && (
                            <div style={{ padding: '18px', background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(139,92,246,0.04))', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.12)' }}>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '8px' }}>Long-Term Outlook</h4>
                                <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>{aiReport.longTermOutlook}</p>
                            </div>
                        )}
                    </div>

                    {/* Right: Chat Panel */}
                    <div className="no-print" style={{
                        flex: '0 0 38%', display: 'flex', flexDirection: 'column',
                        background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
                        border: '1px solid var(--border-light)', maxHeight: '80vh',
                        position: 'sticky', top: '20px', alignSelf: 'flex-start',
                    }}>
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MessageCircle size={16} color="var(--accent-purple)" />
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>Ask your Financial Advisor</span>
                        </div>

                        {/* Messages */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '300px' }}>
                            {chatMessages.length === 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)' }}>
                                    <Sparkles size={24} style={{ opacity: 0.3 }} />
                                    <p style={{ fontSize: '12px', textAlign: 'center', margin: 0 }}>
                                        Ask follow-up questions about your report or financial situation.
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginTop: '8px' }}>
                                        {SUGGESTED_QUESTIONS.map((q, i) => (
                                            <button key={i} onClick={() => sendChatMessage(q)} style={{
                                                padding: '6px 12px', borderRadius: '16px', fontSize: '11px',
                                                border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.06)',
                                                color: 'var(--accent-purple)', cursor: 'pointer', fontFamily: 'inherit',
                                            }}>
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {chatMessages.map((msg, i) => (
                                <div key={i} style={{
                                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    maxWidth: '85%',
                                    padding: '10px 14px', borderRadius: '12px',
                                    fontSize: '12px', lineHeight: 1.6,
                                    background: msg.role === 'user'
                                        ? 'rgba(139,92,246,0.15)'
                                        : 'rgba(255,255,255,0.04)',
                                    border: msg.role === 'user'
                                        ? '1px solid rgba(139,92,246,0.25)'
                                        : '1px solid var(--border-light)',
                                    color: 'var(--text-secondary)',
                                    whiteSpace: 'pre-wrap',
                                }}>
                                    {msg.content}
                                </div>
                            ))}
                            {chatLoading && (
                                <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-light)', fontSize: '12px', color: 'var(--text-muted)' }}>
                                    <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite', marginRight: '6px' }} />
                                    Thinking...
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input */}
                        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                placeholder="Ask a follow-up question..."
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput); } }}
                                disabled={chatLoading}
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
                                    border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
                                }}
                            />
                            <button
                                onClick={() => sendChatMessage(chatInput)}
                                disabled={!chatInput.trim() || chatLoading}
                                style={{
                                    padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.3)',
                                    background: 'rgba(139,92,246,0.1)', color: 'var(--accent-purple)',
                                    cursor: !chatInput.trim() || chatLoading ? 'not-allowed' : 'pointer',
                                    opacity: !chatInput.trim() || chatLoading ? 0.5 : 1,
                                    fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                                }}
                            >
                                <Send size={14} />
                            </button>
                        </div>
                    </div>
                    </div>
                )}

                {/* Fallback for raw text */}
                {aiReport?._raw && (
                    <div style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                        {aiReport._raw}
                    </div>
                )}
            </div>
        </div>
    );
}
