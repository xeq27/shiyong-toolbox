# 拾用 · 个人工具箱

六个浏览器本地工具：JSON 格式化、文本对比、备忘录、Base64 编解码、URL 编解码、时间戳转换。

## 本地使用

需要 Node.js 18 或更新版本，无需安装依赖。运行 `node server.mjs`，打开 http://127.0.0.1:4173 。
执行测试：`node --test tests/tools.test.mjs`。

## 文件职责

- `dist/index.html`：工作台结构。
- `dist/styles.css`：浅色主题、卡片网格、移动端适配。
- `dist/app.js`：分类、收藏、搜索、工具交互和本地备忘录。
- `dist/tools.js`：独立的文本处理与日期转换逻辑。
- `.openai/hosting.json`：Sites 身份与静态发布目录。

## 数据边界

输入内容只在浏览器处理。收藏和备忘录通过 localStorage 保存，不跨设备同步；清理网站数据会删除本地笔记。
JSON 使用 JavaScript 标准解析器，超出安全整数范围的数字应以字符串输入。
文本对比限制 LCS 计算规模，避免过长输入阻塞浏览器。
