import { defineConfig, devices } from '@playwright/test'

const backendPort = process.env.SEM5_E2E_BACKEND_PORT || '8000'
const frontendPort = process.env.SEM5_E2E_FRONTEND_PORT || '5173'
const apiBase = `http://localhost:${backendPort}`
const frontendBase = `http://localhost:${frontendPort}`
const reuseExistingServer = process.env.SEM5_E2E_REUSE_SERVERS === '1'

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/portability.spec.ts', // Requires the separately verified empty-database snapshot.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: frontendBase,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'python tests/e2e_server.py',
      cwd: '../backend',
      url: `${apiBase}/health`,
      env: { SEM5_E2E_BACKEND_PORT: backendPort, SEM5_E2E_FRONTEND_URL: frontendBase },
      reuseExistingServer,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --port ${frontendPort} --strictPort`,
      cwd: '.',
      url: frontendBase,
      env: { VITE_API_BASE_URL: apiBase },
      reuseExistingServer,
      timeout: 60_000,
    },
  ],
})
