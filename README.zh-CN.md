# JSONL Viewer

[English](README.md) | **简体中文**

基于 Rust、Tauri 2、React 19 和 Astryx 的本地桌面工具，用于查看 JSON Lines 数据和 Agent 会话。

## 使用

- 打开、拖入或双击 `.jsonl` / `.ndjson` 文件；也支持逐行读取 `.json`、`.log`、`.txt`。
- 表格、树形、原文和会话视图；支持已加载内容搜索、行详情、复制、列显隐与列宽调整。
- 行详情覆盖在窗口右侧，不挤压主内容；宽度为窗口的 50%，最大 960 像素，高度撑满内容视口。标题、编辑/保存和复制操作固定，中间内容统一滚动。
- 切换视图时先显示 Astryx 骨架屏，再构建数据视图；表格和树形的长文本使用短预览，完整 JSON 可在行详情或展开行中查看。
- 自动识别 STS、Codex、Claude Code、Pi 和 Hermes 会话，显示消息、思考、工具调用与结果、模型、推理强度和 token 用量。
- 多文件标签页、目录浏览、最近文件、会话来源、父子会话导航。
- 最近文件保留最多 50 条，侧栏默认显示 5 条，可展开更多；悬停或键盘聚焦单条历史时显示垃圾桶，只移除该条记录。当前文件标签和侧栏已打开项的关闭按钮始终可见，其他文件在悬停或键盘聚焦时显示，未保存的修改会先提示确认。
- 保存和错误提示统一显示在右下方，最新提示距窗口底部 80 像素，不随应用缩放改变；多个提示向上堆叠。
- 文件关闭按钮在鼠标悬停和按下时不显示背景框，键盘聚焦时保留焦点轮廓。
- 会话排序、宽度和详情开关使用主工具栏中的图标按钮，悬停可查看操作提示。Windows 原生菜单栏隐藏，菜单快捷键仍然保留。
- 会话文件变化时自动刷新，支持最新在前、消息跳转和暂停/恢复跟随。
- 进入编辑模式，在行详情中编辑 JSON。有效输入立即保留为草稿，点击保存写入磁盘；未完成的 JSON 也会触发未保存提示。
- 浅色、深色、跟随系统；界面使用 Astryx Neutral 主题，支持 80%–150% 缩放。
- 界面支持英语与简体中文。在文件浏览器的“语言”选项中选择跟随系统、English 或简体中文。默认跟随系统：系统语言为中文时使用简体中文，其他语言回退到英语。手动选择会在重启后保留。切换语言保留已打开文件、草稿和视图状态；原始数据和技术诊断保持原样。

文件按 1,000 条非空记录逐批加载，表格/树形/原文视图每页展示 100 条已加载记录。搜索范围是当前已加载内容。保存由 Rust 合并修改行与完整源文件，保留未加载内容、未修改的空白和换行；发现外部修改时拒绝覆盖。另存为完整副本后，源文件的草稿仍保留。

## 开发

Windows 需要 Rust stable、MSVC C++ Build Tools、Node.js 22.12+ 和 WebView2 Runtime。

```powershell
npm ci
npm run desktop
```

`npm run dev` 仅启动前端预览；本地文件操作需要 Tauri 桌面进程。

```powershell
npm run build                         # TypeScript 与前端构建
npm test                              # 前端状态与编辑回归
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri -- build --debug --no-bundle
npm run test:native                    # Windows WebView2，真实文件读写
npm run desktop:build                  # Release EXE 与 NSIS 安装包
```

Windows 下，`npm run desktop:build` 生成 `src-tauri/target/release/JSONL Viewer.exe` 和 `src-tauri/target/release/bundle/nsis/JSONL Viewer_2.0.0_x64-setup.exe`。

原生测试在系统临时目录创建测试文件，不修改项目中的样例。请先关闭正在运行的 JSONL Viewer，避免单实例进程接收测试参数。截图默认写入临时目录；可设置 `JSONL_QA_ARTIFACT_DIR` 保存截图。

## 架构

| 目录 | 职责 |
|---|---|
| `src-tauri/src/reader.rs` | 字节游标、物理行号、JSONL 分页与 UTF-8 处理 |
| `src-tauri/src/documents.rs` | 文档身份和版本、完整保存、修改冲突检查 |
| `src-tauri/src/atomic_save.rs` | 平台原子替换 |
| `src-tauri/src/traces/` | 格式检测、消息归一化、工具结果匹配与会话元数据 |
| `src-tauri/src/discovery.rs` | 目录与标准会话来源 |
| `src-tauri/src/desktop.rs` | Tauri 命令、原生菜单、文件变化事件与单实例 |
| `src-tauri/src/menus.rs` | 原生菜单快捷键与共享语言目录中的文案 |
| `src/i18n/` | 中英文文案、语言偏好、系统语言检测与 Astryx 国际化 |
| `src/workspace/` | 每文件独立状态、草稿及异步响应确认 |
| `src/views/` | 表格、树形、原文、会话与行详情 |
| `src/components/` | 文件浏览器、工具栏与会话来源 |

所有交互控件直接使用 Astryx。自定义 CSS 仅处理窗口尺寸、滚动容器和数据排版；系统文件对话框、菜单和窗口由原生平台提供。字体和样式随应用打包，无运行时 CDN 依赖。

Windows 原生流程有自动化回归。macOS/Linux 未在当前环境验证；如需构建其他平台，应在对应系统安装 Tauri 前置依赖并调整 bundle targets。持续写入的文件可能暂时被写入进程锁定，保存失败时草稿会保留。实时更新只解析新行；文件完整性检查会读取已有字节，因此极大文件的刷新成本仍随文件大小增加。

## 组件文档

```powershell
npm run astryx -- component Table --dense
npm run astryx -- component Chat --dense
```

## License

MIT。第三方组件、字体及 Rust 依赖适用各自许可证。
