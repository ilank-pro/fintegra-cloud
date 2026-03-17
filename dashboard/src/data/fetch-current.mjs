// Fetches the current budget via /api/budget/current and outputs
// transactions + budget metadata + trajectory data as JSON to stdout.
import { RiseUpClient } from '../../../riseup-cli-main/dist/chunk-Q4VJQGQA.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const loadJson = (name) => { try { return JSON.parse(readFileSync(join(__dirname, name), 'utf-8')); } catch { return null; } };

const client = new RiseUpClient();
const budget = await client.budget.current();
const txns = budget.envelopes.flatMap(e => e.actuals);

// Fetch previous budgets to get trackingCategory overrides and trends for older months
const categoryOverrideMap = {};
const budgetTrends = [];
try {
  // Fetch 4 budgets starting from current month (API returns recent budgets going backward)
  const prevBudgets = await client.budget.get(budget.budgetDate, 4);
  for (const b of prevBudgets) {
    const allTxns = b.envelopes.flatMap(e => e.actuals || []);
    // Category overrides
    for (const t of allTxns) {
      if (t.trackingCategory && t.trackingCategory.name && t.trackingCategory.name !== 'blacklist') {
        const key = `${t.transactionDate || t.billingDate}_${Math.abs(t.billingAmount || 0)}_${t.businessName}`;
        categoryOverrideMap[key] = t.trackingCategory.name;
      }
    }
    // Budget trends (income/expenses/net per month)
    const inc = allTxns.filter(t => t.isIncome).reduce((s, t) => s + (t.incomeAmount || t.billingAmount || 0), 0);
    const exp = allTxns.filter(t => !t.isIncome).reduce((s, t) => s + Math.abs(t.billingAmount || 0), 0);
    budgetTrends.push({ month: b.budgetDate, income: inc, expenses: exp, net: inc - exp });
  }
} catch (e) {
  // Ignore errors fetching previous budgets
}
// Also add current budget trackingCategory overrides
for (const t of txns) {
  if (t.trackingCategory && t.trackingCategory.name && t.trackingCategory.name !== 'blacklist') {
    const key = `${t.transactionDate || t.billingDate}_${Math.abs(t.billingAmount || 0)}_${t.businessName}`;
    categoryOverrideMap[key] = t.trackingCategory.name;
  }
}

// Use user-overridden category (trackingCategory.name) when available, fall back to system category (expense)
const resolveCategory = (t) => t.trackingCategory?.name || t.expense;

const transactions = txns.map(t => ({
  date: t.transactionDate || t.billingDate || t.originalDate,
  amount: t.isIncome ? (t.incomeAmount || t.billingAmount || 0) : Math.abs(t.billingAmount || 0),
  businessName: t.businessName || '',
  category: t.isIncome ? (resolveCategory(t) || 'income') : (resolveCategory(t) || ''),
  source: t.source || '',
  isIncome: !!t.isIncome,
  isTemp: !!t.isTemp,
}));

const spending = {};
for (const t of txns.filter(tx => !tx.isIncome)) {
  const cat = resolveCategory(t) || 'Other';
  if (!spending[cat]) spending[cat] = { name: cat, total: 0, count: 0 };
  spending[cat].total += Math.abs(t.billingAmount || 0);
  spending[cat].count += 1;
}

const income = txns.filter(tx => tx.isIncome).map(t => ({
  date: t.transactionDate || t.billingDate,
  amount: t.incomeAmount || t.billingAmount || 0,
  businessName: t.businessName || '',
  category: resolveCategory(t) || 'income',
}));

// ── Trajectory data ──────────────────────────────────────────────
const [budgetYear, budgetMonth] = budget.budgetDate.split('-').map(Number);
const startDay = budget.cashflowStartDay || 1;
const now = new Date();
const daysInMonth = new Date(budgetYear, budgetMonth, 0).getDate();
const dayOfMonth = now.getDate();
const daysElapsed = Math.max(1, dayOfMonth - startDay + 1);
const pctMonthElapsed = (daysElapsed / daysInMonth) * 100;

// Build history average lookup from trackingCategoryMetadata
const historyMap = {};
if (Array.isArray(budget.trackingCategoryMetadata)) {
  for (const meta of budget.trackingCategoryMetadata) {
    historyMap[meta.name] = {
      historyAverage: meta.historyAverage || 0,
      basedOnHistoryAverage: !!meta.basedOnHistoryAverage,
    };
  }
}

// Aggregate actual spending by transaction category (not envelope name)
const catAggregated = {};
for (const env of budget.envelopes) {
  const expenses = (env.actuals || []).filter(t => !t.isIncome);
  for (const t of expenses) {
    const catName = resolveCategory(t) || 'Other';
    if (!catAggregated[catName]) catAggregated[catName] = { actual: 0, txnCount: 0 };
    catAggregated[catName].actual += Math.abs(t.billingAmount || 0);
    catAggregated[catName].txnCount += 1;
  }
}

// Add budgeted amounts from envelopes (fixed expenses use envelope details.expense)
for (const env of budget.envelopes) {
  const envCat = env.details?.expense || 'Other';
  if (!catAggregated[envCat]) catAggregated[envCat] = { actual: 0, txnCount: 0 };
  catAggregated[envCat].budgeted = (catAggregated[envCat].budgeted || 0) + (env.originalAmount || 0);
}

// Build trajectory categories
const trajectoryCategories = [];
for (const [catName, data] of Object.entries(catAggregated)) {
  const budgeted = data.budgeted || 0;
  if (data.actual === 0 && budgeted === 0) continue;
  const pctBudgetUsed = budgeted > 0 ? (data.actual / budgeted) * 100 : 0;
  const projected = daysElapsed > 0 ? (data.actual / daysElapsed) * daysInMonth : data.actual;
  const hist = historyMap[catName] || {};

  trajectoryCategories.push({
    name: catName,
    budgeted,
    actual: data.actual,
    projected,
    historyAverage: hist.historyAverage || 0,
    basedOnHistoryAverage: hist.basedOnHistoryAverage || false,
    pctBudgetUsed: Math.round(pctBudgetUsed * 10) / 10,
    onTrack: budgeted > 0 ? pctBudgetUsed <= pctMonthElapsed + 5 : true,
    txnCount: data.txnCount,
  });
}

// Sort by most over-budget first (delta between budget usage % and month elapsed %)
trajectoryCategories.sort((a, b) => {
  const deltaA = a.pctBudgetUsed - pctMonthElapsed;
  const deltaB = b.pctBudgetUsed - pctMonthElapsed;
  return deltaB - deltaA;
});

// ── Cash Flow Trajectory ─────────────────────────────────────────────
let actualIncome = 0, actualExpenses = 0;
let expectedIncome = 0, expectedExpenses = 0;
const pendingItems = [];

for (const env of budget.envelopes) {
  const actuals = env.actuals || [];
  const hasActuals = actuals.length > 0;
  const isIncome = env.details?.isIncome || actuals.some(t => t.isIncome);
  const amt = env.originalAmount || 0;

  if (hasActuals) {
    for (const t of actuals) {
      if (t.isIncome) actualIncome += (t.incomeAmount || t.billingAmount || 0);
      else actualExpenses += Math.abs(t.billingAmount || 0);
    }
  } else if (amt > 0) {
    if (isIncome) {
      expectedIncome += amt;
    } else {
      expectedExpenses += amt;
      const tc = env.details?.trackingCategory;
      const pendingName = env.details?.businessName
        || (tc ? `${tc.icon || ''} ${tc.name} (budget)`.trim() : null)
        || env.details?.expense
        || 'Unknown';
      pendingItems.push({
        name: pendingName,
        amount: amt,
        date: env.details?.transactionDate?.slice(0, 10) || null,
        category: env.details?.expense || tc?.name || '',
      });
    }
  }
}

// Sort pending by date
pendingItems.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

const cashflow = {
  actualIncome,
  expectedIncome,
  totalIncome: actualIncome + expectedIncome,
  actualExpenses,
  expectedExpenses,
  totalExpenses: actualExpenses + expectedExpenses,
  projectedNet: (actualIncome + expectedIncome) - (actualExpenses + expectedExpenses),
  pendingExpenses: pendingItems,
  pendingIncome: [], // none currently, but keeping for structure
};

const trajectory = {
  budgetDate: budget.budgetDate,
  cashflowStartDay: startDay,
  daysElapsed,
  daysInMonth,
  pctMonthElapsed: Math.round(pctMonthElapsed * 10) / 10,
  categories: trajectoryCategories,
  cashflow,
  variableIncomePrediction: budget.params?.variableIncomePredictionAmount || null,
};

// ── Financial Health Scores & Gamification ───────────────────────────
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// Load supporting data
const trendsFile = loadJson('trends.json');
const balanceFile = loadJson('balance.json');
const progressFile = loadJson('progress.json');

// 1. Cash Flow Score (weight 30%)
const trendsArr = Array.isArray(trendsFile) ? trendsFile : [];
const avgIncome = trendsArr.length > 0 ? trendsArr.reduce((s, d) => s + (d.income || 0), 0) / trendsArr.length : actualIncome || 1;
const avgNet = trendsArr.length > 0 ? trendsArr.reduce((s, d) => s + (d.net || 0), 0) / trendsArr.length : cashflow.projectedNet;
const netRatio = avgIncome > 0 ? avgNet / avgIncome : 0;
const cashFlowScore = clamp(Math.round((netRatio + 0.2) / 0.4 * 100));

// 2. Emergency Fund Score (weight 25%)
const bankBalance = (balanceFile?.balances || []).reduce((s, a) => s + (Number(a.balance) || 0), 0);
const savingsBalance = (balanceFile?.financialSummary?.savingsAccounts || []).reduce((s, a) => s + (Number(a.balanceAmount?.amount) || 0), 0);
const liquidAssets = bankBalance + savingsBalance;
const avgExpenses = trendsArr.length > 0 ? trendsArr.reduce((s, d) => s + (d.expenses || 0), 0) / trendsArr.length : actualExpenses || 1;
const runway = avgExpenses > 0 ? liquidAssets / avgExpenses : 0;
const emergencyScore = clamp(Math.round((runway / 6) * 100));

// 3. Budget Adherence Score (weight 25%)
const budgetedCats = trajectoryCategories.filter(c => c.budgeted > 0 && c.actual > 0);
let adherenceScore = 75; // default if no budget data
if (budgetedCats.length > 0) {
  const totalBudgeted = budgetedCats.reduce((s, c) => s + c.budgeted, 0);
  const weightedScore = budgetedCats.reduce((s, c) => {
    const catScore = clamp(Math.round((c.budgeted / Math.max(c.actual, 1)) * 100));
    const weight = c.budgeted / totalBudgeted;
    return s + catScore * weight;
  }, 0);
  adherenceScore = clamp(Math.round(weightedScore));
}

// 4. Savings Growth Score (weight 20%)
const avgSavings = progressFile?.averageSavings || 0;
const hasSavings = progressFile?.progressState?.currentOshIsPositive || false;
const savingsRatio = avgIncome > 0 ? avgSavings / avgIncome : 0;
const savingsScore = clamp(Math.round(
  savingsRatio >= 0.05 ? 100 :
  savingsRatio >= 0.02 ? 70 :
  hasSavings ? 50 :
  avgSavings > 0 ? 30 : 0
));

// 5. Retirement Readiness Score (weight 20%)
const pensionFile = loadJson('pension-accounts.json');
const pensionAccounts = Array.isArray(pensionFile) ? pensionFile : [];
const totalPensionSavings = pensionAccounts.reduce((s, a) => s + (a.currentBalance || 0), 0);
const totalPensionDeposits = pensionAccounts.reduce((s, a) => s + (a.monthlyDeposit || 0), 0);

// Owner-aware projection: each account uses its owner's age and retirement
const ownerAges = { ilan: 53, spouse: 51 };
const ownerRetirements = { ilan: 63, spouse: 65 };
let projectedPension = 0;
for (const a of pensionAccounts) {
  const ownerAge = ownerAges[a.owner] || 53;
  const ownerRet = ownerRetirements[a.owner] || 63;
  const yrs = Math.max(0, ownerRet - ownerAge);
  const monthlyRate = (a.annualInterest || 4) / 100 / 12;
  const depositMonths = Math.max(0, Math.min(a.depositStopAge || ownerRet, ownerRet) - ownerAge) * 12;
  let bal = a.currentBalance || 0;
  for (let m = 0; m < yrs * 12; m++) {
    bal *= (1 + monthlyRate);
    if (m < depositMonths) bal += (a.monthlyDeposit || 0);
  }
  projectedPension += bal;
}

// 4% withdrawal rule: projected * 0.04 / 12 = sustainable monthly income
const sustainableMonthly = projectedPension * 0.04 / 12;
const targetMonthly = avgIncome * 0.7; // 70% replacement
const retirementScore = clamp(Math.round(targetMonthly > 0 ? (sustainableMonthly / targetMonthly) * 100 : 0));

// 3-tier asset breakdown (household totals across both owners)
const liquidAssetsTier = liquidAssets; // bank + bank savings
const accessibleTier = pensionAccounts.filter(a => a.type === 'hishtalmut').reduce((s, a) => s + (a.currentBalance || 0), 0);
const longTermTier = pensionAccounts.filter(a => a.type !== 'hishtalmut').reduce((s, a) => s + (a.currentBalance || 0), 0);
const totalNetWorth = liquidAssetsTier + accessibleTier + longTermTier;

// Composite (updated weights)
const composite = Math.round(
  cashFlowScore * 0.25 +
  emergencyScore * 0.20 +
  adherenceScore * 0.20 +
  savingsScore * 0.15 +
  retirementScore * 0.20
);
const grade = composite >= 80 ? 'A' : composite >= 60 ? 'B' : composite >= 40 ? 'C' : composite >= 20 ? 'D' : 'F';
const level = Math.max(1, Math.min(10, Math.ceil(composite / 10)));
const levelTitles = ['', 'Getting Started', 'Getting Started', 'Building Habits', 'Building Habits', 'Making Progress', 'Making Progress', 'Financial Fitness', 'Financial Fitness', 'Money Master', 'Money Master'];
const levelTitle = levelTitles[level] || 'Getting Started';
const xpInLevel = composite % 10;

// Streak: consecutive positive-net months (from trends, most recent first)
const sortedTrends = [...trendsArr].sort((a, b) => b.month.localeCompare(a.month));
let streak = 0;
for (const m of sortedTrends) {
  if ((m.net || 0) > 0) streak++;
  else break;
}

// Achievement Badges
const badges = [
  { id: 'first-positive', name: 'First Positive', icon: '🌟', desc: 'First month with positive net', earned: trendsArr.some(m => (m.net || 0) > 0) },
  { id: 'budget-master', name: 'Budget Master', icon: '🎯', desc: 'All budgeted categories under budget', earned: budgetedCats.length > 0 && budgetedCats.every(c => c.actual <= c.budgeted) },
  { id: 'emergency-1m', name: 'Emergency 1M', icon: '🛡️', desc: '1 month emergency fund', earned: runway >= 1 },
  { id: 'emergency-3m', name: 'Emergency 3M', icon: '🏰', desc: '3 month emergency fund', earned: runway >= 3 },
  { id: 'emergency-6m', name: 'Emergency 6M', icon: '🏆', desc: '6 month emergency fund', earned: runway >= 6 },
  { id: 'savings-active', name: 'Saver', icon: '🐷', desc: 'Active savings contributions', earned: hasSavings },
  { id: 'under-budget', name: 'Under Budget', icon: '💪', desc: 'Total spending under total budget', earned: cashflow.totalExpenses < budgetedCats.reduce((s, c) => s + c.budgeted, 0) },
  { id: 'streak-3', name: 'Hot Streak', icon: '🔥', desc: '3+ month positive streak', earned: streak >= 3 },
];

// Monthly Challenge (auto-generated from weakest score)
const scores = [
  { name: 'Cash Flow', score: cashFlowScore, dim: 'cashflow' },
  { name: 'Emergency Fund', score: emergencyScore, dim: 'emergency' },
  { name: 'Budget Adherence', score: adherenceScore, dim: 'adherence' },
  { name: 'Savings Growth', score: savingsScore, dim: 'savings' },
  { name: 'Retirement', score: retirementScore, dim: 'retirement' },
];
const weakest = scores.reduce((w, s) => s.score < w.score ? s : w, scores[0]);

const challenges = {
  cashflow: { title: 'Improve Cash Flow', desc: `Reduce spending by ${Math.min(10, Math.abs(Math.round(netRatio * 100)))}% this month`, target: Math.round(avgExpenses * 0.9), metric: 'expenses' },
  emergency: { title: 'Build Emergency Fund', desc: `Save ${Math.round(avgExpenses * 0.1).toLocaleString()} extra this month`, target: Math.round(avgExpenses * 0.1), metric: 'savings' },
  adherence: { title: 'Stay On Budget', desc: 'Keep all categories within budget this month', target: 100, metric: 'adherence' },
  savings: { title: 'Boost Savings', desc: `Increase monthly savings to ${Math.round(avgIncome * 0.05).toLocaleString()}`, target: Math.round(avgIncome * 0.05), metric: 'savings' },
  retirement: { title: 'Review Retirement Plan', desc: 'Check your pension tab and ensure contributions are on track', target: 70, metric: 'retirement' },
};
const activeChallenge = challenges[weakest.dim] || challenges.cashflow;

const healthScore = {
  composite, grade, level, levelTitle, xpInLevel,
  scores: {
    cashFlow: cashFlowScore,
    emergencyFund: emergencyScore,
    budgetAdherence: adherenceScore,
    savingsGrowth: savingsScore,
    retirementReadiness: retirementScore,
  },
  assetTiers: {
    liquid: liquidAssetsTier,
    accessible: accessibleTier,
    longTerm: longTermTier,
    totalNetWorth,
  },
  retirement: {
    projectedPension, sustainableMonthly, targetMonthly,
    totalSavings: totalPensionSavings, monthlyDeposits: totalPensionDeposits,
  },
  streak,
  badges,
  challenge: { ...activeChallenge, weakestDim: weakest.name, weakestScore: weakest.score },
};

console.log(JSON.stringify({
  budgetDate: budget.budgetDate,
  cashflowStartDay: budget.cashflowStartDay,
  lastUpdatedAt: budget.lastUpdatedAt,
  transactions,
  spending: Object.values(spending).sort((a, b) => b.total - a.total),
  income,
  totalIncome: txns.filter(tx => tx.isIncome).reduce((s, t) => s + (t.incomeAmount || t.billingAmount || 0), 0),
  totalExpenses: txns.filter(tx => !tx.isIncome).reduce((s, t) => s + Math.abs(t.billingAmount || 0), 0),
  trajectory,
  healthScore,
  categoryOverrides: categoryOverrideMap,
  budgetTrends,
}));
