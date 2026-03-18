"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";

async function riseupFetch(path: string, cookies: string, commitHash: string) {
  const res = await fetch(`https://input.riseup.co.il${path}`, {
    headers: {
      Cookie: cookies,
      "COMMIT-HASH": commitHash,
      "RISEUP-PLATFORM": "WEB",
      Accept: "application/json",
    },
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`RiseUp API ${path}: ${res.status}`);
  return res.json();
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const resolveCategory = (t: any) => t.trackingCategory?.name || t.expense;

function processBudget(budget: any) {
  const txns = budget.envelopes.flatMap((e: any) => e.actuals || []);

  // Transactions
  const transactions = txns.map((t: any) => ({
    date: t.transactionDate || t.billingDate || t.originalDate,
    amount: t.isIncome ? (t.incomeAmount || t.billingAmount || 0) : Math.abs(t.billingAmount || 0),
    businessName: t.businessName || "",
    category: t.isIncome ? (resolveCategory(t) || "income") : (resolveCategory(t) || ""),
    source: t.source || undefined,
    isIncome: !!t.isIncome || undefined,
  }));

  // Category override map
  const categoryOverrides: Record<string, string> = {};
  for (const t of txns) {
    if (t.trackingCategory?.name && t.trackingCategory.name !== "blacklist") {
      const key = `${t.transactionDate || t.billingDate}_${Math.abs(t.billingAmount || 0)}_${t.businessName}`;
      categoryOverrides[key] = t.trackingCategory.name;
    }
  }

  // Spending
  const spendingMap: Record<string, { name: string; total: number; count: number }> = {};
  for (const t of txns.filter((tx: any) => !tx.isIncome)) {
    const cat = resolveCategory(t) || "Other";
    if (!spendingMap[cat]) spendingMap[cat] = { name: cat, total: 0, count: 0 };
    spendingMap[cat].total += Math.abs(t.billingAmount || 0);
    spendingMap[cat].count += 1;
  }
  const spending = Object.values(spendingMap).sort((a, b) => b.total - a.total);

  // Income
  const income = txns.filter((tx: any) => tx.isIncome).map((t: any) => ({
    date: t.transactionDate || t.billingDate,
    amount: t.incomeAmount || t.billingAmount || 0,
    businessName: t.businessName || "",
    category: resolveCategory(t) || "income",
  }));

  const totalIncome = txns.filter((tx: any) => tx.isIncome).reduce((s: number, t: any) => s + (t.incomeAmount || t.billingAmount || 0), 0);
  const totalExpenses = txns.filter((tx: any) => !tx.isIncome).reduce((s: number, t: any) => s + Math.abs(t.billingAmount || 0), 0);

  // Trajectory
  const [budgetYear, budgetMonth] = budget.budgetDate.split("-").map(Number);
  const startDay = budget.cashflowStartDay || 1;
  const now = new Date();
  const daysInMonth = new Date(budgetYear, budgetMonth, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysElapsed = Math.max(1, dayOfMonth - startDay + 1);
  const pctMonthElapsed = (daysElapsed / daysInMonth) * 100;

  // History average from trackingCategoryMetadata
  const historyMap: Record<string, any> = {};
  if (Array.isArray(budget.trackingCategoryMetadata)) {
    for (const meta of budget.trackingCategoryMetadata) {
      historyMap[meta.name] = {
        historyAverage: meta.historyAverage || 0,
        basedOnHistoryAverage: !!meta.basedOnHistoryAverage,
      };
    }
  }

  // Aggregate actual spending by category
  const catAggregated: Record<string, any> = {};
  for (const env of budget.envelopes) {
    const expenses = (env.actuals || []).filter((t: any) => !t.isIncome);
    for (const t of expenses) {
      const catName = resolveCategory(t) || "Other";
      if (!catAggregated[catName]) catAggregated[catName] = { actual: 0, txnCount: 0 };
      catAggregated[catName].actual += Math.abs(t.billingAmount || 0);
      catAggregated[catName].txnCount += 1;
    }
  }

  // Add budgeted amounts from envelopes
  for (const env of budget.envelopes) {
    const envCat = env.details?.expense || "Other";
    if (!catAggregated[envCat]) catAggregated[envCat] = { actual: 0, txnCount: 0 };
    catAggregated[envCat].budgeted = (catAggregated[envCat].budgeted || 0) + (env.originalAmount || 0);
  }

  // Build trajectory categories
  const trajectoryCategories = [];
  for (const [catName, data] of Object.entries(catAggregated) as any[]) {
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
  trajectoryCategories.sort((a, b) => {
    const deltaA = a.pctBudgetUsed - pctMonthElapsed;
    const deltaB = b.pctBudgetUsed - pctMonthElapsed;
    return deltaB - deltaA;
  });

  // Cash flow trajectory
  let actualIncome = 0, actualExpenses = 0;
  let expectedIncome = 0, expectedExpenses = 0;
  const pendingItems: any[] = [];

  for (const env of budget.envelopes) {
    const actuals = env.actuals || [];
    const hasActuals = actuals.length > 0;
    const isIncome = env.details?.isIncome || actuals.some((t: any) => t.isIncome);
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
          || (tc ? `${tc.icon || ""} ${tc.name} (budget)`.trim() : null)
          || env.details?.expense
          || "Unknown";
        pendingItems.push({
          name: pendingName,
          amount: amt,
          date: env.details?.transactionDate?.slice(0, 10) || null,
          category: env.details?.expense || tc?.name || "",
        });
      }
    }
  }
  pendingItems.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const cashflow = {
    actualIncome, expectedIncome, totalIncome: actualIncome + expectedIncome,
    actualExpenses, expectedExpenses, totalExpenses: actualExpenses + expectedExpenses,
    projectedNet: (actualIncome + expectedIncome) - (actualExpenses + expectedExpenses),
    pendingExpenses: pendingItems,
    pendingIncome: [],
  };

  const trajectory = {
    budgetDate: budget.budgetDate,
    cashflowStartDay: startDay,
    daysElapsed, daysInMonth,
    pctMonthElapsed: Math.round(pctMonthElapsed * 10) / 10,
    categories: trajectoryCategories,
    cashflow,
    variableIncomePrediction: budget.params?.variableIncomePredictionAmount || null,
  };

  return {
    budgetDate: budget.budgetDate,
    transactions, spending, income,
    totalIncome, totalExpenses,
    trajectory, categoryOverrides,
    trajectoryCategories, cashflow,
    pctMonthElapsed, daysElapsed, daysInMonth,
  };
}

function computeHealthScore(
  processed: any,
  balance: any,
  progress: any,
  trendsArr: any[],
  pensionAccounts: any[],
) {
  const { cashflow, trajectoryCategories } = processed;

  const avgIncome = trendsArr.length > 0 ? trendsArr.reduce((s, d) => s + (d.income || 0), 0) / trendsArr.length : cashflow.actualIncome || 1;
  const avgNet = trendsArr.length > 0 ? trendsArr.reduce((s, d) => s + (d.net || 0), 0) / trendsArr.length : cashflow.projectedNet;
  const netRatio = avgIncome > 0 ? avgNet / avgIncome : 0;
  const cashFlowScore = clamp(Math.round((netRatio + 0.2) / 0.4 * 100));

  const bankBalance = (balance?.balances || []).reduce((s: number, a: any) => s + (Number(a.balance) || 0), 0);
  const savingsBalance = (balance?.financialSummary?.savingsAccounts || []).reduce((s: number, a: any) => s + (Number(a.balanceAmount?.amount) || 0), 0);
  const liquidAssets = bankBalance + savingsBalance;
  const avgExpenses = trendsArr.length > 0 ? trendsArr.reduce((s, d) => s + (d.expenses || 0), 0) / trendsArr.length : cashflow.actualExpenses || 1;
  const runway = avgExpenses > 0 ? liquidAssets / avgExpenses : 0;
  const emergencyScore = clamp(Math.round((runway / 6) * 100));

  const budgetedCats = trajectoryCategories.filter((c: any) => c.budgeted > 0 && c.actual > 0);
  let adherenceScore = 75;
  if (budgetedCats.length > 0) {
    const totalBudgeted = budgetedCats.reduce((s: number, c: any) => s + c.budgeted, 0);
    const weightedScore = budgetedCats.reduce((s: number, c: any) => {
      const catScore = clamp(Math.round((c.budgeted / Math.max(c.actual, 1)) * 100));
      return s + catScore * (c.budgeted / totalBudgeted);
    }, 0);
    adherenceScore = clamp(Math.round(weightedScore));
  }

  const avgSavings = progress?.averageSavings || 0;
  const hasSavings = progress?.progressState?.currentOshIsPositive || false;
  const savingsRatio = avgIncome > 0 ? avgSavings / avgIncome : 0;
  const savingsScore = clamp(Math.round(
    savingsRatio >= 0.05 ? 100 : savingsRatio >= 0.02 ? 70 : hasSavings ? 50 : avgSavings > 0 ? 30 : 0
  ));

  const ownerAges: Record<string, number> = { ilan: 53, spouse: 51 };
  const ownerRetirements: Record<string, number> = { ilan: 63, spouse: 65 };
  const totalPensionSavings = pensionAccounts.reduce((s: number, a: any) => s + (a.currentBalance || 0), 0);
  const totalPensionDeposits = pensionAccounts.reduce((s: number, a: any) => s + (a.monthlyDeposit || 0), 0);

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

  const sustainableMonthly = projectedPension * 0.04 / 12;
  const targetMonthly = avgIncome * 0.7;
  const retirementScore = clamp(Math.round(targetMonthly > 0 ? (sustainableMonthly / targetMonthly) * 100 : 0));

  const accessibleTier = pensionAccounts.filter((a: any) => a.type === "hishtalmut").reduce((s: number, a: any) => s + (a.currentBalance || 0), 0);
  const longTermTier = pensionAccounts.filter((a: any) => a.type !== "hishtalmut").reduce((s: number, a: any) => s + (a.currentBalance || 0), 0);
  const totalNetWorth = liquidAssets + accessibleTier + longTermTier;

  const composite = Math.round(
    cashFlowScore * 0.25 + emergencyScore * 0.20 + adherenceScore * 0.20 + savingsScore * 0.15 + retirementScore * 0.20
  );
  const grade = composite >= 80 ? "A" : composite >= 60 ? "B" : composite >= 40 ? "C" : composite >= 20 ? "D" : "F";
  const level = Math.max(1, Math.min(10, Math.ceil(composite / 10)));
  const levelTitles = ["", "Getting Started", "Getting Started", "Building Habits", "Building Habits", "Making Progress", "Making Progress", "Financial Fitness", "Financial Fitness", "Money Master", "Money Master"];

  // Streak
  const sortedTrends = [...trendsArr].sort((a, b) => b.month.localeCompare(a.month));
  let streak = 0;
  for (const m of sortedTrends) {
    if ((m.net || 0) > 0) streak++;
    else break;
  }

  // Badges
  const badges = [
    { id: "first-positive", name: "First Positive", icon: "\u{1F31F}", desc: "First month with positive net", earned: trendsArr.some(m => (m.net || 0) > 0) },
    { id: "budget-master", name: "Budget Master", icon: "\u{1F3AF}", desc: "All budgeted categories under budget", earned: budgetedCats.length > 0 && budgetedCats.every((c: any) => c.actual <= c.budgeted) },
    { id: "emergency-1m", name: "Emergency 1M", icon: "\u{1F6E1}\uFE0F", desc: "1 month emergency fund", earned: runway >= 1 },
    { id: "emergency-3m", name: "Emergency 3M", icon: "\u{1F3F0}", desc: "3 month emergency fund", earned: runway >= 3 },
    { id: "emergency-6m", name: "Emergency 6M", icon: "\u{1F3C6}", desc: "6 month emergency fund", earned: runway >= 6 },
    { id: "savings-active", name: "Saver", icon: "\u{1F437}", desc: "Active savings contributions", earned: hasSavings },
    { id: "under-budget", name: "Under Budget", icon: "\u{1F4AA}", desc: "Total spending under total budget", earned: cashflow.totalExpenses < budgetedCats.reduce((s: number, c: any) => s + c.budgeted, 0) },
    { id: "streak-3", name: "Hot Streak", icon: "\u{1F525}", desc: "3+ month positive streak", earned: streak >= 3 },
  ];

  // Challenge
  const scores = [
    { name: "Cash Flow", score: cashFlowScore, dim: "cashflow" },
    { name: "Emergency Fund", score: emergencyScore, dim: "emergency" },
    { name: "Budget Adherence", score: adherenceScore, dim: "adherence" },
    { name: "Savings Growth", score: savingsScore, dim: "savings" },
    { name: "Retirement", score: retirementScore, dim: "retirement" },
  ];
  const weakest = scores.reduce((w, s) => s.score < w.score ? s : w, scores[0]);
  const challenges: Record<string, any> = {
    cashflow: { title: "Improve Cash Flow", desc: `Reduce spending by ${Math.min(10, Math.abs(Math.round(netRatio * 100)))}% this month`, target: Math.round(avgExpenses * 0.9), metric: "expenses" },
    emergency: { title: "Build Emergency Fund", desc: `Save ${Math.round(avgExpenses * 0.1).toLocaleString()} extra this month`, target: Math.round(avgExpenses * 0.1), metric: "savings" },
    adherence: { title: "Stay On Budget", desc: "Keep all categories within budget this month", target: 100, metric: "adherence" },
    savings: { title: "Boost Savings", desc: `Increase monthly savings to ${Math.round(avgIncome * 0.05).toLocaleString()}`, target: Math.round(avgIncome * 0.05), metric: "savings" },
    retirement: { title: "Review Retirement Plan", desc: "Check your pension tab and ensure contributions are on track", target: 70, metric: "retirement" },
  };

  return {
    composite, grade, level,
    levelTitle: levelTitles[level] || "Getting Started",
    xpInLevel: composite % 10,
    scores: {
      cashFlow: cashFlowScore,
      emergencyFund: emergencyScore,
      budgetAdherence: adherenceScore,
      savingsGrowth: savingsScore,
      retirementReadiness: retirementScore,
    },
    assetTiers: { liquid: liquidAssets, accessible: accessibleTier, longTerm: longTermTier, totalNetWorth },
    retirement: { projectedPension, sustainableMonthly, targetMonthly, totalSavings: totalPensionSavings, monthlyDeposits: totalPensionDeposits },
    streak, badges,
    challenge: { ...challenges[weakest.dim], weakestDim: weakest.name, weakestScore: weakest.score },
  };
}

export const refreshData = action({
  args: {},
  handler: async (ctx) => {
    const cookies = await ctx.runQuery(api.queries.getConfig, { key: "RISEUP_COOKIES" });
    const commitHash = await ctx.runQuery(api.queries.getConfig, { key: "RISEUP_COMMIT_HASH" });

    if (!cookies || !commitHash) {
      return { ok: false, error: "RiseUp session not configured. Store credentials via the setConfig mutation." };
    }

    const errors: string[] = [];
    let successCount = 0;

    const fetchSafe = async (path: string) => {
      try {
        return await riseupFetch(path, cookies, commitHash);
      } catch (e: any) {
        errors.push(`${path}: ${e.message?.slice(0, 100)}`);
        return null;
      }
    };

    // Fetch all data in parallel
    const [budgetData, rawBalances, financialSummary, progressData, plansData, insightsData] = await Promise.all([
      fetchSafe("/api/budget/current"),
      fetchSafe("/api/current-balance"),
      fetchSafe("/api/aggregator/financial-summary"),
      fetchSafe("/api/hamster/customer-progress"),
      fetchSafe("/api/plans"),
      fetchSafe("/api/insights/all"),
    ]);

    // Combine into the shape components expect: { balances: [...], financialSummary: {...} }
    const balanceData = rawBalances ? { balances: rawBalances, financialSummary: financialSummary || {} } : null;

    // Process budget (transactions, spending, trajectory, etc.)
    let processed: any = null;
    let budgetTrends: any[] = [];
    let historicalTransactions: any[] = [];
    if (budgetData) {
      processed = processBudget(budgetData);

      // Fetch historical budgets for trends + transactions
      try {
        const prevBudgets = await riseupFetch(`/api/budget/${budgetData.budgetDate}/6`, cookies, commitHash);
        for (const b of prevBudgets) {
          const allTxns = b.envelopes.flatMap((e: any) => e.actuals || []);
          // Category overrides from previous months
          for (const t of allTxns) {
            if (t.trackingCategory?.name && t.trackingCategory.name !== "blacklist") {
              const key = `${t.transactionDate || t.billingDate}_${Math.abs(t.billingAmount || 0)}_${t.businessName}`;
              processed.categoryOverrides[key] = t.trackingCategory.name;
            }
          }
          // Trends per month
          const inc = allTxns.filter((t: any) => t.isIncome).reduce((s: number, t: any) => s + (t.incomeAmount || t.billingAmount || 0), 0);
          const exp = allTxns.filter((t: any) => !t.isIncome).reduce((s: number, t: any) => s + Math.abs(t.billingAmount || 0), 0);
          budgetTrends.push({ month: b.budgetDate, income: inc, expenses: exp, net: inc - exp });
          // Collect individual transactions
          for (const t of allTxns) {
            historicalTransactions.push({
              date: t.transactionDate || t.billingDate || t.originalDate,
              amount: t.isIncome ? (t.incomeAmount || t.billingAmount || 0) : Math.abs(t.billingAmount || 0),
              businessName: t.businessName || "",
              category: t.isIncome ? (resolveCategory(t) || "income") : (resolveCategory(t) || ""),
              source: t.source || undefined,
              isIncome: !!t.isIncome || undefined,
            });
          }
        }
      } catch (e: any) {
        errors.push(`budget-history: ${e.message?.slice(0, 100)}`);
      }

      // Apply category overrides to transactions
      processed.transactions = processed.transactions.map((t: any) => {
        const key = `${t.date}_${t.amount}_${t.businessName}`;
        const override = processed.categoryOverrides[key];
        if (override && t.category !== override) return { ...t, category: override };
        return t;
      });
    }

    // Get pension accounts for health score
    const pensionAccounts = await ctx.runQuery(api.queries.getPensionAccounts);

    // Save everything to Convex
    if (balanceData) {
      await ctx.runMutation(api.mutations.replaceBalance, { data: balanceData });
      successCount++;
    }

    if (processed) {
      await ctx.runMutation(api.mutations.replaceTransactions, { items: [...historicalTransactions, ...processed.transactions] });
      await ctx.runMutation(api.mutations.replaceIncome, { items: processed.income });
      await ctx.runMutation(api.mutations.replaceSpending, { items: processed.spending });
      await ctx.runMutation(api.mutations.replaceTrajectory, { data: processed.trajectory });
      successCount += 4;

      // Trends: merge budget trends with current month
      const allTrends = [...budgetTrends];
      const trendMonths = new Set(allTrends.map(t => t.month));
      if (!trendMonths.has(processed.budgetDate)) {
        allTrends.push({
          month: processed.budgetDate,
          income: processed.totalIncome,
          expenses: processed.totalExpenses,
          net: processed.totalIncome - processed.totalExpenses,
        });
      }
      allTrends.sort((a, b) => a.month.localeCompare(b.month));
      await ctx.runMutation(api.mutations.replaceTrends, { items: allTrends });
      successCount++;

      // Health score
      const healthScore = computeHealthScore(
        processed, balanceData, progressData, allTrends, pensionAccounts
      );
      await ctx.runMutation(api.mutations.replaceHealthScore, { data: healthScore });
      successCount++;
    }

    if (progressData) {
      await ctx.runMutation(api.mutations.replaceProgress, { data: progressData });
      successCount++;
    }
    if (plansData) {
      await ctx.runMutation(api.mutations.replacePlans, { data: plansData });
      successCount++;
    }
    if (insightsData) {
      await ctx.runMutation(api.mutations.replaceInsights, { data: insightsData });
      successCount++;
    }

    return {
      ok: successCount > 0,
      refreshedAt: new Date().toISOString(),
      successCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});
