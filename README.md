# 青禾排课

面向小型培训机构的中文排课系统。管理员管理用户、排课和预计剩余课时；教师维护自己的课程；学生查看和导出自己的课程。

## 本地运行

需要 Node.js 22。首次运行：

```powershell
npm install
npm run db:migrate:local
$env:ADMIN_NAME='admin'
$env:ADMIN_PASSWORD='请改成至少8位的本地密码'
npm run admin:create
npm run dev
```

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

## 业务约定

- 姓名就是唯一登录账号；重名用户需要自行添加后缀。
- 60 分钟固定为 1 课时。
- 停用账号可以重新启用；管理员也可删除账号。删除后账号从用户管理移除且不能登录或参与新排课，历史课程姓名继续保留。
- 一条课程可以选择多名学生；完课时每名学生分别扣减本节课时。
- 完课会扣除预计剩余课时，取消完课会返还；删除排课不返还。
- 已完课课程需先取消完课，才能修改学生、日期或时间。
- 教师只能单条删除自己的课程，批量删除仅管理员可用。

部署到 Cloudflare 的步骤见 [部署说明](docs/DEPLOYMENT.md)。
