import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "src", "data");

function loadJson(name) {
  return JSON.parse(readFileSync(join(dataDir, name), "utf-8"));
}

const CONVEX_URL = process.env.VITE_CONVEX_URL || "https://limitless-sardine-842.eu-west-1.convex.cloud";

async function seed() {
  const client = new ConvexHttpClient(CONVEX_URL);

  console.log("Seeding Convex at:", CONVEX_URL);

  // Singletons
  const singletons = [
    { name: "balance.json", mutation: api.mutations.replaceBalance },
    { name: "health-score.json", mutation: api.mutations.replaceHealthScore },
    { name: "trajectory.json", mutation: api.mutations.replaceTrajectory },
    { name: "progress.json", mutation: api.mutations.replaceProgress },
    { name: "status.json", mutation: api.mutations.replaceStatus },
    { name: "plans.json", mutation: api.mutations.replacePlans },
    { name: "insights.json", mutation: api.mutations.replaceInsights },
  ];

  for (const { name, mutation } of singletons) {
    try {
      const data = loadJson(name);
      await client.mutation(mutation, { data });
      console.log(`  + ${name}`);
    } catch (err) {
      console.log(`  x ${name}: ${err.message?.slice(0, 100)}`);
    }
  }

  // Collections
  const collections = [
    { name: "transactions.json", mutation: api.mutations.replaceTransactions },
    { name: "income.json", mutation: api.mutations.replaceIncome },
    { name: "spending.json", mutation: api.mutations.replaceSpending },
    { name: "trends.json", mutation: api.mutations.replaceTrends },
  ];

  for (const { name, mutation } of collections) {
    try {
      const items = loadJson(name);
      await client.mutation(mutation, { items });
      console.log(`  + ${name} (${items.length} items)`);
    } catch (err) {
      console.log(`  x ${name}: ${err.message?.slice(0, 100)}`);
    }
  }

  // Pension accounts
  try {
    const accounts = loadJson("pension-accounts.json");
    await client.mutation(api.mutations.replacePensionAccounts, { items: accounts });
    console.log(`  + pension-accounts.json (${accounts.length} accounts)`);
  } catch (err) {
    console.log(`  x pension-accounts.json: ${err.message?.slice(0, 100)}`);
  }

  // Pension history
  try {
    const history = loadJson("pension-history.json");
    await client.mutation(api.mutations.replacePensionHistory, { items: history });
    console.log(`  + pension-history.json (${history.length} entries)`);
  } catch (err) {
    console.log(`  x pension-history.json: ${err.message?.slice(0, 100)}`);
  }

  console.log("\nSeed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
