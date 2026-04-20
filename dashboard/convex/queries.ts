import { query } from "./_generated/server";
import { v } from "convex/values";

// Config
export const getConfig = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const doc = await ctx.db
      .query("config")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return doc?.value ?? null;
  },
});

// Singleton queries
export const getBalance = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("balance").first();
    return doc?.data ?? null;
  },
});

export const getHealthScore = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("healthScore").first();
    return doc?.data ?? null;
  },
});

export const getTrajectory = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("trajectory").first();
    return doc?.data ?? null;
  },
});

export const getProgress = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("progress").first();
    return doc?.data ?? null;
  },
});

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("status").first();
    return doc?.data ?? null;
  },
});

export const getPlans = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("plans").first();
    return doc?.data ?? null;
  },
});

export const getInsights = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("insights").first();
    return doc?.data ?? null;
  },
});

// Collection queries
export const getTransactions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("transactions").collect();
  },
});

export const getIncome = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("income").collect();
  },
});

export const getSpending = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("spending").collect();
  },
});

export const getTrends = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("trends").collect();
  },
});

export const getPensionAccounts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("pensionAccounts").collect();
  },
});

export const getPensionHistory = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("pensionHistory").collect();
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  },
});

export const getPensionAccountSnapshots = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("pensionAccountSnapshots").collect();
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  },
});

export const getAdvisorHistory = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("advisorReports").order("desc").take(5);
  },
});

export const getWatchedTransactions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("watchedTransactions").collect();
  },
});

export const getSpendingGoals = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("spendingGoals").collect();
  },
});

export const getActionTasks = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("actionTasks").collect();
  },
});
