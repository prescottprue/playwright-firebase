import { defineConfig, devices } from '@playwright/test'
import type { FirebaseWorkerFixtures } from 'playwright-firebase'

const port = 5173

export default defineConfig<{}, FirebaseWorkerFixtures>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    // Must match the app's config in .env.test
    firebaseConfig: {
      apiKey: 'demo-api-key',
      appOptions: { projectId: 'demo-playwright-firebase' },
      // Used when the emulators are started separately (`npm run emulators`).
      // `firebase emulators:exec` sets these env variables itself.
      emulators: {
        auth: '127.0.0.1:9199',
        firestore: '127.0.0.1:8180',
        database: '127.0.0.1:9100',
      },
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --mode test --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
})
