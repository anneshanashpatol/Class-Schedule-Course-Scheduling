# 前程π日程

面向小型培训机构的中文排课系统。管理员管理用户、排课和预计剩余课时；教师维护自己的课程；学生查看和导出自己的课程。

## 本地运行

需要 Node.js 22。首次运行：

```powershell
npm clean-install
npm run db:migrate:local
$env:ADMIN_NAME='admin'
$env:ADMIN_PASSWORD='请改成至少8位的本地密码'
npm run admin:create
npm run dev
```

`npm clean-install` 会严格按照仓库中的 `package-lock.json` 安装已验证的依赖组合。只有主动升级依赖时才运行 `npm install`，并应将更新后的 `package.json` 与 `package-lock.json` 一起提交。

打开终端输出的本地地址。公开注册只提供教师和学生身份；管理员通过 `admin:create` 初始化。重复执行管理员创建命令时，如果姓名已经存在，数据库会拒绝重复账号。

常用检查：

```powershell
npm run typecheck
npm test
npm run lint
npm run build
npm run test:e2e
```

本地 D1 数据保存在 `.wrangler/`，不会提交到 Git。若迁移有变化，再执行 `npm run db:migrate:local`。

### 课程表改版的隔离预览

在项目根目录运行 `node scripts/prepare-calendar-preview.mjs`，再进入 `.calendar-preview` 执行 `npm run dev -- --host 127.0.0.1 --port 4174`，打开 `http://127.0.0.1:4174/login`。演示管理员为 `e2e_admin`，密码为 `e2e-pass-123`。演示库包含普通多人课程、次日18节课程（上午16节、下午2节），以及下一周两节常规课程；可点“下一周”对比正常密度。预览目录有独立的本地 D1，重复准备会重置其中的演示账号和排课；它不连接生产 D1，也不改项目根目录现有的 `.wrangler` 数据。

## 业务约定

- 姓名就是唯一登录账号；重名用户需要自行添加后缀。
- 60 分钟固定为 1 课时。
- 停用账号可以重新启用；管理员也可删除账号。删除后账号从用户管理移除且不能登录或参与新排课，历史课程姓名继续保留。
- 一条课程可以选择多名学生；完课时每名学生分别扣减本节课时。
- 完课会扣除预计剩余课时，取消完课会返还；删除排课不返还。
- 已完课课程需先取消完课，才能修改学生、日期或时间。
- 教师只能单条删除自己的课程，批量删除仅管理员可用。

使用 GitHub Desktop 上传代码，并通过 Cloudflare 后台连接 GitHub 部署的完整步骤见 [部署教程](docs/DEPLOYMENT.md)。
