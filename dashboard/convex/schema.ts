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
    expense: v.optional(v.string()),
    monthsInterval: v.optional(v.number()),
    sequencerName: v.optional(v.string()),
    placement: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    isInstallment: v.optional(v.boolean()),
    paymentNumber: v.optional(v.number()),
    totalPayments: v.optional(v.number()),
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
    ytdReturn: v.optional(v.number()),
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

  pensionAccountSnapshots: defineTable({
    date: v.string(),
    owner: v.string(),
    policyKey: v.string(),
    name: v.string(),
    company: v.string(),
    type: v.string(),
    balance: v.number(),
    ytdReturn: v.number(),
    monthlyDeposit: v.number(),
  })
    .index("by_policy_date", ["policyKey", "date"])
    .index("by_date_owner", ["date", "owner"])
    .index("by_date", ["date"]),

  advisorReports: defineTable({
    report: v.any(),
    metricsSnapshot: v.any(),
    createdAt: v.number(),
  }).index("by_date", ["createdAt"]),

  // Spending management
  watchedTransactions: defineTable({
    businessName: v.string(),
    category: v.string(),
    status: v.string(),
    amount: v.number(),
    dateAdded: v.string(),
  }).index("by_category", ["category"]),

  spendingGoals: defineTable({
    category: v.string(),
    monthlyTarget: v.number(),
    createdAt: v.number(),
  }).index("by_category", ["category"]),

  actionTasks: defineTable({
    title: v.string(),
    category: v.string(),
    status: v.string(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_status", ["status"]),

  // System config (session credentials, etc.)
  config: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
