import { expect, test } from '@playwright/test';

test('手机登录后默认进入排课管理并显示抽屉导航', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('姓名').fill('e2e_张三');
  await page.getByLabel('密码').fill('e2e-pass-123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/schedules$/);
  await expect(page.getByRole('heading', { name: '排课管理' })).toBeVisible();
  await page.getByRole('button', { name: '打开菜单' }).click();
  await expect(page.getByRole('link', { name: '排课管理' })).toBeVisible();
});
