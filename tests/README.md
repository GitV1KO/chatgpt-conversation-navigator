# 浏览器回归测试

从项目根目录执行 `npm test`。需要 Node.js 20+、Playwright，以及 Chrome、Brave 或 Playwright Chromium。测试在系统临时目录创建独立浏览器用户目录，退出后删除，不接触现有浏览器资料。

可以通过环境变量指定运行时：

```sh
CGN_BROWSER_EXECUTABLE="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" npm test
CGN_PLAYWRIGHT_MODULE="/absolute/path/to/node_modules/playwright" npm test
CGN_HEADED=1 npm test
```

测试将完整扩展目录通过浏览器 `--load-extension` 加载，确认 `manifest.json` 注册的隔离世界内容脚本实际注入。没有通过 `addScriptTag` 或页面 `evaluate` 注入扩展实现。页面 `evaluate` 仅用于操作模拟网页、测量目标位置和读取测试断言。

`fixture.mjs` 构造本地模拟 ChatGPT 页面，Playwright 拦截 `https://chatgpt.com/` 和旧域名的文档请求并直接返回本地 HTML；其他请求一律阻止并记录。不会连接真实 ChatGPT、读取登录状态或发送测试消息到真实账号。模拟页具有独立聊天滚动区、固定输入框、真实语义属性、代码/表格/图片消息、延迟加载和 SPA 路由控制。

`results/browser-results.json` 保存每项 PASS/FAIL、耗时、浏览器版本、限制和错误堆栈；`results/browser-results.md` 提供可读表格。响应式截图与失败截图也存于 `results/`。

可选地执行 `node tests/real-site-probe.mjs`，通过全新的匿名浏览器资料只读访问真实 ChatGPT 首页。此步骤需要网络访问，但不会登录、使用现有资料或发送消息；结果记录在 `results/real-site-probe.json`。匿名首页探测不能替代登录账号后的真实长对话测试，HTTP 403、访问验证或加载页均会明确记录为未验证真实应用。

这些测试确认的是实际浏览器上的扩展安装、注入和模拟 DOM 行为，不能证明真实 ChatGPT 当前 DOM、历史加载策略和所有账号实验版本均已兼容。真实页面、Chrome 手动加载、系统缩放与辅助技术仍需人工验证。
