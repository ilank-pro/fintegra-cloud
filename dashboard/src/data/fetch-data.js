import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure we are using the portable node and the correct CLI path
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const CLI_PATH = join(PROJECT_ROOT, 'riseup-cli-main', 'dist', 'cli.js');
const NODE_BIN = join(PROJECT_ROOT, 'riseup-cli-main', 'node-v22.14.0-darwin-arm64', 'bin', 'node');
const DATA_DIR = join(__dirname);

// Commands to fetch data for
const commands = [
    'status',
    'balance',
    'spending',
    'income',
    'transactions',
    'trends',
    'progress',
    'plans',
    'insights'
];

console.log('Fetching data from RiseUp CLI...');

for (const cmd of commands) {
    try {
        console.log(`Fetching ${cmd}...`);
        // Execute the CLI command with the --json flag
        const result = execSync(`"${NODE_BIN}" "${CLI_PATH}" ${cmd} --json`, {
            encoding: 'utf-8',
            env: { ...process.env, PATH: `${dirname(NODE_BIN)}:${process.env.PATH}` }
        });

        // Save the raw JSON output to a file
        const outputPath = join(DATA_DIR, `${cmd}.json`);
        writeFileSync(outputPath, result);
        console.log(`  -> Saved to ${outputPath}`);
    } catch (error) {
        console.error(`Failed to fetch ${cmd}:`, error.message);
    }
}

console.log('Data extraction complete.');
