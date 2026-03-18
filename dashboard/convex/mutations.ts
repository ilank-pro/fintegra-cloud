import { mutation } from "./_generated/server";
import { v } from "convex/values";

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
    if (owner) {
      // Delete only this owner's accounts
      const existing = await ctx.db
        .query("pensionAccounts")
        .withIndex("by_owner", (q) => q.eq("owner", owner))
        .collect();
      for (const doc of existing) await ctx.db.delete(doc._id);
    } else {
      // Delete all
      const existing = await ctx.db.query("pensionAccounts").collect();
      for (const doc of existing) await ctx.db.delete(doc._id);
    }
    for (const a of items) {
      const { id: accountId, ...rest } = a;
      await ctx.db.insert("pensionAccounts", {
        accountId: accountId || a.accountId || `imported-${Date.now()}`,
        name: rest.name,
        company: rest.company,
        policy: rest.policy,
        status: rest.status,
        currentBalance: rest.currentBalance,
        annualInterest: rest.annualInterest,
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
