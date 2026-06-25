import { expect, test } from '@playwright/test';

test('shows seeded Demo Board on board list', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Whiteboard Boards' })).toBeVisible();
  await expect(page.getByText('Demo Board')).toBeVisible();
});

test('syncs a shape between two tabs', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto('/');
  await pageA.getByText('Demo Board').click();
  await pageB.goto(pageA.url());
  await pageA.getByTestId('connection-status').filter({ hasText: 'connected' }).waitFor({ timeout: 15000 });
  const initialCount = await pageB.getByTestId('shape-count').textContent();

  await pageA.getByRole('button', { name: 'Rectangle' }).click();
  const canvas = pageA.getByTestId('whiteboard-canvas');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('canvas missing layout box');
  }

  const start = { x: box.x + 140, y: box.y + 140 };
  const end = { x: box.x + 260, y: box.y + 220 };
  await pageA.mouse.move(start.x, start.y);
  await pageA.mouse.down();
  await pageA.mouse.move(end.x, end.y, { steps: 4 });

  const previewPixel = await pageA.evaluate(({ x, y }) => {
    const canvasEl = document.querySelector('[data-testid="whiteboard-canvas"]') as HTMLCanvasElement | null;
    if (!canvasEl) {
      return null;
    }
    const ctx = canvasEl.getContext('2d');
    if (!ctx) {
      return null;
    }
    const sample = ctx.getImageData(x, y, 1, 1).data;
    return { r: sample[0], g: sample[1], b: sample[2], a: sample[3] };
  }, { x: 200, y: 180 });
  expect(previewPixel?.a).toBeGreaterThan(0);

  await pageA.mouse.up();
  await expect(pageA.getByTestId('shape-count')).not.toHaveText(initialCount ?? '', { timeout: 2000 });
  await expect(pageB.getByTestId('shape-count')).not.toHaveText(initialCount ?? '', { timeout: 2000 });

  await contextA.close();
  await contextB.close();
});

test('syncs a placed Path template between two tabs', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto('/');
  await pageA.getByText('Demo Board').click();
  await pageB.goto(pageA.url());
  const initialCount = await pageB.getByTestId('shape-count').textContent();

  await pageA.getByRole('button', { name: 'Complex shapes' }).click();
  await pageA.getByRole('button', { name: 'Cross (small)' }).click();

  await expect(pageB.getByTestId('shape-count')).not.toHaveText(initialCount ?? '', { timeout: 500 });

  await contextA.close();
  await contextB.close();
});

test('syncs Mesh3D orbit rotation between two tabs', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto('/');
  await pageA.getByText('Demo Board').click();
  await pageB.goto(pageA.url());

  await pageA.getByRole('button', { name: 'Complex shapes' }).click();
  await pageA.getByRole('button', { name: '3D meshes' }).click();
  await pageA.getByRole('button', { name: 'Cube', exact: true }).click();
  await expect(pageA.getByTestId('mesh3d-sync-state')).toBeVisible({ timeout: 2000 });
  await expect(pageB.getByTestId('mesh3d-sync-state')).toBeVisible({ timeout: 2000 });

  const canvas = pageA.getByTestId('whiteboard-canvas');
  const center = { x: 220, y: 220 };
  await canvas.dragTo(canvas, {
    sourcePosition: center,
    targetPosition: { x: center.x + 120, y: center.y + 90 }
  });

  await expect(pageA.getByTestId('mesh3d-rotation')).not.toContainText('0.00, 0.00', { timeout: 2000 });
  await expect(pageB.getByTestId('mesh3d-sync-state')).not.toHaveText('0.000,0.000', { timeout: 2000 });

  await contextA.close();
  await contextB.close();
});
