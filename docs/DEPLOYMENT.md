# Cloudflare 网页部署全流程

本教程适用于把“前程π日程”源码上传到 GitHub 后，由不同使用者在各自的 Cloudflare 账号中部署。整个发布过程通过 GitHub Desktop、GitHub 网页和 Cloudflare 网页后台完成，不要求使用者在本机执行 Wrangler CLI。

Cloudflare 表单中的 Build command 和 Deploy command 会由 Cloudflare 的构建服务器执行。教程里出现命令并不代表需要在自己的电脑打开命令行。

## 这套复用方案如何工作

仓库中的 `wrangler.jsonc` 是本地开发和直接使用 Wrangler 时的通用模板，不保存任何人的生产 D1 Database ID；本教程的 Git 集成生产流程不直接使用其中的占位 ID。每位使用者在 Cloudflare 的 **Build variables and secrets** 中填写自己的资源信息，构建脚本会临时生成 `wrangler.production.jsonc`，完成数据库迁移和 Worker 发布。若自行运行 `db:migrate:remote` 或 `deploy` 等直接 Wrangler 命令，必须先提供有效的生产配置，不能使用仓库中的占位 ID。

`wrangler.production.jsonc` 已加入 `.gitignore`，不会上传到 GitHub。

| 配置类型 | 在哪里填写 | 本项目示例 |
| --- | --- | --- |
| 构建时变量 | Worker → Settings → Builds → Variables and secrets | `BUILD_D1_DATABASE_ID` |
| 运行时普通变量 | Worker → Settings → Variables & Secrets | 当前不需要手工填写；`APP_ENV=production` 由部署配置生成 |
| 运行时 Secret | Worker → Settings → Variables & Secrets，类型选 Secret | 当前项目没有第三方密钥，暂时不需要 |
| Cloudflare 资源绑定 | 由临时生产配置随部署创建 | `DB` → 使用者自己的 D1 |
| 业务设置 | 网站管理员后台 | 教师、学生、课程等业务数据 |

不建议让网站管理后台直接填写或修改 D1 ID、Worker 名称等基础设施配置：首次部署前网站还不能运行，而且这样做必须把 Cloudflare 管理令牌交给应用，权限和泄露风险都更高。资源 ID 和部署参数放在 Cloudflare Builds 中最合适；真正的业务选项才放网站后台。

## 固定结构与可自定义名称

本项目部署为 **一个 Cloudflare Worker + 静态资源 + 一个 D1 数据库**，不是 Pages：

- React 页面和 Hono API 由同一个 Worker 提供；
- `/api/*` 由 Worker 运行，其余路径由 React 单页应用处理；
- 前端和 API 同域，不需要配置 API 地址或 CORS；
- D1 binding 名固定为 `DB`，代码依赖这个名称，不能修改。

默认名称如下：

| 项目 | 默认值 |
| --- | --- |
| GitHub 仓库 | `zhenjiuduzhou/Class-Schedule-Course-Scheduling` |
| Worker | `course-scheduler` |
| D1 数据库 | `course-scheduler-db` |
| 生产分支 | `main` |

不同 Cloudflare 账号可以直接使用相同名称。如果同一个 Cloudflare 账号要部署第二套，需要给 Worker 和 D1 使用不同名称，并在构建变量中填写对应名称。

## 一、把项目上传到 GitHub

推荐使用 [GitHub Desktop](https://desktop.github.com/)，它会保留 Git 历史并遵守 `.gitignore`。

1. 打开 GitHub Desktop 并登录 GitHub。
2. 选择 **File → Add local repository**。
3. Local path 选择你克隆或保存源码的项目文件夹。
4. 如果左侧有待提交文件，确认 `package.json` 和 `package-lock.json` 一起提交，同时没有 `node_modules`、`dist`、`.wrangler`、`.env` 或 `wrangler.production.jsonc`。
5. 填写 Summary，点击 **Commit to main**。
6. 点击 **Publish repository**。本项目目标仓库名为 `Class-Schedule-Course-Scheduling`；复制本项目时也可以使用自己的仓库名。
7. 私人业务项目建议勾选 **Keep this code private**。
8. 点击 **View on GitHub**，确认仓库根目录直接包含 `package.json`、`package-lock.json`、`wrangler.jsonc`、`src`、`worker`、`migrations` 和 `scripts`。

不要只上传 ZIP，也不要在仓库外再多包一层目录。

## 二、在 Cloudflare 创建 D1

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 打开 **Storage & databases → D1 SQL database**；菜单位置变化时可在后台搜索 `D1`。
3. 点击 **Create database**。
4. Database name 填 `course-scheduler-db`，或填写你为这一套实例准备的独立名称。
5. 创建后进入数据库详情页，复制 **Database ID / UUID**。

此时数据库没有业务表是正常的，不要手工粘贴迁移 SQL。稍后的 Cloudflare Deploy command 会依次运行仓库 `migrations` 目录中尚未执行的迁移，并维护 `d1_migrations` 记录。官方说明见 [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)。

## 三、从 Cloudflare 连接 GitHub

1. 打开 **Workers & Pages**。
2. 点击 **Create application**。
3. 选择 **Import a repository → Get started**。
4. 选择 GitHub；首次使用时按提示安装或授权 `Cloudflare Workers and Pages` GitHub App。
5. 建议选择 **Only select repositories**，只授权要部署的仓库。
6. 返回 Cloudflare，选择刚上传的 `Class-Schedule-Course-Scheduling` 仓库。

这是 Workers Builds Git integration，不要创建成 Pages。官方说明见 [Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)。

## 四、填写构建设置

在导入页面填写以下内容。如果首次导入页面暂时没有变量区域，可以先完成连接；第一次构建因缺少变量失败是可恢复的，进入 Worker 的 **Settings → Builds** 补齐后重试即可。

| Cloudflare 字段 | 填写内容 |
| --- | --- |
| Worker / Project name | `course-scheduler`，或你的自定义 Worker 名 |
| Production branch | `main` |
| Root directory | 留空 |
| Build command | `npm run cf:build` |
| Deploy command | `npm run cf:deploy` |
| Builds for non-production branches | 关闭 |
| Non-production branch deploy command | `npm run cf:preview` |

这些命令由 Cloudflare 服务器运行，不是在本机运行。当前教程不创建共享生产数据库的分支预览，所以关闭非生产分支构建；如果界面在关闭后不再显示 Non-production branch deploy command，无需填写该项。

### 必填构建变量

在 **Build variables and secrets** 中添加：

| Name | Value | 类型 | 说明 |
| --- | --- | --- | --- |
| `NODE_VERSION` | `22` | 普通变量 | 固定 Node 主版本 |
| `BUILD_D1_DATABASE_ID` | 第二区复制的 UUID | 普通变量 | 每个使用者都不同，必填 |

D1 Database ID 是资源标识，不是密码，可以使用普通变量；不要误填 Account ID。

### 使用自定义名称时再填写

使用默认名称时不需要添加下面两项。只有改名时才添加：

| Name | Value | 必须与哪里一致 |
| --- | --- | --- |
| `BUILD_WORKER_NAME` | 自定义 Worker 名 | 导入页面的 Worker / Project name |
| `BUILD_D1_DATABASE_NAME` | 自定义 D1 名 | Cloudflare 中已经创建的 D1 名称 |

如果生产分支不是 `main`，还要添加 `BUILD_PRODUCTION_BRANCH`，值与 Cloudflare 选择的生产分支一致。

Cloudflare 明确区分构建变量和运行时变量：Build variables 只在构建期间可用，不会自动暴露给线上 Worker。详见 [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)。

## 五、确认构建令牌具有 D1 权限

部署脚本会自动应用 D1 migrations，因此 Cloudflare 用于 Git 构建的 API token 必须具有 D1 编辑权限。

1. 进入当前 Worker → **Settings → Builds**。
2. 查看 **API token** 区域使用的构建令牌。
3. 如果部署日志提示没有 D1 权限，在 Cloudflare 个人资料的 **API Tokens** 中编辑该令牌，保留原权限并添加：
   - **Account → D1 → Edit**；
   - 账号范围选择当前部署使用的 Cloudflare 账号。
4. 如果自动令牌不能编辑，创建具有 Worker 发布权限和 D1 Edit 权限的自定义令牌，再回到 Builds 页面选择或填写该令牌。

构建令牌不要写入 GitHub，也不要把令牌值填写成 `BUILD_D1_DATABASE_ID`。

## 六、保存并部署

1. 点击 **Save and Deploy**。
2. 查看构建日志，正常顺序应为：
   - 从 Cloudflare 构建变量生成临时生产配置；
   - TypeScript 和 Vite 构建成功；
   - D1 migrations 成功或显示没有待执行迁移；
   - Worker 上传并发布成功。
3. 如果刚连接仓库时已经出现一次失败记录，补齐变量和权限后，在该构建详情页点击 **Retry build**。
4. 如果页面没有重试按钮，在 GitHub 的 `main` 分支提交一次真实修改即可触发新构建。

不要把 Build command 改回单独的 `npm run build`，也不要把 Deploy command 改回默认的 `npx wrangler deploy`；否则不会生成每位使用者自己的生产配置，也不会自动执行数据库迁移。

## 七、核对 Worker、D1 和迁移

部署成功后检查：

1. Worker → **Settings → Bindings** 应显示：

   ```text
   Variable name: DB
   D1 database: course-scheduler-db（或你的自定义名称）
   ```

2. D1 → 对应数据库 → **Tables** 应能看到 `users`、`schedules`、`sessions` 等业务表。
3. D1 Console 执行以下只读查询：

   ```sql
   SELECT id, name, applied_at
   FROM d1_migrations
   ORDER BY id;
   ```

4. 结果应列出仓库中已经执行的迁移文件。

不要在 Bindings 页面再添加第二个同名 `DB`。生产 binding 的来源是每次部署时生成的配置；需要换数据库时，修改 Builds 中的 `BUILD_D1_DATABASE_ID` 和名称变量后重新部署。

## 八、通过网页创建第一个管理员

当前注册页只提供教师和学生身份。先让应用生成安全的密码哈希，再从 D1 网页控制台提升角色，避免在 SQL 中填写明文密码。

1. 打开 Cloudflare 提供的 `workers.dev` 地址。
2. 注册一个教师账号，用户名可使用 `admin`，密码应强且唯一。
3. 回到 D1 → 当前数据库 → **Console**。
4. 执行：

   ```sql
   UPDATE users
   SET role = 'ADMIN', updated_at = datetime('now')
   WHERE username = 'admin' COLLATE NOCASE AND deleted_at IS NULL;

   DELETE FROM teacher_profiles
   WHERE user_id = (
     SELECT id FROM users WHERE username = 'admin' COLLATE NOCASE
   );

   DELETE FROM sessions
   WHERE user_id = (
     SELECT id FROM users WHERE username = 'admin' COLLATE NOCASE
   );

   SELECT id, username, role, status
   FROM users
   WHERE username = 'admin' COLLATE NOCASE;
   ```

5. 如果实际用户名不是 `admin`，替换 SQL 中全部 `'admin'`。
6. 查询结果应为 `role: ADMIN`、`status: ACTIVE`。
7. 返回网站重新登录。原会话被删除是正常现象。

## 九、线上验收

访问地址通常类似：

```text
https://course-scheduler.<你的子域>.workers.dev
```

按顺序检查：

1. 打开 `/api/health`，应看到 `"status":"ok"`；
2. 管理员重新登录；
3. 创建测试教师和学生；
4. 创建一条排课，测试完课和取消完课；
5. 直接刷新 `/calendar` 和 `/schedules`，确认没有 404；
6. 删除测试数据。

构建成功只说明发布流程完成；健康检查、登录和核心排课流程都通过后，首次部署才算验收完成。

## 十、以后更新代码

不需要打开命令行：

1. GitHub Desktop 中先点击 **Fetch origin / Pull origin**；
2. 检查修改，填写 Summary；
3. 点击 **Commit to main**；
4. 点击 **Push origin**；
5. Cloudflare 自动构建、执行尚未应用的迁移并发布；
6. 在 Worker 的 **Deployments / Build history** 查看结果。

依赖有变化时，`package.json` 和 `package-lock.json` 必须在同一次提交中更新；不要删除锁文件，也不要用 `--force` 或 `--legacy-peer-deps` 绕过冲突。不要修改已经在生产执行过的迁移文件。数据库结构变化应新增编号更大的 SQL 文件；重要变更前先备份。回退 Worker 代码不会自动回退 D1 数据。

## 十一、自定义域名（可选）

确认 `workers.dev` 地址可用后：

1. 打开当前 Worker；
2. 进入 **Settings → Domains & Routes**；
3. 点击 **Add → Custom Domain**；
4. 选择同一 Cloudflare 账号中的域名或子域名；
5. 等证书与 DNS 状态变为 Active；
6. 用新域名重新检查健康接口和登录。

## 十二、给不同的人复用

每位使用者只需在自己的账号中重复下面四件事：

1. Fork、复制或重新上传同一份 GitHub 仓库；
2. 在自己的 Cloudflare 账号创建 D1；
3. 连接自己的 GitHub 仓库，并在 Builds 中填写自己的 `BUILD_D1_DATABASE_ID`；
4. 部署后创建自己的管理员。

仓库源码、迁移和构建脚本保持不变。不同使用者的数据、账号和 Cloudflare 资源彼此独立，不需要把任何人的 `wrangler.production.jsonc` 提交回仓库。

## 十三、常见问题

| 现象 | 处理方法 |
| --- | --- |
| 安装阶段出现 `npm ERESOLVE` | 确认已拉取最新 `main`，并且 `package.json` 与 `package-lock.json` 来自同一次提交；不要使用 `--force` 或 `--legacy-peer-deps`，修复依赖和锁文件后重新构建 |
| 提示缺少 `BUILD_D1_DATABASE_ID` | Worker → Settings → Builds → Variables and secrets 添加真实 D1 UUID，再重试 |
| D1 migration 报无权限 | 给 Builds 使用的 API token 添加 Account → D1 → Edit |
| Worker 名称不一致 | 导入页面名称与 `BUILD_WORKER_NAME` 保持一致；默认都用 `course-scheduler` |
| 找不到数据库 | 核对 Database ID 是否属于当前 Cloudflare 账号，名称变量是否与 D1 页面一致 |
| 页面能打开但登录报错 | 检查 `DB` binding 和 `d1_migrations`，不要重复手工建表 |
| 刷新前端路由后 404 | 确认部署的是 Worker 而不是 Pages，并检查本次部署使用了 `npm run cf:build` |
| GitHub 更新没有触发 | 核对连接的完整仓库地址、生产分支和 GitHub App 授权范围 |
| 修改后台变量后又被覆盖 | 构建参数应改 Builds 变量；运行时普通变量会因 `keep_vars: true` 保留，生产固定项仍以生成配置为准 |

## 十四、公开访问前的安全检查

- 为 `/api/auth/login` 和 `/api/auth/register` 配置 Cloudflare Rate Limiting；
- 只供固定机构使用时，可用 Cloudflare Access 限制访问人员；
- GitHub App 只授权必要仓库；
- 不向 GitHub 上传密码、API token、`.env`、`.wrangler`、生产数据或 `wrangler.production.jsonc`；
- D1 做重要变更前先备份。

Cloudflare 后台菜单可能小幅调整；文字不同时，以 **Workers、Builds、Variables and secrets、Bindings、D1、Import a repository** 这些入口定位。

## 十五、课程表月视图更新（2026-09-26）

本次更新只修改前端页面、样式和导航外链；D1 表结构、`DB` 绑定、Worker 名称、会话规则及构建命令均保持原样。先在本地隔离预览检查七列周视图、月视图和18节密集排课，再按第十节从原仓库更新 `main`。Cloudflare Builds 继续使用 `npm run cf:build` 和 `npm run cf:deploy`；这次不新增迁移，迁移命令应提示没有待执行迁移。发布后以原账号登录，核对历史课程、月周切换、手机单日视图和“排课 AI 助手”新标签页入口。出现问题时在 Worker 的 Deployments 回退到前一版本，保留原 D1；回退后再次检查登录和历史课程。

月视图最多读取42天的课程，按500条分页。以每天18节为上限估算，单次打开最多读取756条、发起两次课程 API 请求；实际扫描量还受索引、学生关联和其他筛选影响，应在 Cloudflare D1 的 Metrics → Row Metrics 查看真实用量。截至2026-09-26，[Workers Free](https://developers.cloudflare.com/workers/platform/pricing/) 为每天10万次请求、单次10毫秒 CPU；[D1 Free](https://developers.cloudflare.com/d1/platform/pricing/) 为每天500万行读取、10万行写入、总存储5 GB，额度与同一账号其他项目共享。静态资源请求有单独规则，见 [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)。这属于小型机构的容量估算，不保证任意规模下始终免费。

项目没有 Service Worker 或自建 API 缓存，前端资源由构建生成带哈希的文件名；正常发布后刷新页面即可取得新版本。若目标域名额外设置了缓存规则，应核查它是否缓存了 HTML，再按实际规则处理。
