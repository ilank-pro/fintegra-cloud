import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function refreshDataPlugin() {
  return {
    name: 'refresh-data',
    configureServer(server) {
      server.middlewares.use('/api/refresh-data', (_req, res) => {
        const fetchScript = join(__dirname, 'src', 'data', 'fetch-data.js')
        const nodeBin = join(__dirname, '..', 'riseup-cli-main', 'node-v22.14.0-darwin-arm64', 'bin', 'node')
        try {
          execSync(`"${nodeBin}" "${fetchScript}"`, {
            encoding: 'utf-8',
            timeout: 120000,
            env: { ...process.env, PATH: `${dirname(nodeBin)}:${process.env.PATH}` },
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: err.message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), refreshDataPlugin()],
})
