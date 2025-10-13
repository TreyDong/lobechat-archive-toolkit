# LobeChat 历史记录导出工具

专为 LobeChat 备份文件打造的 Web 应用，支持解析原始 JSON、浏览会话结构、导出 Markdown 压缩包，以及将数据直接同步到 Notion 数据库或页面。

## 功能概览
- **快速预览**：按助手 / 会话 / 话题的层级结构展示历史记录，提供消息、时间戳等关键信息。
- **Markdown 导出**：一键生成 ZIP 压缩包，可导入 Obsidian、Notion、知识库系统等。
- **Notion 同步**：
  - 兼容“父子页面”与“助手数据库 + 会话数据库”两种模式。
  - 自动拆分块，规避 Notion 100 子节点限制。
  - 按 UTC+8（中国时区）统一格式化创建 / 更新时间。
  - 支持重新运行时的去重、增量更新与断点停止。
- **内置代理支持**：可选使用 Netlify Function (`netlify/functions/notion-proxy.js`) 为浏览器提供 Notion API 中转。

## 目录结构
```
webapp/
├─ dist/                       # 构建结果（构建后生成）
├─ netlify/
│  └─ functions/
│     └─ notion-proxy.js       # Notion API 代理函数
├─ public/                     # 静态资源
├─ src/
│  ├─ components/              # React 组件（导出面板、日志面板等）
│  ├─ lib/
│  │  ├─ datetime.ts           # UTC+8 时间处理工具
│  │  ├─ exporters/            # Notion / Markdown 导出实现
│  │  └─ parser.ts             # LobeChat JSON 解析逻辑
│  └─ stores/                  # Zustand 状态管理
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

## 开发环境
| 工具 | 版本建议 |
| --- | --- |
| Node.js | ≥ 18 |
| npm | ≥ 9 |

安装依赖：
```bash
npm install
```

启动开发服务器：
```bash
npm run dev
```

构建产物：
```bash
npm run build
```

## 使用指南

### 1. 导入 LobeChat 备份
1. 在 LobeChat 中导出历史记录 JSON。
2. 访问本应用，点击“选择文件”导入。

### 2. 导出 Markdown 压缩包
导入后点击“下载 Markdown ZIP”，自动生成按助手 / 会话分组的 Markdown 文件合集。

### 3. 同步到 Notion
1. 准备 Notion Integration Token，并在 Notion 中创建数据库（可选）。
2. 在应用中填写 Token、数据库 ID（或留空使用页面模式）。
3. 如浏览器受限，可在设置中填入代理地址（例如部署在 Netlify 的 `/netlify/functions/notion-proxy`）。
4. 点击“同步到 Notion”执行导出；过程中可随时点击“停止导出”中断任务。

> 数据库模式需要：
> - 助手数据库：至少包含一个 `title` 属性。
> - 会话数据库：包含 `title` 属性、指向助手数据库的 relation 属性，以及可选的 `Session` 富文本字段、创建日期（date 属性）与更新时间（date 属性）。

## 部署说明
- **静态托管**：运行 `npm run build` 后，将 `dist/` 发布到任意静态站点（例如 Netlify、Vercel、Cloudflare Pages）。
- **API 代理**：浏览器直连 Notion API 受限时，可部署 `netlify/functions/notion-proxy.js`，在应用设置中配置代理地址。
- **环境变量**：应用本身不依赖环境变量，Notion Token 由用户在前端填写，不会上传。

## 开源协议
本项目遵循 MIT License，欢迎 Fork 与二次开发。

## 致谢
- [LobeChat](https://github.com/lobehub/lobe-chat)：提供优秀的会话体验与备份功能。
- [@tryfabric/martian](https://github.com/tryfabric/martian)：用于 Markdown → Notion Block 转换。

