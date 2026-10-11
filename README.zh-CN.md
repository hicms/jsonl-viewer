# JSONL Viewer

[English](README.md) | **简体中文**

基于 Rust、Tauri 2、React 19 和 Astryx 的本地桌面工具，用于查看 JSON Lines 数据和 Agent 会话。

## 使用

- 打开、拖入或双击 `.jsonl` / `.ndjson` 文件；`.log`、`.txt` 也按行读取。`.json` 按完整 JSON 文档读取，支持多行对象和数组，原文视图保留源文本。
- 表格、树形、原文和会话视图；支持已加载内容搜索、行详情、复制、列显隐与列宽调整。
- 行详情覆盖在窗口右侧，不挤压主内容；宽度为窗口的 50%，最大 960 像素，高度撑满内容视口。标题、编辑/保存和复制操作固定，中间内容滚动；大文档草稿使用限定高度、内部滚动的编辑框。
- 切换视图时先显示 Astryx 骨架屏，再构建数据视图；表格和树形的长文本使用短预览，完整 JSON 可在行详情或展开行中查看。
- 自动识别 STS、Codex、Claude Code、Pi 和 Hermes 会话，显示消息、思考、工具调用与结果、模型、推理强度和 token 用量。
- 桌面侧栏顶部固定文件入口，底部固定语言、主题和缩放；窄窗口可在导航抽屉中滚动访问设置。文档标题旁显示保存与编辑，视图和列设置下方提供全宽搜索；列选择会持久保存，筛选已加载记录时仍可调整全部已加载字段。
- 多文件标签页、目录浏览、最近文件、会话来源、父子会话导航。
- 最近文件保留最多 50 条，侧栏默认显示 5 条，可展开更多；悬停或键盘聚焦单条历史时显示垃圾桶，只移除该条记录。当前文件标签和侧栏已打开项的关闭按钮始终可见，其他文件在悬停或键盘聚焦时显示，未保存的修改会先提示确认。
- 保存和错误提示统一显示在右下方，最新提示距窗口底部 80 像素，不随应用缩放改变；多个提示向上堆叠。
- 文件关闭按钮在鼠标悬停和按下时不显示背景框，键盘聚焦时保留焦点轮廓。
- 会话排序、宽度和详情开关使用主工具栏中的图标按钮，悬停可查看操作提示。Windows 原生菜单栏隐藏，菜单快捷键仍然保留。
- 会话文件变化时自动刷新，支持最新在前、消息跳转和暂停/恢复跟随。
- 进入编辑模式，在行详情中编辑 JSON。有效输入立即保留为草稿，点击保存写入磁盘；未完成的 JSON 也会触发未保存提示。
- 浅色、深色、跟随系统；界面使用 Astryx Neutral 主题，支持 80%–150% 缩放。
- 界面支持英语与简体中文。在文件浏览器的“语言”选项中选择跟随系统、English 或简体中文。默认跟随系统：系统语言为中文时使用简体中文，其他语言回退到英语。手动选择会在重启后保留。切换语言保留已打开文件、草稿和视图状态；原始数据和技术诊断保持原样。

JSON Lines 文件按 1,000 条非空记录逐批加载，表格/树形/原文视图每页展示 100 条已加载记录。搜索范围是当前已加载内容。保存由 Rust 合并修改行与完整源文件，保留未加载内容、未修改的空白和换行。JSON 文档完整加载为一条记录；编辑保存时以两空格缩进替换完整值，保留 BOM 和换行方式；未编辑时保存保留原始字节。两种格式发现外部修改时均拒绝覆盖。另存为完整副本后，源文件的草稿仍保留。

## 开发

需要 Node.js 22.12+ 和 rustup；Rust 版本由 `rust-toolchain.toml` 固定。Windows 还需要 MSVC C++ Build Tools 和 WebView2 Runtime；macOS 需要 Xcode Command Line Tools；Linux 需要 WebKitGTK 4.1、GTK 3、OpenSSL 和其他 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```powershell
npm ci
npm run desktop
```

`npm run dev` 仅启动前端预览；本地文件操作需要 Tauri 桌面进程。

```powershell
npm run build                         # TypeScript 与前端构建
npm test                              # 前端状态与编辑回归
npm run test:release                   # 发布回归，需要 PowerShell 7 和 Git
cargo test --manifest-path src-tauri/Cargo.toml --locked --no-default-features
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
npm run tauri -- build --debug --no-bundle
npm run test:native                    # Windows WebView2，真实文件读写
npm run desktop:build                  # Release EXE 与 NSIS 安装包
```

Windows 下，`npm run desktop:build` 生成 `src-tauri/target/release/JSONL Viewer.exe` 和 `src-tauri/target/release/bundle/nsis/JSONL Viewer_2.0.0_x64-setup.exe`。

原生测试在系统临时目录创建测试文件，不修改项目中的样例。请先关闭正在运行的 JSONL Viewer，避免单实例进程接收测试参数。截图默认写入临时目录；可设置 `JSONL_QA_ARTIFACT_DIR` 保存截图。

## CI 与发布

GitHub Actions 的 `CI` 工作流在分支推送、Pull Request 和手动运行时检查并打包。`Release` 工作流在推送 `vX.Y.Z` 稳定版本 Tag 时运行相同构建，通过全部检查后发布 GitHub Release。手动运行 `Release` 仅生成预览产物，不创建 Tag 或公开版本。

| 平台 | 架构 | 安装包 |
|---|---|---|
| Linux | x64、ARM64 | `.deb`、`.AppImage` |
| macOS | Intel x64、Apple Silicon ARM64 | `.dmg` |
| Windows | x64、ARM64 | NSIS `.exe` |

产物名称为 `JSONL-Viewer_<版本>_<平台>-<架构>`，例如 `JSONL-Viewer_2.0.0_windows-arm64-setup.exe`。每次发布包括 8 个安装包和 `SHA256SUMS.txt`；CI 的 `release-preview` Artifact 还包含发布说明。平台、架构和文件名统一定义在 `scripts/release-config.mjs`。

Linux 构建以 Ubuntu 22.04 为基线，AppImage 可能需要 FUSE 2。Windows ARM64 应用使用原生 ARM64 二进制，NSIS 安装器使用 x86 模拟运行。macOS 包使用临时签名，未经过 Apple 公证，首次打开可能需要在“系统设置 → 隐私与安全性”中允许。Windows 安装包未配置代码签名。

CI 在六个平台运行 Rust 文件读写回归与 Clippy，并进行前端类型检查、前端测试和发布脚本回归。Windows 运行真实 WebView2 文件读写回归；Linux/macOS 运行桌面进程启动检查，这不覆盖完整 GUI 或 Finder 交互。

### 手动发版

安装 PowerShell 7、Git、Node.js 和 GitHub CLI，并运行 `gh auth login`。在包含发布工作流的代码已推送后，从干净且与 `origin/main` 一致的 `main` 执行：

```powershell
npm run release -- -Help
npm run release -- -Publish                  # 例如 2.0.0 -> 2.0.1
npm run release -- -Publish -Version 2.1.0    # 指定稳定版本
```

也可以直接运行 `pwsh -NoProfile -File scripts/release.ps1 -Publish`。脚本同步 `package.json`、`package-lock.json`、Tauri 配置、`Cargo.toml` 和 `Cargo.lock`，提交版本更新，创建 annotated Tag，并原子推送 `main` 与 Tag。已有但尚未发版的当前版本可以通过 `-Version` 指定，不会生成空提交。缺少 `-Publish` 时不修改仓库。

脚本等待对应 Tag 和提交的 Release 工作流，确认公开版本包含全部 9 个非空文件后报告成功。推送失败时保留本地提交和 Tag，并显示重试命令；工作流失败时可在 Actions 中重跑失败任务。发布先上传到草稿，核对全部文件大小及 SHA-256 后再公开；同一提交的失败草稿可以重试，已经公开的版本不覆盖。

Release 说明按功能、修复、改进和维护归类保留提交标题与正文，附上从上一个可达稳定 Tag 开始的变更链接、安装表、更新说明和校验方法。预览当前提交的说明：

```powershell
node scripts/generate-release-notes.mjs v2.0.0 .plan/release-notes.md --preview
```

Tag 版本必须与全部清单和锁文件一致。不配置额外发布密钥；只有发布 Job 使用仓库 `GITHUB_TOKEN` 的 `contents: write` 权限。代码签名证书与自动更新功能未配置。

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

各平台的安装格式由 Tauri 平台配置自动选择。持续写入的文件可能暂时被写入进程锁定，保存失败时草稿会保留。实时更新只解析新行；文件完整性检查会读取已有字节，因此极大文件的刷新成本仍随文件大小增加。

## 组件文档

```powershell
npm run astryx -- component Table --dense
npm run astryx -- component Chat --dense
```

## License

MIT。第三方组件、字体及 Rust 依赖适用各自许可证。
