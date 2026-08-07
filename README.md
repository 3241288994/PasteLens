# PasteLens

PasteLens 是一个本地优先的 AI/终端输出阅读器：从 Codex、Claude、Termius 或其他应用复制文本，通过桌面悬浮球打开阅读面板，自动恢复并渲染 Markdown、LaTeX 与终端表格。其设计初衷是解决 codex cli 的 latex 渲染问题，终端输出的 codex 回复由于公式，格式无渲染难以阅读，在 codex cli 下通过选中复制或ctrl+o 复制最后一次回复，可在悬浮球中观看渲染后文本并进行公式复制，文字检索，超链接跳转，以及 ai 追问。
## 演示

![PasteLens 从原始 AI 输出到公式、表格、复制提示与本地历史的完整流程](docs/assets/pastelens-demo.gif)

## 安装

当前预构建 DMG 面向 Apple Silicon（`arm64`），要求 macOS 11 或更高版本。打开 DMG 后，将 `PasteLens.app` 拖入 `Applications`。

社区预览版使用 ad-hoc 签名，尚未经过 Apple 公证。首次启动若被 macOS 拦截，请在 Finder 中右键 `PasteLens.app`，选择“打开”并确认。

## 当前能力

- 双窗口桌面结构：可拖动悬浮球与贴边阅读面板。
- 右键悬浮球可打开/隐藏阅读窗口或退出应用。
- 可选在呼出阅读面板时自动读取并渲染当前剪贴板，偏好仅保存在本机，也保留手动粘贴入口。
- 本地渲染历史侧边栏，支持搜索、置顶、键盘导航、滚动位置恢复、单条删除和清空。
- 全局快捷键：`Option/Alt + Shift + Space`。
- 标准 GFM Markdown、KaTeX 数学公式和 Mermaid 图表渲染。
- 代码块支持语法高亮、一键复制、自动换行与行号切换。
- 悬停公式显示操作条，可复制原始 LaTeX 或导出 SVG/PNG。
- 划选文字或公式后可生成带上下文的提示词，并从内置或自定义模板中选择提问方式，再打开 ChatGPT 供粘贴提问。
- 本地文件超链接悬停提示，点击即可复制对应文件路径。
- HTTP/HTTPS 网页链接使用系统默认浏览器打开。
- 恢复终端吞掉反斜杠后的裸 `[` / `]` 展示公式。
- 恢复 `(M_G)`、`(R^2>0)` 等高置信度行内公式。
- 根据 Unicode 显示宽度恢复带中文内容的终端表格。
- 预览与原文对照两种视图，可一键复制修复后的标准 Markdown。
- 支持导出长图 PNG、独立 HTML，并通过系统打印面板保存 PDF。
- 长文支持全文查找、标题目录与返回顶部。
- 每一处自动恢复都有行号、理由与置信度记录。
- 历史记录仅保存在本机浏览器存储中，可随时清空；内容不会上传，也不会执行其中的 HTML。

## 开发

需要 Node.js 20+、pnpm 和 Rust stable。

```bash
pnpm install
pnpm test
pnpm desktop:dev
```

构建桌面应用：

```bash
pnpm desktop:build
```

只生成用于 GitHub Release 的 macOS DMG：

```bash
CI=true ./scripts/tauri-local.sh build --bundles dmg
```

产物位于 `src-tauri/target/release/bundle/dmg/`。

启动脚本会优先使用项目内 `.tools/` 中的 Rust 工具链；不存在时自动使用系统 Rust。

只调试渲染界面时可以运行：

```bash
pnpm dev
```

然后访问 `http://127.0.0.1:1420`。浏览器模式不具备原生悬浮窗能力，但可以测试文本恢复与渲染。

## 保真原则

PasteLens 的恢复层只补充分隔符和结构，不生成或改写公式。无法高置信度识别的输入保留原文。代码围栏、行内代码和普通括号不会进入恢复流程。

处理管线：

```text
粘贴文本
  → 移除 ANSI/控制字符
  → 识别代码、公式和终端表格
  → 生成带置信度的标准 Markdown
  → remark/GFM
  → KaTeX
  → 本地 WebView
```

## 项目结构

- `src/recovery/`：可独立测试的终端 Markdown 恢复引擎。
- `src/render.ts`：GFM、数学公式到安全 HTML 的渲染管线。
- `src/main.ts`：阅读面板交互。
- `src/ball.ts`：悬浮球点击和拖动交互。
- `src-tauri/`：原生窗口、定位、快捷键与剪贴板能力。
- `tests/`：防误判与保真恢复测试。

## 已知边界

- 终端复制已经彻底删除的字符无法无歧义恢复。
- 首版表格恢复要求存在多段 `━`、`─` 或 `═` 分隔线。
- Linux Wayland 的全局快捷键和窗口定位将在后续单独适配。

## License

MIT
