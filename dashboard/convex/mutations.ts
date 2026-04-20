import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizeDate } from "./dateUtils";

// --- Config mutations ---

export const setConfig = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, { key, value }) => {
    const existing = await ctx.db
      .query("config")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value });
    } else {
      await ctx.db.insert("config", { key, value });
    }
  },
});

// --- Pension account mutations ---

export const updatePensionAccount = mutation({
  args: {
    id: v.id("pensionAccounts"),
    fields: v.any(),
  },
  handler: async (ctx, { id, fields }) => {
    await ctx.db.patch(id, fields);
  },
});

export const addPensionAccount = mutation({
  args: { account: v.any() },
  handler: async (ctx, { account }) => {
    const { id: accountId, ...rest } = account;
    await ctx.db.insert("pensionAccounts", { accountId: accountId || `new-${Date.now()}`, ...rest });
  },
});

export const deletePensionAccount = mutation({
  args: { id: v.id("pensionAccounts") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// --- Pension snapshot ---

export const savePensionSnapshot = mutation({
  args: {
    date: v.string(),
    ownerTotals: v.any(),
    totalSavings: v.number(),
  },
  handler: async (ctx, { date, ownerTotals, totalSavings }) => {
    const existing = await ctx.db
      .query("pensionHistory")
      .withIndex("by_date", (q) => q.eq("date", date))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ownerTotals, totalSavings });
    } else {
      await ctx.db.insert("pensionHistory", { date, ownerTotals, totalSavings });
    }
    return await ctx.db.query("pensionHistory").order("asc").collect();
  },
});

// --- Singleton replacements (for data refresh / seed) ---

async function replaceSingleton(
  ctx: any,
  table: string,
  data: any
) {
  const existing = await ctx.db.query(table).first();
  if (existing) {
    await ctx.db.replace(existing._id, { data, updatedAt: Date.now() });
  } else {
    await ctx.db.insert(table, { data, updatedAt: Date.now() });
  }
}

export const replaceBalance = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => replaceSingleton(ctx, "balance", data),
});

export const replaceHealthScore = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => replaceSingleton(ctx, "healthScore", data),
});

export const replaceTrajectory = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => replaceSingleton(ctx, "trajectory", data),
});

export const replaceProgress = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => replaceSingleton(ctx, "progress", data),
});

export const replaceStatus = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => replaceSingleton(ctx, "status", data),
});

export const replacePlans = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => replaceSingleton(ctx, "plans", data),
});

export const replaceInsights = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => replaceSingleton(ctx, "insights", data),
});

// --- Collection replacements (for data refresh / seed) ---

export const replaceTransactions = mutation({
  args: { items: v.any() },
  handler: async (ctx, { items }) => {
    const existing = await ctx.db.query("transactions").collect();
    for (const doc of existing) await ctx.db.delete(doc._id);
    for (const t of items) {
      await ctx.db.insert("transactions", {
        date: t.date,
        amount: t.amount,
        businessName: t.businessName,
        category: t.category,
        source: t.source || undefined,
        isIncome: t.isIncome || undefined,
        expense: t.expense || undefined,
        monthsInterval: t.monthsInterval || undefined,
        sequencerName: t.sequencerName || undefined,
        placement: t.placement || undefined,
        accountNumber: t.accountNumber || undefined,
        isInstallment: t.isInstallment || undefined,
        paymentNumber: t.paymentNumber || undefined,
        totalPayments: t.totalPayments || undefined,
      });
    }
  },
});

export const replaceIncome = mutation({
  args: { items: v.any() },
  handler: async (ctx, { items }) => {
    const existing = await ctx.db.query("income").collect();
    for (const doc of existing) await ctx.db.delete(doc._id);
    for (const t of items) {
      await ctx.db.insert("income", {
        date: t.date,
        amount: t.amount,
        businessName: t.businessName,
        category: t.category,
      });
    }
  },
});

export const replaceSpending = mutation({
  args: { items: v.any() },
  handler: async (ctx, { items }) => {
    const existing = await ctx.db.query("spending").collect();
    for (const doc of existing) await ctx.db.delete(doc._id);
    for (const t of items) {
      await ctx.db.insert("spending", {
        name: t.name,
        total: t.total,
        count: t.count,
      });
    }
  },
});

export const replaceTrends = mutation({
  args: { items: v.any() },
  handler: async (ctx, { items }) => {
    const existing = await ctx.db.query("trends").collect();
    for (const doc of existing) await ctx.db.delete(doc._id);
    for (const t of items) {
      await ctx.db.insert("trends", {
        month: t.month,
        income: t.income,
        expenses: t.expenses,
        net: t.net,
      });
    }
  },
});

export const replacePensionAccounts = mutation({
  args: { items: v.any(), owner: v.optional(v.string()) },
  handler: async (ctx, { items, owner }) => {
    // Snapshot existing user-edited annualInterest by (owner, policy, name) so
    // re-imports don't clobber the user's projection assumption.
    const prior = owner
      ? await ctx.db
          .query("pensionAccounts")
          .withIndex("by_owner", (q) => q.eq("owner", owner))
          .collect()
      : await ctx.db.query("pensionAccounts").collect();

    const priorRate = new Map<string, number>();
    for (const p of prior) {
      priorRate.set(`${p.owner}|${p.policy}|${p.name}`, p.annualInterest);
    }

    for (const doc of prior) await ctx.db.delete(doc._id);

    for (const a of items) {
      const { id: accountId, ...rest } = a;
      const key = `${rest.owner}|${rest.policy}|${rest.name}`;
      const preservedRate = priorRate.get(key);
      await ctx.db.insert("pensionAccounts", {
        accountId: accountId || a.accountId || `imported-${Date.now()}`,
        name: rest.name,
        company: rest.company,
        policy: rest.policy,
        status: rest.status,
        currentBalance: rest.currentBalance,
        annualInterest: preservedRate ?? rest.annualInterest,
        ytdReturn: rest.ytdReturn,
        monthlyDeposit: rest.monthlyDeposit,
        monthlyPension: rest.monthlyPension,
        managementFee: rest.managementFee,
        nameEn: rest.nameEn,
        type: rest.type,
        depositStopAge: rest.depositStopAge,
        owner: rest.owner,
      });
    }
  },
});

// One-shot migration: rewrite any non-canonical date strings to YYYY-MM-DD
// across pensionHistory and pensionAccountSnapshots. Idempotent.
export const normalizePensionDates = mutation({
  args: {},
  handler: async (ctx) => {
    let historyFixed = 0;
    let snapshotsFixed = 0;

    const histRows = await ctx.db.query("pensionHistory").collect();
    for (const r of histRows) {
      const norm = normalizeDate(r.date);
      if (norm && norm !== r.date) {
        await ctx.db.patch(r._id, { date: norm });
        historyFixed++;
      }
    }

    const snapRows = await ctx.db.query("pensionAccountSnapshots").collect();
    for (const r of snapRows) {
      const norm = normalizeDate(r.date);
      if (norm && norm !== r.date) {
        await ctx.db.patch(r._id, { date: norm });
        snapshotsFixed++;
      }
    }

    return { historyFixed, snapshotsFixed, historyTotal: histRows.length, snapshotsTotal: snapRows.length };
  },
});

export const deletePensionSnapshotByDate = mutation({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const histRows = await ctx.db
      .query("pensionHistory")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
    for (const r of histRows) await ctx.db.delete(r._id);

    const snapRows = await ctx.db
      .query("pensionAccountSnapshots")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
    for (const r of snapRows) await ctx.db.delete(r._id);

    return await ctx.db.query("pensionHistory").order("asc").collect();
  },
});

export const replacePensionSnapshotForDate = mutation({
  args: {
    date: v.string(),
    owner: v.string(),
    items: v.any(),
  },
  handler: async (ctx, { date, owner, items }) => {
    const existing = await ctx.db
      .query("pensionAccountSnapshots")
      .withIndex("by_date_owner", (q) => q.eq("date", date).eq("owner", owner))
      .collect();
    for (const doc of existing) await ctx.db.delete(doc._id);

    for (const it of items) {
      await ctx.db.insert("pensionAccountSnapshots", {
        date,
        owner,
        policyKey: it.policyKey,
        name: it.name,
        company: it.company,
        type: it.type,
        balance: it.balance,
        ytdReturn: it.ytdReturn,
        monthlyDeposit: it.monthlyDeposit,
      });
    }
  },
});

// --- Spending management mutations ---

export const addWatchedTransaction = mutation({
  args: { businessName: v.string(), category: v.string(), status: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("watchedTransactions", { ...args, dateAdded: new Date().toISOString().slice(0, 10) });
  },
});

export const removeWatchedTransaction = mutation({
  args: { id: v.id("watchedTransactions") },
  handler: async (ctx, { id }) => { await ctx.db.delete(id); },
});

export const setSpendingGoal = mutation({
  args: { category: v.string(), monthlyTarget: v.number() },
  handler: async (ctx, { category, monthlyTarget }) => {
    const existing = await ctx.db.query("spendingGoals").withIndex("by_category", q => q.eq("category", category)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { monthlyTarget });
    } else {
      await ctx.db.insert("spendingGoals", { category, monthlyTarget, createdAt: Date.now() });
    }
  },
});

export const removeSpendingGoal = mutation({
  args: { id: v.id("spendingGoals") },
  handler: async (ctx, { id }) => { await ctx.db.delete(id); },
});

export const addActionTask = mutation({
  args: { title: v.string(), category: v.string() },
  handler: async (ctx, { title, category }) => {
    await ctx.db.insert("actionTasks", { title, category, status: "todo", createdAt: Date.now() });
  },
});

export const toggleActionTask = mutation({
  args: { id: v.id("actionTasks") },
  handler: async (ctx, { id }) => {
    const task = await ctx.db.get(id);
    if (!task) return;
    await ctx.db.patch(id, {
      status: task.status === "todo" ? "done" : "todo",
      completedAt: task.status === "todo" ? Date.now() : undefined,
    });
  },
});

export const removeActionTask = mutation({
  args: { id: v.id("actionTasks") },
  handler: async (ctx, { id }) => { await ctx.db.delete(id); },
});

export const saveAdvisorReport = mutation({
  args: { report: v.any(), metricsSnapshot: v.any() },
  handler: async (ctx, { report, metricsSnapshot }) => {
    await ctx.db.insert("advisorReports", { report, metricsSnapshot, createdAt: Date.now() });
  },
});

export const clearAdvisorReports = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("advisorReports").collect();
    for (const doc of all) await ctx.db.delete(doc._id);
  },
});

export const replacePensionHistory = mutation({
  args: { items: v.any() },
  handler: async (ctx, { items }) => {
    const existing = await ctx.db.query("pensionHistory").collect();
    for (const doc of existing) await ctx.db.delete(doc._id);
    for (const h of items) {
      await ctx.db.insert("pensionHistory", {
        date: h.date,
        ownerTotals: h.ownerTotals,
        totalSavings: h.totalSavings,
      });
    }
  },
});
