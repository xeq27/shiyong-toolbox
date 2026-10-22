# 拾用 · 个人工具箱

六个浏览器本地工具：JSON 格式化、文本对比、备忘录、Base64 编解码、URL 编解码、时间戳转换。

## 本地使用

需要 Node.js 18 或更新版本，无需安装依赖。先启动 Java 后端，再运行 `node server.mjs`，打开 http://127.0.0.1:4173 。
执行全部测试：`npm test`。

## 文件职责

- `dist/index.html`：工作台结构。
- `dist/styles.css`：浅色主题、卡片网格、移动端适配。
- `dist/app.js`：主页搜索、工具交互和本地备忘录。
- `dist/tools.js`：独立的文本处理与日期转换逻辑。
- `dist/json.js`：JSON 词法处理、无损格式化、控制字符兼容和严格校验。
- `deploy/`：可复用的容器构建与代理配置；实际环境文件仅保存在本机或服务器。

## 数据边界

输入内容只在浏览器处理。备忘录通过 localStorage 保存，不跨设备同步；清理网站数据会删除本地笔记。
JSON 格式化和压缩保留数字原始文本，不经过 Number 转换，避免大整数、长小数和科学计数法失真。
JSON 使用单个编辑区，格式化和压缩成功后原位替换内容；处理失败或严格校验时保留当前文本。
字符串内的原始控制字符（例如真实换行、回车和制表符）会被转义，并在编辑区下方提示。
“严格校验”检查原始输入，不执行自动修复。非法转义、HTML 实体形式的结构空白、行尾反斜杠、
缺失引号和逗号等结构错误均会报错，不进行全局替换或猜测修复。
格式化保留键顺序及重复键；调用方若自行使用 JSON.parse 读取结果，仍需自行处理数字精度和重复键语义。
文本对比限制 LCS 计算规模，避免过长输入阻塞浏览器。

主页将六个工具集中展示，不设分类、收藏筛选或推荐横幅。浏览器备忘录存储键保持不变。

## ECS Docker 部署

部署后访问 `http://<your-ecs-host>/`。前端和 Java 均部署在同一 ECS 的 Docker 中，
前端 Nginx 接收 80 端口请求，通过容器网络转发到 Java；MySQL 使用已配置的 MySQL 数据库。

- `shiyong-toolbox`：前端 Nginx，公开宿主机 80 端口。
- `shiyong-java`：Java 服务，宿主机仅绑定 127.0.0.1:8080。
- `mysql`：原有 MySQL 容器，本次不重启、不替换、不迁移数据。

Nginx 仅将 `/api` 及其子路径、`/actuator/health` 及其子路径转发给 Java。
健康检查地址为 `/actuator/health/database`；返回 HTTP 200 和 UP 表示数据库可用。
所有文本处理仍在浏览器完成，备忘录保存在当前访问地址对应的 localStorage 中，
不同域名、协议或端口的笔记不会自动迁移。HTTP 下支持笔记 ID 生成和复制操作的兼容处理。

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
