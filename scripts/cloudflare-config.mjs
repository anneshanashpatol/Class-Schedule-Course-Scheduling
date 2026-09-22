import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const productionConfigUrl = new URL('../wrangler.production.jsonc', import.meta.url);

function required(input, name) {
  const value = input[name]?.trim();
  if (!value) {
    throw new Error(`请在 Cloudflare Worker 的 Settings -> Builds -> Variables and secrets 填写 ${name}`);
  }
  return value;
}

function resourceName(input, name, fallback) {
  const value = input[name]?.trim() || fallback;
  if (!/^[a-z0-9][a-z0-9-_]{0,62}$/i.test(value)) {
    throw new Error(`${name} 只能包含字母、数字、连字符或下划线，且不能以符号开头`);
  }
  return value;
}

export function productionConfig(input) {
  const databaseId = required(input, 'BUILD_D1_DATABASE_ID');
  if (
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId) ||
    databaseId === '00000000-0000-0000-0000-000000000000'
  ) {
    throw new Error('BUILD_D1_DATABASE_ID 必须是 Cloudflare D1 页面显示的真实 Database ID');
  }

  const workerName = resourceName(input, 'BUILD_WORKER_NAME', 'course-scheduler');
  const databaseName = resourceName(input, 'BUILD_D1_DATABASE_NAME', 'course-scheduler-db');

  return {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: workerName,
    main: 'worker/index.ts',
    compatibility_date: '2026-09-22',
    keep_vars: true,
    assets: {
      not_found_handling: 'single-page-application',
      run_worker_first: ['/api/*'],
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: databaseName,
        database_id: databaseId,
        migrations_dir: 'migrations',
      },
    ],
    vars: {
      APP_ENV: 'production',
    },
    observability: { enabled: true },
  };
}

export async function generateProductionConfig(input = process.env) {
  const config = productionConfig(input);
  const path = fileURLToPath(productionConfigUrl);
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`已为 Worker ${config.name} 生成临时生产配置；该文件不会提交到 GitHub。`);
  return path;
}

export function assertProductionBranch(input = process.env) {
  const expectedBranch = input.BUILD_PRODUCTION_BRANCH?.trim() || 'main';
  if (input.WORKERS_CI === '1' && input.WORKERS_CI_BRANCH !== expectedBranch) {
    throw new Error(`当前分支不是生产分支 ${expectedBranch}，已停止数据库迁移和正式发布。`);
  }
}
