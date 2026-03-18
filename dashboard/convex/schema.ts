import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Singleton tables — each stores one document with the full JSON blob
  balance: defineTable({
    data: v.any(),
    updatedAt: v.number(),
  }),
  healthScore: defineTable({
    data: v.any(),
    updatedAt: v.number(),
  }),
  trajectory: defineTable({
    data: v.any(),
    updatedAt: v.number(),
  }),
  progress: defineTable({
    data: v.any(),
    updatedAt: v.number(),
  }),
  status: defineTable({
    data: v.any(),
    updatedAt: v.number(),
  }),
  plans: defineTable({
    data: v.any(),
    updatedAt: v.number(),
  }),
  insights: defineTable({
    data: v.any(),
    updatedAt: v.number(),
  }),

  // Collection tables
  transactions: defineTable({
    date: v.string(),
    amount: v.number(),
    businessName: v.string(),
    category: v.string(),
    source: v.optional(v.string()),
    isIncome: v.optional(v.boolean()),
  }).index("by_date", ["date"]),

  income: defineTable({
    date: v.string(),
    amount: v.number(),
    businessName: v.string(),
    category: v.string(),
  }).index("by_date", ["date"]),

  spending: defineTable({
    name: v.string(),
    total: v.number(),
    count: v.number(),
  }),

  trends: defineTable({
    month: v.string(),
    income: v.number(),
    expenses: v.number(),
    net: v.number(),
  }).index("by_month", ["month"]),

  pensionAccounts: defineTable({
    accountId: v.string(),
    name: v.string(),
    company: v.string(),
    policy: v.string(),
    status: v.string(),
    currentBalance: v.number(),
    annualInterest: v.number(),
    monthlyDeposit: v.number(),
    monthlyPension: v.number(),
    managementFee: v.number(),
    nameEn: v.string(),
    type: v.string(),
    depositStopAge: v.number(),
    owner: v.string(),
  }).index("by_owner", ["owner"]),

  pensionHistory: defineTable({
    date: v.string(),
    ownerTotals: v.any(),
    totalSavings: v.number(),
  }).index("by_date", ["date"]),

  advisorReports: defineTable({
    report: v.any(),
    createdAt: v.number(),
  }),

  // System config (session credentials, etc.)
  config: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
