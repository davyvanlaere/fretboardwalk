const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.PORT || 8413;

module.exports = defineConfig({
  testDir: './specs',
  // Time Attack runs on a real 9-second clock, and several specs play a dozen
  // real turns — each one a 380ms move plus a smooth scroll — so these are
  // genuinely slow rather than merely patient.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Left to itself Playwright takes half the cores, which on a 16-thread box
  // means eight browsers competing for the same animation frames. The tap-heavy
  // specs then time out on contention alone — they pass comfortably in
  // isolation. Fewer workers is both faster overall and stable.
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // Two viewports because the layout genuinely differs: below 1100px the neck
  // is vertical, and at 1000px+ the settings drawer is reparented into a
  // permanent side rail. Bugs hide in exactly that difference.
  // Plain desktop Chrome at two widths rather than device emulation: every
  // breakpoint in the app keys off width alone, and touch emulation would drag
  // in the pointer:coarse rotate-lock, which isn't what these specs are about.
  projects: [
    { name: 'phone',   use: { ...devices['Desktop Chrome'], viewport: { width: 412,  height: 880 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],

  webServer: {
    command: 'node serve.js',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
});
