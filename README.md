# 拾用 · 个人工具箱

> 本仓库为历史静态工具箱版本。工具箱已迁入 `D:/myJavaWebSite/frontend`，并与原 Vue 前端合为同一工程。
> 后续功能与维护统一在 [myJavaWebSite 的 frontend](https://github.com/xeq27/myJavaWebSite/tree/codex/ecs-middleware/frontend) 进行。
> 以下文档保留用于理解历史版本；新的启动方式为 `cd D:/myJavaWebSite/frontend; npm run dev`。


七个工具（支持本地使用，待办与备忘录可选登录上云）：JSON 格式化、文本对比、待办清单、备忘录、Base64 编解码、URL 编解码、时间戳转换。

## 本地使用

需要 Node.js 18 或更新版本，无需安装依赖。本地工具无需启动 Java，运行 `node server.mjs`，打开 http://127.0.0.1:4173 。
执行全部测试：`npm test`。

## 文件职责

- `dist/index.html`：工作台结构。
- `dist/styles.css`：浅色主题、卡片网格、移动端适配。
- `dist/app.js`：主页搜索、工具交互和本地备忘录。
- `dist/tools.js`：独立的文本处理与日期转换逻辑。
- `dist/json.js`：JSON 词法处理、无损格式化、控制字符兼容和严格校验。
- `deploy/`：可复用的容器构建与代理配置；实际环境文件仅保存在本机或服务器。

## 数据边界

未登录时，工具内容只在浏览器处理，待办和备忘录通过 localStorage 保存，不跨设备同步。登录后，账户信息、待办和备忘录保存到 Java/MySQL 云端，其他文本工具仍在浏览器处理。
JSON 格式化和压缩保留数字原始文本，不经过 Number 转换，避免大整数、长小数和科学计数法失真。
JSON 使用单个编辑区，格式化和压缩成功后原位替换内容；处理失败或严格校验时保留当前文本。
字符串内的原始控制字符（例如真实换行、回车和制表符）会被转义，并在编辑区下方提示。
“严格校验”检查原始输入，不执行自动修复。非法转义、HTML 实体形式的结构空白、行尾反斜杠、
缺失引号和逗号等结构错误均会报错，不进行全局替换或猜测修复。
格式化保留键顺序及重复键；调用方若自行使用 JSON.parse 读取结果，仍需自行处理数字精度和重复键语义。
文本对比限制 LCS 计算规模，避免过长输入阻塞浏览器。

主页将七个工具集中展示，不设分类、收藏筛选或推荐横幅。浏览器备忘录存储键保持不变。

## ECS Docker 部署

部署后访问 `http://<your-ecs-host>/`。前端和 Java 均部署在同一 ECS 的 Docker 中，
前端 Nginx 接收 80 端口请求，通过容器网络转发到 Java；MySQL 使用已配置的 MySQL 数据库。

- `shiyong-toolbox`：前端 Nginx，公开宿主机 80 端口。
- `shiyong-java`：Java 服务，宿主机仅绑定 127.0.0.1:8080。
- `mysql`：原有 MySQL 容器，本次不重启、不替换、不迁移数据。

Nginx 仅将 `/api` 及其子路径、`/actuator/health` 及其子路径转发给 Java。
健康检查地址为 `/actuator/health/database`；返回 HTTP 200 和 UP 表示数据库可用。
编码等文本处理在浏览器完成。未登录时待办和备忘录保存在当前访问地址对应的 localStorage 中；登录后使用当前账号云端空间。
不同域名、协议或端口的访客内容不会自动迁移。HTTP 下支持笔记 ID 生成和复制操作的兼容处理。

### 文件与发布包

- `deploy/Dockerfile`：只打包前端资源，不包含数据库或 SSH 凭据。
- `deploy/nginx.conf`、`deploy/proxy_params.conf`：静态资源和同源 Java 代理。
- `scripts/package-ecs.mjs`：按白名单生成前端发布包，不打包临时文件、密码和本地浏览器数据。
- `D:/myJavaWebSite/backend/deploy/compose.yaml`：统一编排前端与 Java 容器。

```powershell
cd D:/mywebsite
npm test
$env:JAVA_IMAGE = 'shiyong-java:your-release-tag'
node scripts/package-ecs.mjs
```

打包结果和镜像标签记录在忽略的 `.sites-local/ecs-frontend-release.json`。
上传归档到 ECS 的 `/opt/shiyong/` 后，在独立 `/opt/shiyong/releases/<release-id>/` 中解压，执行：

```sh
docker build --pull=false -t <发布包记录的前端镜像标签> .
docker compose --env-file release.env -p shiyong -f compose.yaml up -d --wait
curl --fail http://127.0.0.1/actuator/health/database
```

仅更新前端可在 compose up 命令中使用 `--no-deps frontend`。
数据库环境文件单独保存在 `/opt/shiyong/backend.env`，权限 600；不进入镜像或源码。
回滚时，在旧发布目录使用其 release.env 和 compose.yaml 重新执行 compose up。
不执行 docker system prune 或删除 MySQL 作为发布步骤。

实际部署地址、数据库参数和站点身份配置不进入 Git。Sites 历史配置仅保存在本机。

## 本地前后端联调

```powershell
cd D:/myJavaWebSite/backend
# 首次配置时复制 .env.example 为 .env.local 并填写数据库密码；不要覆盖已有配置。
.\start-ecs.ps1
```

另一个终端在 D:/mywebsite 运行 `node server.mjs`，访问 http://127.0.0.1:4173 。
本地 Node 将同源 `/api` 和健康检查转发到 http://127.0.0.1:8080 ，可用 BACKEND_TARGET、PORT 修改。
`dist/backend.js` 只请求健康状态，不上传工具输入或笔记。后端不可用时，本地工具继续可用。

## 配置安全

Git 仅保存通用配置及无敏感值的 .env.example 模板。.env.local、私钥、证书、.sites-local/、发布包和日志均被忽略；不要使用 git add -f 提交这些文件。

## 待办清单
支持添加、编辑、勾选完成和删除；未完成任务置前。访客使用独立的 shiyong-todos 本地存储键，登录后使用账号云端空间。保存失败时保留输入并提示错误。dist/todos.js 管理清单交互并通过存储适配器切换本地和云端。

## 可选账户与云端保存

页面默认本地模式，不自动检查后端或查询账户。点击“登录 / 注册”进入账户页。
注册使用4–32位字母、数字、下划线用户名和12–128字符密码；注册完成后另行登录。
登录后待办、备忘录切换为当前账户的云端内容；首次登录不自动上传本地内容。
账户页提供需要确认的“导入本地待办和备忘录到云端”，追加到云端且保留本地副本，重复导入会产生副本。
退出登录恢复访客原有本地内容。云端断网保存失败会保留输入并提示未保存，不会把云端内容写入访客本地空间。
按单用户单设备编辑设计，不提供多人协作、版本冲突检查或设备互踢。

account-client.js 负责同源会话、CSRF和云端保存队列；account.js 管理账户界面与存储模式。
会话 Cookie 为 HttpOnly；前端不保存密码或会话令牌到 localStorage。
sessionStorage只记录用户是否选择云端模式，以便刷新恢复；未登录默认不发请求。
Java后端需要启用database构建配置和MySQL环境，应用迁移前请先阅读后端部署说明。本次改动不自动执行生产建表或部署。