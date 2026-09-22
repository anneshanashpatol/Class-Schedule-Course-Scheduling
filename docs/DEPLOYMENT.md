# Cloudflare 部署说明

## 资源

本项目只需要一个 Workers 项目和一个 D1 数据库。React 静态文件与 Hono API 由同一个 Worker 部署；不需要 Pages、R2、KV 或 Durable Objects。

## 首次部署

1. 安装依赖并登录 Cloudflare：

   ```powershell
   npm install
   npx wrangler login
   ```

2. 创建生产 D1：

   ```powershell
   npx wrangler d1 create course-scheduler-db
   ```

   将输出的真实 `database_id` 填入 `wrangler.jsonc`，不要修改 binding 名 `DB`。

3. 先应用迁移，再初始化管理员：

   ```powershell
   npm run db:migrate:remote
   $env:ADMIN_NAME='机构管理员姓名'
   $env:ADMIN_PASSWORD='一个强且唯一的密码'
   npm run admin:create -- --remote
   ```

   密码仅通过当前进程环境变量传入，不会写入仓库或临时 SQL；临时文件会在命令结束时删除。

4. 发布并检查：

   ```powershell
   npm run deploy
   ```

   部署成功后访问 `/api/health`，再通过真实域名完成管理员登录、创建测试教师／学生、创建排课、完课与取消完课。验证完删除测试排课并停用测试账号。

## 后续更新

```powershell
npm install
npm run typecheck
npm test
npm run build
npm run db:migrate:remote
npm run deploy
```

先备份重要数据再执行生产迁移。代码回退不会自动回退数据库；对应的手工回退参考 `docs/rollback/`，执行前必须审查数据影响。

## 配置与故障定位

- `wrangler.jsonc`：项目名、D1 binding、生产变量和静态资源路由。
- `.env*`：已被 Git 忽略，不要把密码或 Cloudflare 授权提交到仓库。
- API 日志：Cloudflare Dashboard 的 Workers Logs，或 `npx wrangler tail`。
- D1 状态：Cloudflare Dashboard 的 D1 控制台及 `npx wrangler d1 migrations list course-scheduler-db --remote`。
- 页面可打开但 API 报错时，先检查 D1 binding 和迁移；整个域名打不开时，再检查 Worker 部署和自定义域名状态。

