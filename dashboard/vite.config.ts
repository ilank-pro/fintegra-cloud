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

// pensionImportPlugin, advisorPlugin, pensionSnapshotPlugin moved to convex/http.ts

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), refreshDataPlugin()],
})
