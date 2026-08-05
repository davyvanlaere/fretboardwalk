const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.PORT || 8413;

module.exports = defineConfig({
  testDir: './specs',
  // Time Attack runs on a real 9-second clock, so a couple of specs genuinely
  // need to sit and wait for it.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
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
