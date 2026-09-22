import { expect, test, type Page } from '@playwright/test';

const password = 'e2e-pass-123';

async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('姓名').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
}

test.describe.serial('三角色核心流程', () => {
  test('管理员可查看用户并创建排课', async ({ page }) => {
    await login(page, 'e2e_admin');
    await page.getByRole('link', { name: '用户管理' }).click();
    await expect(page.getByText('e2e_王老师', { exact: true })).toBeVisible();
    await expect(page.getByText('e2e_张三', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: '排课管理' }).click();
    await page.getByRole('button', { name: '新增排课' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('教师').selectOption({ label: 'e2e_王老师 · 数学、物理' });
    await dialog.getByLabel('学生').selectOption({ label: 'e2e_张三' });
    await dialog.getByLabel('科目').fill('端到端数学');
    await dialog.getByLabel('教室').fill('E2E-A101');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('端到端数学', { exact: true }).first()).toBeVisible();
  });

  test('教师只能管理自己的课程并可标记完课', async ({ page }) => {
    await login(page, 'e2e_王老师');
    await page.getByRole('link', { name: '排课管理' }).click();
    const row = page.getByRole('row').filter({ hasText: '端到端数学' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '标记完课' }).click();
    await expect(row.getByText('已完课', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '删除选中' })).toHaveCount(0);
  });

  test('学生只读查看课程与扣减后的预计课时', async ({ page }) => {
    await login(page, 'e2e_张三');
    await page.getByRole('link', { name: '排课管理' }).click();
    await expect(page.getByText('端到端数学', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '新增排课' })).toHaveCount(0);
    await page.getByRole('button', { name: '查看我的资料' }).click();
    await expect(page.getByRole('dialog').getByText('9 课时', { exact: true })).toBeVisible();
  });
});
