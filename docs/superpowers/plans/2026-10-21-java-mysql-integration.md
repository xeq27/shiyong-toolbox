# 工具箱与 Java / ECS MySQL 接通计划

**范围确认：** 保留 D:/mywebsite 静态前端；备忘录继续使用 localStorage，不新增业务表。
Java 后端使用 D:/myJavaWebSite/backend，连接用户指定的 ECS MySQL 数据库。

**架构：** 浏览器使用同源 HTTP 请求，经 Node 开发服务器代理到 Java 8080。
复用 Actuator 健康检查；单独的 database 健康组验证真实数据源连接。
ECS 专用配置导入本机忽略的凭据文件，默认关闭 Flyway 迁移。

## 执行与验证

- [x] 在 tests/server.test.mjs 验证真实上游转发、POST 请求体、追踪头、502 与静态文件隔离。
- [x] 在 tests/backend.test.mjs 验证健康状态、数据库不可用、非 JSON、超时和网络故障。
- [x] 将 server.mjs 改成可导出的服务器工厂，支持 BACKEND_TARGET 和 PORT；保留直接启动命令。
- [x] 新增 dist/backend.js，连接状态 UI 不传输任何工具输入或本地备忘录。
- [x] 新增 application-ecs.yml、本机 .env.local 与无密码 .env.example、start-ecs.ps1。
- [x] MySQL 配置关闭默认迁移，增加只暴露状态的 database 健康组。
- [x] 更新两个项目 README，明确端口、启动顺序和凭据边界。
- [x] 运行 npm test、Maven clean verify；真实启动 ECS 配置，经代理验证 Java 与数据库状态。
- [x] 检查 diff、凭据忽略规则，将源码、测试和文档纳入 Git 追踪；不推送或部署。

验证记录：工具箱 18 项测试通过；Java 3 项测试通过，带 database 依赖构建成功。
真实 ECS 模式下，直连与代理的 database 健康检查均为 HTTP 200 / UP；Chrome 页面显示 Java 已连接、MySQL 已连接。
