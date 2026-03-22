import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import * as XLSX from "xlsx";

const http = httpRouter();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function corsResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// CORS preflight for all routes
for (const path of ["/import-pension", "/advisor", "/advisor-chat", "/refresh"]) {
  http.route({
    path,
    method: "OPTIONS",
    handler: httpAction(async () => {
      return new Response(null, { status: 204, headers: corsHeaders });
    }),
  });
}

// --- Pension XLS Import ---
http.route({
  path: "/import-pension",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const contentType = request.headers.get("content-type") || "";

      let fileBuffer: ArrayBuffer;
      let owner = "ilan";

      if (contentType.includes("multipart/form-data")) {
        // Parse multipart form data
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        owner = (formData.get("owner") as string) || "ilan";
        if (!file) {
          return new Response(JSON.stringify({ ok: false, error: "No file found in upload" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        fileBuffer = await file.arrayBuffer();
      } else {
        // Raw binary upload
        fileBuffer = await request.arrayBuffer();
        const url = new URL(request.url);
        owner = url.searchParams.get("owner") || "ilan";
      }

      // Parse XLS with SheetJS
      const wb = XLSX.read(new Uint8Array(fileBuffer), { type: "array" });

      const productsSheet = wb.Sheets["פרטי המוצרים שלי"];
      const depositsSheet = wb.Sheets["מעקב הפקדות"];

      if (!productsSheet) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Sheet "פרטי המוצרים שלי" not found' }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Build deposit map from tracking sheet
      const activeDeposits: Record<string, number> = {};
      if (depositsSheet) {
        const depsData = XLSX.utils.sheet_to_json(depositsSheet, { header: 1 }) as any[][];
        for (let r = 1; r < depsData.length; r++) {
          const row = depsData[r];
          const policy = String(row[2] || "");
          const emp = Number(row[6]) || 0;
          const empr = Number(row[7]) || 0;
          const pitz = Number(row[8]) || 0;
          activeDeposits[policy] = emp + empr + pitz;
        }
      }

      // Parse accounts
      const prodData = XLSX.utils.sheet_to_json(productsSheet, { header: 1 }) as any[][];
      const accounts: any[] = [];
      let dataDate: string | null = null;

      const defaultRetAge = owner === "spouse" ? 65 : 63;

      for (let r = 1; r < prodData.length; r++) {
        const row = prodData[r];
        const name = String(row[0] || "");
        const company = String(row[1] || "");
        const policy = String(row[2] || "");
        const statusHeb = String(row[3] || "");
        const savings = Number(row[4]) || 0;
        const expected = Number(row[8]) || 0;
        const pensionMo = Number(row[9]) || 0;
        const mgmtFee = Number(row[12]) || 0;
        const ytdReturn = Number(row[13]) || 0;
        const monthlyDeposit = activeDeposits[policy] || 0;

        if (!dataDate && row[29]) dataDate = String(row[29]);

        if (savings > 0 || expected > 0) {
          const type = name.includes("השתלמות")
            ? "hishtalmut"
            : name.includes("פנסיה")
              ? "pension"
              : name.includes("גמל")
                ? "gemel"
                : "insurance_savings";

          accounts.push({
            id: `${owner}-${policy.replace(/[^a-zA-Z0-9]/g, "-")}-${accounts.length}`,
            name,
            company,
            policy,
            status: statusHeb === "פעיל" ? "active" : "inactive",
            currentBalance: savings,
            annualInterest: ytdReturn,
            monthlyDeposit,
            monthlyPension: pensionMo,
            managementFee: mgmtFee,
            nameEn: name,
            type,
            depositStopAge: defaultRetAge,
            owner,
          });
        }
      }

      if (!dataDate) dataDate = new Date().toISOString().slice(0, 10);

      // Save to Convex
      await ctx.runMutation(api.mutations.replacePensionAccounts, {
        items: accounts,
        owner,
      });

      // Compute totals for snapshot
      const allAccounts = await ctx.runQuery(api.queries.getPensionAccounts);
      const ownerTotals: Record<string, number> = {};
      let totalSavings = 0;
      for (const a of allAccounts) {
        const o = a.owner || "ilan";
        ownerTotals[o] = (ownerTotals[o] || 0) + (a.currentBalance || 0);
        totalSavings += a.currentBalance || 0;
      }

      const history = await ctx.runMutation(api.mutations.savePensionSnapshot, {
        date: dataDate,
        ownerTotals,
        totalSavings,
      });

      return new Response(
        JSON.stringify({ ok: true, accounts: allAccounts, dataDate, history }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ ok: false, error: (err.message || "Unknown error").slice(0, 200) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// --- AI Advisor ---
http.route({
  path: "/advisor",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    try {
      const { apiKey, findings, dataSummary, previousReport, metricsHistory } = await request.json();

      if (!apiKey) {
        return corsResponse({ ok: false, error: "API key required" }, 400);
      }

      const systemPrompt = `You are a professional Israeli financial advisor. Analyze the client's financial data and return a structured JSON report. Be direct, use specific numbers (ILS ₪), and provide actionable recommendations.

${previousReport ? `## Previous Report Context
You previously provided a report to this client. Compare the current data to your previous analysis. Note what has changed, improved, or worsened. Reference your prior recommendations and whether the client appears to have acted on them. Mention specific changes in the executiveSummary (e.g. "Since our last review, your savings rate improved from X to Y").

Previous report executive summary: ${previousReport.executiveSummary || "N/A"}
Previous key findings: ${(previousReport.topFindings || []).map((f: any) => f.title).join(", ") || "N/A"}
Previous improvement plan: ${(previousReport.improvementPlan || []).map((s: any) => s.title).join(", ") || "N/A"}
Previous overall risk: ${previousReport.overallRisk || "N/A"}` : ""}

${metricsHistory?.length > 0 ? `## Metrics History (oldest to newest)
Track these metrics over time and identify trends in your analysis:
${JSON.stringify(metricsHistory, null, 2)}` : ""}

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation outside the JSON. Use this exact schema:

{
  "executiveSummary": "2-3 sentence overview of financial health, mentioning key strengths and concerns",
  "overallRisk": "low" | "medium" | "high" | "critical",
  "keyMetrics": [
    { "label": "short name", "value": number, "format": "currency" | "percent" | "months", "trend": "up" | "down" | "stable", "insight": "one sentence explanation" }
  ],
  "topFindings": [
    { "title": "short title", "severity": "critical" | "warning" | "good", "detail": "what we found with specific numbers", "action": "specific actionable recommendation" }
  ],
  "improvementPlan": [
    { "step": 1, "title": "action title", "description": "detailed how-to with numbers", "impact": "high" | "medium" | "low", "timeframe": "e.g. 1 month", "targetSaving": number_in_ILS }
  ],
  "categoryTargets": [
    { "category": "English category name", "current": number, "target": number, "strategy": "how to achieve the target" }
  ],
  "riskMatrix": [
    { "risk": "risk name", "level": "high" | "medium" | "low", "mitigation": "how to address it" }
  ],
  "savingsInsights": {
    "status": "summary of current savings position across all accounts",
    "highlights": [
      { "account": "account name", "insight": "specific observation about this account", "action": "what to do" }
    ]
  },
  "pensionInsights": {
    "status": "summary of pension readiness — projected income vs needs",
    "retirementGap": "description of any gap between projected and needed retirement income",
    "highlights": [
      { "account": "account name", "insight": "specific observation", "action": "what to do" }
    ]
  },
  "pensionRecommendations": [
    { "priority": 1, "title": "recommendation title", "description": "detailed recommendation with numbers", "impact": "high" | "medium" | "low", "category": "consolidation" | "contribution" | "allocation" | "fees" | "tax" }
  ],
  "monthlyChecklist": ["actionable item 1", "actionable item 2"],
  "longTermOutlook": "1-2 paragraph forward-looking narrative about their financial trajectory and what achieving the plan would mean"
}

Include 3-4 keyMetrics, 4-5 topFindings, exactly 5 improvementPlan steps, 4-6 categoryTargets, 3-5 riskMatrix items, 2-4 savingsInsights highlights, 2-4 pensionInsights highlights, 3-5 pensionRecommendations, and 5-7 monthlyChecklist items. The client is 53 years old with retirement target age 63.

IMPORTANT — Transaction Metadata Rules:
The transactionsByMerchant data includes rich metadata for each merchant:
- "expense": the TRUE spending category (e.g. "Housing") — this is DEFINITIVE, always use it
- "frequency": how often this expense recurs ("monthly", "bi-monthly", etc.)
- "placement": "fixed" means committed recurring expense, not discretionary
- "accountNumber": the bank account or recipient account number
- "installment": payment progress like "3/12"

CRITICAL: When a merchant has category "Housing" or any other identified expense category, it is a KNOWN, IDENTIFIED expense. Do NOT call it "mysterious", "unknown", "unsolved", or suggest investigating it. A check payment categorized as "Housing" with frequency "bi-monthly" is simply a bi-monthly housing/rent payment — state it as a known fixed housing commitment. Even if previous reports called something "mysterious", if the current data now shows an identified category, treat it as resolved and identified. Never use the word "mystery" for categorized expenses.`;

      const userMessage = `Here is the client's financial data and automated findings:

## Automated Findings
${findings.map((f: any) => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.finding}`).join("\n")}

## Financial Data Summary
${JSON.stringify(dataSummary, null, 2)}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return corsResponse({ ok: false, error: `API error: ${response.status} ${errText.slice(0, 200)}` }, response.status);
      }

      const result = (await response.json()) as any;
      const report = result.content?.[0]?.text || "No report generated";

      return corsResponse({ ok: true, report });
    } catch (err: any) {
      return corsResponse({ ok: false, error: err.message || "Unknown error" }, 500);
    }
  }),
});

// --- AI Chat ---
http.route({
  path: "/advisor-chat",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    try {
      const { apiKey, messages, dataSummary, reportSummary } = await request.json();

      if (!apiKey) return corsResponse({ ok: false, error: "API key required" }, 400);
      if (!messages?.length) return corsResponse({ ok: false, error: "No messages" }, 400);

      const systemPrompt = `You are a professional Israeli financial advisor continuing a consultation. You have already provided a detailed report to this client. Use their financial data below to answer follow-up questions accurately. Be specific with numbers (ILS ₪). Keep responses concise (2-4 paragraphs max) unless the user asks for more detail. Format key numbers in bold using **number** syntax.

## Client's Financial Data
${JSON.stringify(dataSummary, null, 2)}

## Report Summary
${reportSummary}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: systemPrompt,
          messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return corsResponse({ ok: false, error: `API error: ${response.status} ${errText.slice(0, 200)}` }, response.status);
      }

      const result = (await response.json()) as any;
      const content = result.content?.[0]?.text || "No response generated";

      return corsResponse({ ok: true, content });
    } catch (err: any) {
      return corsResponse({ ok: false, error: err.message || "Unknown error" }, 500);
    }
  }),
});

// --- Data Refresh ---
http.route({
  path: "/refresh",
  method: "POST",
  handler: httpAction(async (ctx) => {
    try {
      const result = await ctx.runAction(api.refreshAction.refreshData);
      return corsResponse(result, result.ok ? 200 : 500);
    } catch (err: any) {
      return corsResponse({ ok: false, error: err.message || "Refresh failed" }, 500);
    }
  }),
});

export default http;
