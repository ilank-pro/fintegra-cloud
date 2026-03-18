import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function refreshDataPlugin() {
  return {
    name: 'refresh-data',
    configureServer(server) {
      server.middlewares.use('/api/refresh-data', (_req, res) => {
        const cliDir = join(__dirname, '..', 'riseup-cli-main')
        const cliJs = join(cliDir, 'dist', 'cli.js')
        const dataDir = join(__dirname, 'src', 'data')
        const logFile = join(__dirname, 'refresh.log')
        const fs = require('fs')

        const log: string[] = []
        const addLog = (msg: string) => {
          const line = `[${new Date().toISOString()}] ${msg}`
          log.push(line)
          console.log(`[refresh-data] ${msg}`)
        }

        const flushLog = () => {
          try { fs.writeFileSync(logFile, log.join('\n') + '\n') } catch {}
        }

        addLog('=== Refresh started ===')
        addLog(`CLI path: ${cliJs}`)
        addLog(`Data dir: ${dataDir}`)

        // Check CLI is built
        if (!fs.existsSync(cliJs)) {
          addLog('ERROR: CLI not built — dist/cli.js missing')
          flushLog()
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'CLI not built. Run: cd riseup-cli-main && npm install && npm run build' }))
          return
        }

        const errors: string[] = []
        let successCount = 0

        const runCli = (args: string): string | null => {
          addLog(`Running: node cli.js ${args}`)
          try {
            const result = execSync(`node "${cliJs}" ${args}`, {
              encoding: 'utf-8',
              timeout: 30000,
              cwd: cliDir,
            })
            addLog(`  OK — ${result.length} chars`)
            return result
          } catch (err) {
            const msg = (err as any).stderr || (err as Error).message || 'unknown error'
            const short = String(msg).slice(0, 200)
            addLog(`  FAILED: ${short}`)
            errors.push(`${args}: ${short}`)
            return null
          }
        }

        const writeJson = (name: string, data: string) => {
          const outPath = join(dataDir, `${name}.json`)
          fs.writeFileSync(outPath, data)
          addLog(`  Wrote ${name}.json (${data.length} chars)`)
          successCount++
        }

        // Simple commands — single fetch
        for (const cmd of ['status', 'balance', 'spending', 'progress', 'plans', 'insights']) {
          const result = runCli(`${cmd} --json`)
          if (result) writeJson(cmd, result)
        }

        // Trends — default (3) returns the most recent months
        // Higher counts go further back, not forward
        const trendsResult = runCli('trends --json')
        if (trendsResult) {
          writeJson('trends', trendsResult)
          try {
            const parsed = JSON.parse(trendsResult)
            if (Array.isArray(parsed)) addLog(`  Trends months: ${parsed.map((r: any) => r.month).join(', ')}`)
          } catch {}
        }

        // Build list of months to fetch: current, prev, and explicit recent months
        const now = new Date()
        const calendarMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        // 2 months ago as explicit YYYY-MM (Commander chokes on "-2")
        const twoAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1)
        const twoAgoMonth = `${twoAgo.getFullYear()}-${String(twoAgo.getMonth() + 1).padStart(2, '0')}`
        const monthArgs = ['current', 'prev', twoAgoMonth, calendarMonth]
        const uniqueMonthArgs = [...new Set(monthArgs)]
        addLog(`Month args to fetch: ${uniqueMonthArgs.join(', ')}`)

        // Helper to merge arrays with dedup
        const mergeArrays = (results: (string | null)[], label: string): any[] => {
          const merged: any[] = []
          const seen = new Set<string>()
          for (const raw of results) {
            if (!raw) continue
            try {
              const arr = JSON.parse(raw)
              if (Array.isArray(arr)) {
                addLog(`  Parsed ${arr.length} ${label} entries`)
                for (const t of arr) {
                  const key = `${t.date}_${t.amount}_${t.businessName}`
                  if (!seen.has(key)) { seen.add(key); merged.push(t) }
                }
              }
            } catch (e) {
              addLog(`  Failed to parse ${label} JSON: ${(e as Error).message}`)
            }
          }
          return merged
        }

        // Transactions — fetch multiple months
        const txnResults = uniqueMonthArgs.map(m => runCli(`transactions ${m} --json`))
        const mergedTxns = mergeArrays(txnResults, 'transactions')
        if (mergedTxns.length > 0) {
          writeJson('transactions', JSON.stringify(mergedTxns, null, 2))
          const txnMonths = [...new Set(mergedTxns.map((t: any) => t.date?.slice(0, 7)).filter(Boolean))].sort()
          addLog(`  Transaction months: ${txnMonths.join(', ')}`)
        } else {
          addLog('  WARNING: No transactions merged')
        }

        // Income — fetch multiple months
        const incResults = uniqueMonthArgs.map(m => runCli(`income ${m} --json`))
        const mergedInc = mergeArrays(incResults, 'income')
        if (mergedInc.length > 0) {
          writeJson('income', JSON.stringify(mergedInc, null, 2))
          const incMonths = [...new Set(mergedInc.map((t: any) => t.date?.slice(0, 7)).filter(Boolean))].sort()
          addLog(`  Income months: ${incMonths.join(', ')}`)
        } else {
          addLog('  WARNING: No income merged')
        }

        // Fetch current budget via /api/budget/current (has live in-progress data)
        addLog('--- Fetching current budget via fetch-current.mjs ---')
        const fetchCurrentScript = join(dataDir, 'fetch-current.mjs')
        try {
          const currentRaw = execSync(`node "${fetchCurrentScript}"`, {
            encoding: 'utf-8',
            timeout: 30000,
            cwd: cliDir,
          })
          const current = JSON.parse(currentRaw)
          addLog(`  Current budget: ${current.budgetDate}, ${current.transactions.length} txns, updated ${current.lastUpdatedAt}`)

          // Merge current transactions into existing transactions.json
          // Current budget data takes priority (has user category overrides)
          const existingTxnPath = join(dataDir, 'transactions.json')
          let allTxns: any[] = []
          try { allTxns = JSON.parse(fs.readFileSync(existingTxnPath, 'utf-8')) } catch {}
          const currentTxnMap = new Map<string, any>()
          for (const t of current.transactions) {
            currentTxnMap.set(`${t.date}_${t.amount}_${t.businessName}`, t)
          }
          let replacedTxns = 0, addedTxns = 0
          // Replace existing entries with current budget version where keys match
          allTxns = allTxns.map((t: any) => {
            const key = `${t.date}_${t.amount}_${t.businessName}`
            if (currentTxnMap.has(key)) {
              replacedTxns++
              const replacement = currentTxnMap.get(key)
              currentTxnMap.delete(key)
              return replacement
            }
            return t
          })
          // Add any remaining current transactions that weren't in existing
          for (const t of currentTxnMap.values()) {
            allTxns.push(t)
            addedTxns++
          }
          // Use per-transaction category overrides from budget API (includes previous months)
          const categoryOverrides = new Map<string, string>()
          // From fetch-current.mjs which fetches trackingCategory from current + 2 previous budgets
          if (current.categoryOverrides) {
            for (const [key, cat] of Object.entries(current.categoryOverrides)) {
              categoryOverrides.set(key, cat as string)
            }
            addLog(`  Category overrides: ${categoryOverrides.size} from budget API`)
          }
          // Also add from current transactions (resolveCategory already applied)
          for (const t of current.transactions) {
            if (t.category && t.date && t.businessName) {
              const key = `${t.date}_${t.amount}_${t.businessName}`
              if (!categoryOverrides.has(key)) categoryOverrides.set(key, t.category)
            }
          }
          // Apply overrides to ALL transactions (including historical CLI-fetched ones)
          let overridden = 0
          allTxns = allTxns.map((t: any) => {
            const key = `${t.date}_${t.amount}_${t.businessName}`
            const override = categoryOverrides.get(key)
            if (override && t.category !== override) {
              overridden++
              return { ...t, category: override }
            }
            return t
          })

          writeJson('transactions', JSON.stringify(allTxns, null, 2))
          const allTxnMonths = [...new Set(allTxns.map((t: any) => t.date?.slice(0, 7)).filter(Boolean))].sort()
          addLog(`  Merged transactions: ${replacedTxns} replaced, ${addedTxns} new, ${overridden} category overrides (total ${allTxns.length}), months: ${allTxnMonths.join(', ')}`)

          // Merge current income into existing income.json (current budget takes priority)
          const existingIncPath = join(dataDir, 'income.json')
          let allInc: any[] = []
          try { allInc = JSON.parse(fs.readFileSync(existingIncPath, 'utf-8')) } catch {}
          const currentIncMap = new Map<string, any>()
          for (const t of current.income) {
            currentIncMap.set(`${t.date}_${t.amount}_${t.businessName}`, t)
          }
          let addedInc = 0
          allInc = allInc.map((t: any) => {
            const key = `${t.date}_${t.amount}_${t.businessName}`
            if (currentIncMap.has(key)) {
              const replacement = currentIncMap.get(key)
              currentIncMap.delete(key)
              return replacement
            }
            return t
          })
          for (const t of currentIncMap.values()) {
            allInc.push(t)
            addedInc++
          }
          writeJson('income', JSON.stringify(allInc, null, 2))
          addLog(`  Merged ${addedInc} new income entries (total ${allInc.length})`)

          // Overwrite spending.json with current budget's spending (most relevant)
          writeJson('spending', JSON.stringify(current.spending, null, 2))
          addLog(`  Updated spending.json with ${current.spending.length} categories from current budget`)

          // Write trajectory.json
          if (current.trajectory) {
            writeJson('trajectory', JSON.stringify(current.trajectory, null, 2))
            addLog(`  Wrote trajectory.json: ${current.trajectory.categories.length} categories, ${current.trajectory.pctMonthElapsed}% elapsed`)
          }

          // Write health-score.json
          if (current.healthScore) {
            writeJson('health-score', JSON.stringify(current.healthScore, null, 2))
            addLog(`  Health score: ${current.healthScore.composite}/100 (${current.healthScore.grade}), Level ${current.healthScore.level}`)
          }

          // Merge budget trends into trends.json (fills gaps like missing Feb)
          const existingTrendsPath = join(dataDir, 'trends.json')
          let allTrends: any[] = []
          try { allTrends = JSON.parse(fs.readFileSync(existingTrendsPath, 'utf-8')) } catch {}
          const trendMonths = new Set(allTrends.map((t: any) => t.month))
          let trendsAdded = 0
          // Add from budget API (includes current + previous months)
          for (const bt of (current.budgetTrends || [])) {
            if (!trendMonths.has(bt.month)) {
              allTrends.push(bt)
              trendMonths.add(bt.month)
              trendsAdded++
            }
          }
          // Also ensure current month is present
          if (!trendMonths.has(current.budgetDate)) {
            allTrends.push({
              month: current.budgetDate,
              income: current.totalIncome,
              expenses: current.totalExpenses,
              net: current.totalIncome - current.totalExpenses,
            })
            trendsAdded++
          }
          if (trendsAdded > 0) {
            allTrends.sort((a: any, b: any) => a.month.localeCompare(b.month))
            writeJson('trends', JSON.stringify(allTrends, null, 2))
            addLog(`  Added ${trendsAdded} months to trends. All months: ${allTrends.map((t: any) => t.month).join(', ')}`)
          } else {
            addLog(`  Trends up to date: ${allTrends.map((t: any) => t.month).join(', ')}`)
          }
        } catch (err) {
          const msg = (err as any).stderr || (err as Error).message || 'unknown'
          addLog(`  FAILED to fetch current budget: ${String(msg).slice(0, 300)}`)
          errors.push(`current-budget: ${String(msg).slice(0, 100)}`)
        }

        addLog(`=== Refresh done: ${successCount} files written, ${errors.length} errors ===`)
        flushLog()

        if (successCount === 0) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: errors[0] || 'All commands failed' }))
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, errors: errors.length > 0 ? errors : undefined }))
        }
      })
    },
  }
}

function pensionImportPlugin() {
  return {
    name: 'pension-import',
    configureServer(server) {
      server.middlewares.use('/api/import-pension', (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'POST with file upload required' }))
          return
        }

        // Collect uploaded file data
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          try {
            const fs = require('fs')
            const os = require('os')
            const body = Buffer.concat(chunks)

            // Extract file from multipart form data
            const boundary = req.headers['content-type']?.split('boundary=')[1]
            if (!boundary) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'No file boundary found' }))
              return
            }

            // Find file content between boundaries
            const bodyStr = body.toString('latin1')
            const parts = bodyStr.split('--' + boundary)
            let fileContent: Buffer | null = null
            for (const part of parts) {
              if (part.includes('filename=')) {
                const headerEnd = part.indexOf('\r\n\r\n')
                if (headerEnd >= 0) {
                  const dataStr = part.substring(headerEnd + 4)
                  // Remove trailing \r\n
                  const trimmed = dataStr.endsWith('\r\n') ? dataStr.slice(0, -2) : dataStr
                  fileContent = Buffer.from(trimmed, 'latin1')
                }
              }
            }

            if (!fileContent) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'No file found in upload' }))
              return
            }

            // Save to temp file
            const tmpPath = join(os.tmpdir(), 'pension-import-' + Date.now() + '.xls')
            fs.writeFileSync(tmpPath, fileContent)

          // Use python to parse XLS (xlrd already installed)
          const xlsPath = tmpPath
          const result = execSync(`/Applications/Xcode.app/Contents/Developer/usr/bin/python3 << 'PYEOF'
import xlrd, json
wb = xlrd.open_workbook("${xlsPath}")
sheet = wb.sheet_by_name("פרטי המוצרים שלי")
deps_sheet = wb.sheet_by_name("מעקב הפקדות")

# Build actual monthly deposits from deposit tracking sheet (latest entry per policy)
active_deposits = {}
for r in range(1, deps_sheet.nrows):
    policy = str(deps_sheet.cell_value(r, 2))
    emp = deps_sheet.cell_value(r, 6) or 0
    empr = deps_sheet.cell_value(r, 7) or 0
    pitz = deps_sheet.cell_value(r, 8) or 0
    active_deposits[policy] = emp + empr + pitz

accounts = []
for r in range(1, sheet.nrows):
    name = sheet.cell_value(r, 0)
    company = sheet.cell_value(r, 1)
    policy = str(sheet.cell_value(r, 2))
    status = sheet.cell_value(r, 3)
    savings = sheet.cell_value(r, 4) or 0
    expected = sheet.cell_value(r, 8) or 0
    pension_mo = sheet.cell_value(r, 9) or 0
    mgmt_fee = sheet.cell_value(r, 12) or 0
    ytd_return = sheet.cell_value(r, 13) or 0
    # Use deposit tracking sheet for actual monthly deposits (not products sheet)
    monthly_deposit = active_deposits.get(policy, 0)
    if savings > 0 or expected > 0:
        accounts.append({
            "name": name, "company": company, "policy": policy,
            "status": "active" if status == "פעיל" else "inactive",
            "currentBalance": savings, "annualInterest": ytd_return,
            "monthlyDeposit": monthly_deposit, "monthlyPension": pension_mo,
            "managementFee": mgmt_fee,
        })
# All accounts come from XLS — no hardcoded entries
# Extract data date from first account's date column (col 29)
data_date = None
for r in range(1, sheet.nrows):
    val = sheet.cell_value(r, 29)
    if val:
        data_date = val
        break
print(json.dumps({"accounts": accounts, "dataDate": data_date}, ensure_ascii=False))
PYEOF`, { encoding: 'utf-8', timeout: 10000 })

          const parsed = JSON.parse(result)
          const accounts = parsed.accounts || parsed
          const dataDate = parsed.dataDate || new Date().toISOString().slice(0, 10)

          // Determine owner from URL query
          const urlObj = new URL(req.url || '', 'http://localhost')
          const owner = urlObj.searchParams.get('owner') || 'ilan'
          const defaultRetAge = owner === 'spouse' ? 65 : 63

          // Add IDs, English names, and owner tag
          const withIds = accounts.map((a: any, i: number) => ({
            id: `${owner}-${a.policy.replace(/[^a-zA-Z0-9]/g, '-')}-${i}`,
            ...a,
            nameEn: a.name,
            type: a.name.includes('השתלמות') ? 'hishtalmut' : a.name.includes('פנסיה') ? 'pension' : a.name.includes('גמל') ? 'gemel' : 'insurance_savings',
            depositStopAge: defaultRetAge,
            owner,
          }))

          // Merge with existing accounts (keep the other owner's accounts)
          const dataDir2 = join(__dirname, 'src', 'data')
          const outPath = join(dataDir2, 'pension-accounts.json')
          let existingAccounts: any[] = []
          try { existingAccounts = JSON.parse(fs.readFileSync(outPath, 'utf-8')) } catch {}
          const otherOwnerAccounts = existingAccounts.filter((a: any) => a.owner !== owner)
          const allAccounts = [...otherOwnerAccounts, ...withIds]
          fs.writeFileSync(outPath, JSON.stringify(allAccounts, null, 2))

          // Save history entry (keyed by date — overwrite same date)
          const historyPath = join(dataDir2, 'pension-history.json')
          let history: any[] = []
          try { history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')) } catch {}
          // Compute per-owner totals from all accounts (both owners)
          const ownerTotals: Record<string, number> = {}
          let totalSavings = 0
          for (const a of allAccounts) {
            const o = a.owner || 'ilan'
            ownerTotals[o] = (ownerTotals[o] || 0) + (a.currentBalance || 0)
            totalSavings += (a.currentBalance || 0)
          }
          const entry = { date: dataDate, ownerTotals, totalSavings }
          const existingIdx = history.findIndex((h: any) => h.date === dataDate)
          if (existingIdx >= 0) history[existingIdx] = entry
          else history.push(entry)
          history.sort((a: any, b: any) => a.date.localeCompare(b.date))
          fs.writeFileSync(historyPath, JSON.stringify(history, null, 2))

          // Clean up temp file
          try { fs.unlinkSync(tmpPath) } catch {}

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, accounts: allAccounts, dataDate, history }))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: (err as Error).message?.slice(0, 200) }))
          }
        })
      })
    },
  }
}

function advisorPlugin() {
  return {
    name: 'advisor-api',
    configureServer(server) {
      server.middlewares.use('/api/advisor', (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'POST only' }))
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', async () => {
          try {
            const { apiKey, findings, dataSummary } = JSON.parse(body)

            if (!apiKey) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'API key required' }))
              return
            }

            const systemPrompt = `You are a professional Israeli financial advisor. Analyze the client's financial data and return a structured JSON report. Be direct, use specific numbers (ILS ₪), and provide actionable recommendations.

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
  "monthlyChecklist": ["actionable item 1", "actionable item 2", ...],
  "longTermOutlook": "1-2 paragraph forward-looking narrative about their financial trajectory and what achieving the plan would mean"
}

Include 3-4 keyMetrics, 4-5 topFindings, exactly 5 improvementPlan steps, 4-6 categoryTargets, 3-5 riskMatrix items, 2-4 savingsInsights highlights, 2-4 pensionInsights highlights, 3-5 pensionRecommendations, and 5-7 monthlyChecklist items. The client is 53 years old with retirement target age 63.`

            const userMessage = `Here is the client's financial data and automated findings:

## Automated Findings
${findings.map((f: any) => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.finding}`).join('\n')}

## Financial Data Summary
${JSON.stringify(dataSummary, null, 2)}`

            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4000,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }],
              }),
            })

            if (!response.ok) {
              const errText = await response.text()
              res.writeHead(response.status, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: `API error: ${response.status} ${errText.slice(0, 200)}` }))
              return
            }

            const result = await response.json() as any
            const report = result.content?.[0]?.text || 'No report generated'

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, report }))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: (err as Error).message }))
          }
        })
      })
    },
  }
}

function pensionSnapshotPlugin() {
  return {
    name: 'pension-snapshot',
    configureServer(server) {
      server.middlewares.use('/api/save-pension-snapshot', (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'POST only' }))
          return
        }
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const fs = require('fs')
            const { accounts } = JSON.parse(body)
            if (!Array.isArray(accounts)) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'accounts array required' }))
              return
            }

            const ownerTotals: Record<string, number> = {}
            let totalSavings = 0
            for (const a of accounts) {
              const owner = a.owner || 'ilan'
              ownerTotals[owner] = (ownerTotals[owner] || 0) + (a.currentBalance || 0)
              totalSavings += (a.currentBalance || 0)
            }

            const today = new Date().toISOString().slice(0, 10)
            const historyPath = join(__dirname, 'src', 'data', 'pension-history.json')
            let history: any[] = []
            try { history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')) } catch {}

            const entry = { date: today, ownerTotals, totalSavings }
            const existingIdx = history.findIndex((h: any) => h.date === today)
            if (existingIdx >= 0) history[existingIdx] = entry
            else history.push(entry)
            history.sort((a: any, b: any) => a.date.localeCompare(b.date))

            fs.writeFileSync(historyPath, JSON.stringify(history, null, 2))

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, history }))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: (err as Error).message?.slice(0, 200) }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), refreshDataPlugin(), advisorPlugin(), pensionImportPlugin(), pensionSnapshotPlugin()],
})
