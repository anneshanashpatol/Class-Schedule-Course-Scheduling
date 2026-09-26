import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username = 'e2e_admin') {
  await page.goto('/login');
  await page.getByLabel('姓名').fill(username);
  await page.getByLabel('密码').fill('e2e-pass-123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
}

test('紧凑周视图展示18节课程，月视图可进入对应周', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page);
  await expect(page.locator('.compact-course')).toHaveCount(19);
  await expect(page.locator('.week-grid__dates > header')).toHaveCount(7);
  await expect(page.locator('.week-grid__dates > header').last()).toContainText('18 节课');
  await expect(page.locator('.week-period-row').first().locator('.calendar-period').last().locator('.compact-course')).toHaveCount(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1366);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(200);
  await page.screenshot({ path: 'test-results/calendar-week-busy.png', fullPage: true });
  await page.getByRole('button', { name: '月', exact: true }).click();
  await expect(page.locator('.month-day')).toHaveCount(35);
  const busyDay = page.locator('.month-day').filter({ hasText: '18节课' });
  await expect(busyDay).toHaveCount(1);
  await expect(busyDay).toContainText('另有');
  expect(await busyDay.locator('.month-day__names > span:not(.month-day__more)').count()).toBeGreaterThan(2);
  await page.screenshot({ path: 'test-results/calendar-month-busy.png', fullPage: true });
  await busyDay.click();
  await expect(page.getByRole('button', { name: '周', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.compact-course')).toHaveCount(19);
  await page.getByRole('button', { name: '下一周' }).click();
  await expect(page.locator('.compact-course')).toHaveCount(2);
  await expect(page.locator('.week-grid')).not.toHaveClass(/week-grid--busy/);
  expect((await page.locator('.compact-course').first().boundingBox())!.height).toBeGreaterThanOrEqual(46);
  await page.screenshot({ path: 'test-results/calendar-week-normal.png', fullPage: true });
  await page.getByRole('button', { name: '下一周' }).click();
  await expect(page.locator('.week-grid')).toBeVisible();
  await expect(page.locator('.compact-course')).toHaveCount(0);
  const emptyWeek = await page.locator('.week-grid').boundingBox();
  expect(emptyWeek!.y + emptyWeek!.height).toBeGreaterThan(768);
  expect(emptyWeek!.height).toBeLessThanOrEqual(768);
  const scrollRoom = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(scrollRoom).toBeGreaterThan(40);
  expect(scrollRoom).toBeLessThan(200);
  await page.screenshot({ path: 'test-results/calendar-week-empty.png', fullPage: true });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const scrolledWeek = await page.locator('.week-grid').boundingBox();
  expect(scrolledWeek!.y).toBeGreaterThanOrEqual(0);
  expect(scrolledWeek!.y + scrolledWeek!.height).toBeLessThanOrEqual(768);
  await page.screenshot({ path: 'test-results/calendar-week-empty-scrolled.png' });
  await expect(page.getByRole('link', { name: '排课 AI 助手' })).toHaveAttribute('href', 'https://qcp.dpdns.org/assistant');
  await expect(page.getByRole('link', { name: '排课 AI 助手' })).toHaveAttribute('target', '_blank');
});

test('月视图在三个桌面尺寸内显示整月且不横向溢出', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '月', exact: true }).click();
  await page.getByLabel('选择日期').fill('2026-08-15');
  await expect(page.locator('.month-day')).toHaveCount(42);
  for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    const box = await page.locator('.month-calendar').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: 'test-results/calendar-month-desktop.png', fullPage: true });
});

test('手机保留单日课程与抽屉导航', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('姓名').fill('e2e_张三');
  await page.getByLabel('密码').fill('e2e-pass-123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/schedules$/);
  await page.getByRole('button', { name: '打开菜单' }).click();
  await page.getByRole('link', { name: '课程表' }).click();
  await expect(page.locator('.day-list')).toBeVisible();
  await expect(page.locator('.calendar-view-switch')).toBeHidden();
  await page.getByRole('button', { name: '打开菜单' }).click();
  await expect(page.getByRole('link', { name: '排课 AI 助手' })).toBeVisible();
  await page.getByRole('button', { name: '关闭菜单' }).last().click();
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(page.locator('.day-list')).toBeVisible();
});
