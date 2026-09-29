const { test, expect } = require('@playwright/test');

// The guitarist's toolbox (/toolbox): introduces the tools that sit beside the
// trainer and links to each. Like them, not linked from anywhere yet.

test.describe('guitarist toolbox', () => {
  test('introduces the Shape Explorer and opens it', async ({ page }) => {
    await page.goto('/toolbox');
    await expect(page.getByRole('heading', { name: 'Shape Explorer' })).toBeVisible();

    await page.getByRole('link', { name: 'Open the Shape Explorer' }).click();
    await expect(page).toHaveURL(/\/shape-explorer$/);
    await expect(page.locator('.fret-cell').first()).toBeAttached();   // a neck to explore
  });

  test('introduces the key quiz and opens it', async ({ page }) => {
    await page.goto('/toolbox');
    await expect(page.getByRole('heading', { name: 'Key quiz' })).toBeVisible();

    await page.getByRole('link', { name: 'Open the key quiz' }).click();
    await expect(page).toHaveURL(/\/key-quiz$/);
    await expect(page.locator('#kqKey')).toHaveText(/ major$/);   // a question waiting
  });

  test('the toolbox, both tools and the key signatures guide are in the sitemap, and open to search', async ({ page, request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const slug of ['toolbox', 'shape-explorer', 'key-quiz', 'key-signatures']) {
      expect(sitemap).toContain(`<loc>https://www.fretboardwalk.com/${slug}</loc>`);
      // A sitemap entry that says noindex is a contradiction search engines flag.
      await page.goto('/' + slug);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
      await expect(page.locator('link[rel="canonical"]'))
        .toHaveAttribute('href', `https://www.fretboardwalk.com/${slug}`);
    }
  });

  test('is reachable: from every page footer, the guide, and back from each tool', async ({ page }) => {
    const footed = ['/help', '/about', '/scale-degrees', '/minor-scale', '/pentatonic-scale',
      '/memorize-the-fretboard', '/major-minor-degree-map', '/chords-from-degrees', '/key-signatures'];
    for (const path of footed) {
      await page.goto(path);
      await expect(page.locator('footer a[href="/toolbox"]'), path).toHaveCount(1);
    }

    await page.goto('/help');
    await expect(page.locator('main a[href="/toolbox"]')).toHaveCount(1);

    for (const tool of ['/shape-explorer', '/key-quiz']) {
      await page.goto(tool);
      await page.getByRole('link', { name: 'Toolbox' }).click();
      await expect(page, tool).toHaveURL(/\/toolbox$/);
    }
  });

  test('points to the Father Charles guide behind the quiz', async ({ page }) => {
    await page.goto('/toolbox');
    await page.getByRole('link', { name: 'Father Charles, in full' }).click();
    await expect(page).toHaveURL(/\/key-signatures$/);
    await expect(page.locator('#ksResult')).toHaveText(/ major has /);
  });
});
