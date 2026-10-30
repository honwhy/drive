import { expect, test } from '@playwright/test';

test.describe('主流程冒烟', () => {
  test('主菜单 → 关卡说明 → 驾驶 → 暂停恢复', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });

    await page.goto('/');
    await expect(page).toHaveTitle(/智驾模拟器/);
    await expect(page.getByRole('heading', { name: '观察 AI 如何开车' })).toBeVisible();

    await page.getByRole('button', { name: '开始游戏' }).click();
    await expect(page.getByRole('heading', { name: '关卡说明' })).toBeVisible();
    await expect(page.getByText('1 · 汽车会动')).toBeVisible();

    await page.getByRole('button', { name: '开始', exact: true }).click();
    await expect(page.locator('canvas.world')).toBeVisible();
    await expect(page.locator('.hud__title')).toHaveText('1 · 汽车会动');
    await expect(page.locator('.hud__mode')).toHaveText('手动');
    await expect(page.locator('.tutorial__text')).toContainText('加速');
    await expect(page.locator('.control')).toHaveCount(4);
    await expect(page.locator('.control--accelerate')).toContainText('加速');
    await expect(page.locator('.control--brake')).toContainText('刹车');

    await page.getByRole('button', { name: '暂停' }).click();
    await expect(page.getByText('已暂停')).toBeVisible();
    await expect(page.locator('.hud__mode')).toHaveText('手动');

    await page.locator('.pause').getByRole('button', { name: '继续' }).click();
    await expect(page.locator('.pause')).toBeHidden();

    await page.getByRole('button', { name: '恢复自动驾驶' }).click();
    await expect(page.locator('.hud__mode')).toHaveText('自动');

    await page.getByRole('button', { name: '接管', exact: true }).click();
    await expect(page.locator('.hud__mode')).toHaveText('手动');
    await page.getByRole('button', { name: '恢复自动驾驶' }).click();
    await expect(page.locator('.hud__mode')).toHaveText('自动');

    expect(errors).toEqual([]);
  });
});
