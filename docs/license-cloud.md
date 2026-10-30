# 芜湖AI 云端授权

部署与验收日期：2026-10-30。v0.3.24 起正式客户端启用云端授权与最低版本检查；本地正式安装目录不会被源码上传自动覆盖。

## 已部署资源

- 授权服务：<https://wuhu-ai-license.wuhu-ai-d506eab0.workers.dev>
- 所有者管理后台：<https://wuhu-ai-license.wuhu-ai-d506eab0.workers.dev/admin>
- Cloudflare Worker：`wuhu-ai-license`。
- D1 数据库：`wuhu-ai-license`，ID `f5e995a9-f5be-4fe0-8ca9-2e0f5908e2d0`。
- 资源属于所有者登录的 Cloudflare 账号；客户端只包含服务地址与签名公钥。

## 所有者日常操作

桌面的“芜湖AI 授权后台”或“芜湖AI-授权管理后台”可打开云端管理页面。“芜湖AI 云端授权资料”文件夹内的快捷方式可打开管理员登录码和本机七天测试激活码；“芜湖AI-云端授权测试版”是独立测试程序。

1. 打开管理后台，使用管理员登录码登录。它与发给用户的激活码用途不同，不要分发管理员登录码。
2. 新建授权时填写备注和有效天数。有效期从发码时开始计算；完整激活码只在创建成功时显示一次，请自行保存并发送给相应用户。数据库保留码的摘要及尾号，无法还原完整码。
3. 用户第一次输入激活码时必须联网；一份码仅允许绑定一台电脑。
4. “停用”禁止继续验证；“恢复”重新允许验证，但不会自动延长已到期授权。
5. “解绑”释放旧设备绑定；用户可用原激活码在新电脑激活。旧电脑在线检查后退出授权状态。
6. “续期”在当前到期日与当前时间两者较晚者的基础上增加天数。后台可查看绑定、最近验证及最近管理操作。

客户端每 5 分钟联网验证，已签发凭证最长有效 1 小时，且不会超过授权到期时间。断网不会获得新的宽限；首次激活和过期后恢复必须联网。在线停用通常在下次检查生效，离线设备最长可能继续使用到已有凭证到期，不能保证即时远程停用。

## 强制更新策略

后台新增“强制更新策略”，默认关闭最低版本限制，最低版本预填 `0.3.24`。关闭此开关不影响一机一码授权。

1. 先发布新版本，确认 GitHub Release 中安装包已经可以下载，再启用限制或提高最低版本。
2. 填写稳定版本号（例如 `0.3.25`）及更新提示，保存并确认。不要填 `v` 前缀或预览版本号。
3. v0.3.24 及后续客户端在激活前、启动和运行中检查签名策略；低于要求时隐藏工作区、禁止新操作，显示下载入口与 10 秒倒计时，由主进程退出。刷新界面不会重置计时。
4. 点击“打开新版下载页面”进入浏览器，客户端退出不会关闭浏览器。下载并安装新版后仍需有效授权。
5. 如最低版本填写错误，在后台关闭开关或改回已发布版本。客户端收到新策略后取消限制；已经退出的客户端重新打开并联网即可检查。

运行中通常在下次 5 分钟检查生效，倒计时从客户端收到限制并显示页面时开始。尚未收到新策略的离线客户端可用到原授权凭证到期；已经收到限制的客户端会缓存签名策略，离线重启不会自动解除限制。相同基础版本的预览版低于正式版。不符合版本的激活请求不会消耗设备绑定。

本功能不能追溯关闭 v0.3.23 及更早、没有该模块的旧副本。授权与最低版本限制均不删除项目、素材或中转站设置；退出前未保存的编辑不保证恢复。

## 文件与独立测试版

- 云端测试程序：`F:/WuhuAI/license-cloud-v1/芜湖AI云端授权.exe`。
- 测试用户数据：`%APPDATA%/WuhuAI Cloud License Preview`，与正式版隔离；测试版关闭自动更新。
- 正式版：`F:/WuhuAI/ai-video-canvas/芜湖AI.exe`，原数据位于 `%APPDATA%/AI Video Canvas`。
- 私有资料：`F:/WuhuAI/license-cloud-private`。其中 `admin-login.txt` 是管理登录码，`signing-private.pem` 是签名私钥，`deploy.secrets.json` 是部署密钥文件。该目录还包含所有者测试码、部署记录、验收记录与数据库备份。

私有目录不属于源码仓库。请把私有资料及数据库备份另行保存在所有者控制的备份介质中；不要提交 GitHub、复制到客户端安装包或发给用户。正常重部署沿用现有签名密钥，不要重新生成密钥替换现有客户端信任的公钥。

## 维护、备份与恢复

在仓库根目录运行以下命令；需要已登录所有者的 Wrangler。当前环境使用已有系统代理，Node 命令如不使用系统代理可能连接超时。不要关闭 TLS 证书验证。

```powershell
node license-cloud/build-admin.cjs
npx wrangler d1 migrations apply wuhu-ai-license --remote --config license-cloud/wrangler.jsonc
npx wrangler secret bulk F:/WuhuAI/license-cloud-private/deploy.secrets.json --config license-cloud/wrangler.jsonc
npx wrangler deploy --config license-cloud/wrangler.jsonc
```

数据库已导出为 `F:/WuhuAI/license-cloud-private/d1-backup-20261030.sql`。后续备份使用新的日期文件名：

```powershell
npx wrangler d1 export wuhu-ai-license --remote --output F:/WuhuAI/license-cloud-private/d1-backup-YYYYMMDD.sql --config license-cloud/wrangler.jsonc
```

恢复时优先在 Cloudflare D1 控制台使用 Time Travel 恢复到所需时间点。SQL 备份应先导入空白替代数据库核对授权与绑定数据，确认后再把 Worker 的 D1 binding 切到替代数据库并部署；不要把完整建表备份直接导入运行中的数据库。导入命令为：

```powershell
npx wrangler d1 execute <空白替代数据库名称> --remote --file F:/WuhuAI/license-cloud-private/d1-backup-YYYYMMDD.sql
```

数据库与签名密钥都需恢复才能保持原授权连续可用。管理登录码对应部署文件内的密码摘要，Worker Secret 不可从客户端取回。管理员遗失登录码时，可由持有 Cloudflare 账户的所有者重设密码摘要并更新 Secret；不要更换签名密钥来重置登录码。

## 验证与发行边界

- 已通过 34 个测试文件、287 项自动测试及前端构建，包括签名版本策略、10 秒退出、断网重启与取消限制。
- 已通过真实云端接口验证：健康检查、公钥匹配、同一码双设备并发绑定只成功一台、防重放、停用恢复、解绑换机、管理登录与 CSRF；自动测试授权已停用。
- 已用所有者七天测试码在独立 Electron 桌面程序中激活进入首页。
- 客户端正式打包检查会拒绝未配置服务、HTTP 地址、本地试用配置、预览配置及无效公钥。

当前电脑已成功访问云端服务，不代表其他网络均可达。目标用户首次激活前需能访问当前 workers.dev 域名，必要时接自有域名或更换托管入口。客户端沿用正式版的数据目录和安装标识，授权文件单独保存；升级前建议备份重要项目。

从 v0.3.24 正式发布开始，升级用户与新用户均需激活。已下载、未升级的 v0.3.23 没有授权模块，无法通过本次云端部署或 GitHub 更新追溯锁住。
