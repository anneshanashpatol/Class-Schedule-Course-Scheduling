import { expect, test, type Locator, type Page } from '@playwright/test';

const password = 'e2e-pass-123';
const resetPassword = 'e2e-reset-456';

async function login(page: Page, username: string, credential = password) {
  await page.goto('/login');
  await page.getByLabel('姓名').fill(username);
  await page.getByLabel('密码').fill(credential);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
}

async function logout(page: Page) {
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

function userCard(page: Page, name: string): Locator {
  return page.locator('article.user-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
}

test.describe.serial('新需求核心流程', () => {
  test('注册需要确认密码且两次输入必须一致', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: '立即注册' }).click();
    await expect(page.getByLabel('确认密码')).toBeVisible();

    await page.getByLabel('姓名').fill('e2e_注册用户');
    await page.getByLabel('密码').first().fill(password);
    await page.getByLabel('确认密码').fill('e2e-wrong-123');
    await page.getByRole('button', { name: '注册并进入' }).click();
    await expect(page.getByText('两次输入的密码不一致')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('确认密码').fill(password);
    await page.getByRole('button', { name: '注册并进入' }).click();
    await expect(page).toHaveURL(/\/calendar$/);
  });

  test('管理员可从课程表空白日期创建多学生课程，并在详情弹窗完课和删除', async ({ page }) => {
    await login(page, 'e2e_admin');

    const now = new Date();
    await expect(page.locator('.calendar-heading strong')).toHaveText(`${now.getFullYear()}年${now.getMonth() + 1}月`);
    await expect(page.getByRole('heading', { name: '上午', exact: true })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: '下午', exact: true })).toHaveCount(1);

    await page.getByRole('button', { name: `在${now.getMonth() + 1}月${now.getDate()}日上午新增排课`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新增排课' });
    await dialog.getByLabel('教师姓名').fill('e2e_王老师');
    for (const [index, student] of ['e2e_张三', 'e2e_李四', 'e2e_王五', 'e2e_赵六'].entries()) {
      if (index > 0) await dialog.getByRole('button', { name: '添加学生' }).click();
      await dialog.getByLabel(`学生姓名 ${index + 1}`).fill(student);
    }
    await dialog.getByLabel('科目').fill('端到端多人数学');
    await dialog.getByLabel('开始时间').fill('09:15');
    await dialog.getByLabel('结束时间').fill('10:45');
    await expect(dialog.getByLabel('自动课时')).toHaveValue('1.5 课时');
    await dialog.getByLabel('教室').fill('E2E-A101');
    await dialog.getByRole('button', { name: '保存' }).click();

    const course = page.getByRole('button', { name: /端到端多人数学/ });
    await expect(course).toContainText('e2e_张三、e2e_李四、e2e_王五…（共4人）');
    await course.click();
    const editDialog = page.getByRole('dialog', { name: '编辑排课' });
    await expect(editDialog.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await editDialog.getByRole('switch').click();

    await expect(course).toContainText('已完课');
    await course.click();
    page.once('dialog', (confirmation) => confirmation.accept());
    await page.getByRole('dialog', { name: '编辑排课' }).getByRole('button', { name: '删除课程' }).click();
    await expect(course).toHaveCount(0);
  });

  test('学生可从课程卡片打开只读详情', async ({ page }) => {
    await login(page, 'e2e_张三');
    await expect(page.getByRole('button', { name: /新增排课/ })).toHaveCount(0);

    await page.getByRole('button', { name: /E2E历史课程/ }).click();
    const dialog = page.getByRole('dialog', { name: '课程详情' });
    await expect(dialog.getByLabel('科目')).toHaveValue('E2E历史课程');
    await expect(dialog.getByText('e2e_张三、e2e_待删除', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('科目')).toBeDisabled();
    await expect(dialog.getByRole('switch')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '删除课程' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '保存' })).toHaveCount(0);
  });

  test('排课和用户筛选区可收起并恢复', async ({ page }) => {
    await login(page, 'e2e_admin');
    await page.getByRole('link', { name: '排课管理' }).click();
    const scheduleToggle = page.locator('.filter-title button');
    await expect(scheduleToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('开始日期')).toBeHidden();
    await scheduleToggle.click();
    await expect(scheduleToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('开始日期')).toBeVisible();
    await scheduleToggle.click();
    await expect(page.getByLabel('开始日期')).toBeHidden();
    await scheduleToggle.click();
    await expect(page.getByLabel('开始日期')).toBeVisible();

    await page.getByRole('link', { name: '用户管理' }).click();
    const userToggle = page.getByRole('button', { name: '筛选用户' });
    await expect(userToggle).toHaveAttribute('aria-expanded', 'true');
    await userToggle.click();
    await expect(userToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('搜索姓名')).toHaveCount(0);
    await userToggle.click();
    await expect(page.getByLabel('搜索姓名')).toBeVisible();
  });

  test('管理员可重置密码和删除用户，删除后保留历史课程且账号不能再登录', async ({ page }) => {
    await login(page, 'e2e_admin');
    await page.getByRole('link', { name: '用户管理' }).click();
    const target = userCard(page, 'e2e_待删除');

    await target.getByRole('button', { name: '重置密码' }).click();
    const resetDialog = page.getByRole('dialog', { name: '重置密码 · e2e_待删除' });
    await resetDialog.getByRole('textbox', { name: /^新密码/ }).fill(resetPassword);
    await resetDialog.getByLabel('确认新密码').fill('e2e-wrong-456');
    await resetDialog.getByRole('button', { name: '确认重置' }).click();
    await expect(resetDialog.getByText('两次输入的新密码不一致')).toBeVisible();
    await resetDialog.getByLabel('确认新密码').fill(resetPassword);
    await resetDialog.getByRole('button', { name: '确认重置' }).click();
    await expect(resetDialog.getByRole('textbox', { name: /^新密码/ })).toHaveValue('');
    await expect(resetDialog.getByLabel('确认新密码')).toHaveValue('');
    await resetDialog.getByRole('button', { name: '取消' }).click();

    await logout(page);
    await login(page, 'e2e_待删除', resetPassword);
    await logout(page);
    await login(page, 'e2e_admin');
    await page.getByRole('link', { name: '用户管理' }).click();

    page.once('dialog', (confirmation) => confirmation.accept());
    await target.getByRole('button', { name: '删除' }).click();
    await expect(target).toHaveCount(0);

    await page.getByRole('link', { name: '排课管理' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'E2E历史课程' })).toContainText('e2e_待删除');
    await page.getByRole('button', { name: '新增排课' }).click();
    const createDialog = page.getByRole('dialog', { name: '新增排课' });
    await createDialog.getByLabel('学生姓名 1').fill('e2e_待删除');
    await expect(createDialog.getByLabel('学生姓名 1')).toHaveValue('e2e_待删除');
    await createDialog.getByRole('button', { name: '取消' }).click();

    await logout(page);
    await page.getByLabel('姓名').fill('e2e_待删除');
    await page.getByLabel('密码').fill(resetPassword);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByText(/(账号已停用|姓名或密码错误)/)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
