// Playwright config for the Keyline story (`pnpm e2e`) and the screen capture (`pnpm screenshots`).
//
// Two projects:
//   story        the whole "create → sign → lose → recover" story against a live stack + Base Sepolia.
//                Serial, one worker, 15 min per test, video recorded for the demo backup.
//   screenshots  every reachable screen/state at 2× into docs/screens/, mocked bank + RPC (no chain).
//
// Ports: the default stack is wallet :3000 / bank :4000. While other agents share this machine the QA agent runs
// an isolated stack (wallet :3100, bank :4100, sq-guardian :4101) and points the tests at it with
// E2E_WALLET_URL / E2E_BANK_URL (see docs/DEMO.md "Isolated ports").
import { defineConfig, devices } from '@playwright/test';

const WALLET_URL = process.env.E2E_WALLET_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: '.',
  testMatch: ['*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: WALLET_URL,
    trace: 'retain-on-failure',
    // The app renders a 390×844 phone frame inside the page; a desktop viewport shows the frame + DeviceBar.
    viewport: { width: 1280, height: 960 },
    locale: 'en-CH',
    timezoneId: 'Europe/Zurich',
  },
  projects: [
    {
      name: 'story',
      testMatch: ['story.spec.ts', 'attacker.spec.ts', 'fraud-cancel.spec.ts'],
      timeout: 15 * 60 * 1000,
      expect: { timeout: 20_000 },
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 960 },
        video: { mode: 'on', size: { width: 1280, height: 960 } },
      },
    },
    {
      name: 'screenshots',
      testMatch: ['screenshots.spec.ts'],
      timeout: 60 * 1000,
      // The dev server recompiles while other agents edit the wallet; one retry absorbs a transient 404/_error.
      retries: 1,
      expect: { timeout: 10_000 },
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 960 },
        deviceScaleFactor: 2,
        video: 'off',
      },
    },
  ],
});
