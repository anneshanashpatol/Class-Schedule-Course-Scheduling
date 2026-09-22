import { expect, test } from '@playwright/test';

test('手机显示日视图和抽屉导航', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('姓名').fill('e2e_张三');
  await page.getByLabel('密码').fill('e2e-pass-123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '前一天' })).toBeVisible();
  await expect(page.getByRole('button', { name: '后一天' })).toBeVisible();
  await page.getByRole('button', { name: '打开菜单' }).click();
  await expect(page.getByRole('link', { name: '排课管理' })).toBeVisible();
});
