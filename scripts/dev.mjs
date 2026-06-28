// Development script - starts Vite dev server + Electron
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distMain = path.join(root, 'dist/main');

async function main() {
  // Ensure dist/main exists
  if (!fs.existsSync(distMain)) {
    fs.mkdirSync(distMain, { recursive: true });
  }

  // Step 1: Build main process
  console.log('[JTerm] Building main process...');
  execSync(`npx esbuild src/main/index.ts --bundle --platform=node --outfile=dist/main/index.js --external:electron --external:node-pty --external:ssh2 --external:ssh2-sftp-client --external:simple-git`, {
    cwd: root,
    stdio: 'inherit',
  });
  execSync(`npx esbuild src/main/preload.ts --bundle --platform=node --outfile=dist/main/preload.js --external:electron`, {
    cwd: root,
    stdio: 'inherit',
  });

  // Step 2: Start Vite dev server in background
  console.log('[JTerm] Starting Vite dev server...');
  const viteProcess = spawn('npx', ['vite', '--config', 'vite.config.ts'], {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: true,
  });

  // Wait for Vite to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Step 3: Start Electron
  console.log('[JTerm] Starting Electron...');
  const electronProcess = spawn('npx', ['electron', 'dist/main/index.js'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
    shell: true,
  });

  electronProcess.on('close', (code) => {
    console.log(`[JTerm] Electron exited with code ${code}`);
    viteProcess.kill();
    process.exit(code || 0);
  });

  process.on('SIGINT', () => {
    electronProcess.kill();
    viteProcess.kill();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[JTerm] Error:', err);
  process.exit(1);
});
