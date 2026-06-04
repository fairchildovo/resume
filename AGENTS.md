# Project Agent Instructions

本文件只记录 `D:\ovo\Documents\Tian\resume` 的项目级规则。全局规则仍然适用。

## Project Shape

- 项目是 `magic-resume`，基于 TanStack Start、React 18、Vite、TypeScript、Tailwind、Zustand。
- 当前路由源是 `src/routes/**` 的 TanStack Router 文件路由。
- `src/app/**` 仍被路由和兼容层引用，不要按普通 Next.js 迁移残留直接删除。
- 架构说明见 `docs/architecture.md`。改动路由、状态、模板、导出、AI API、部署路径时同步维护该文档。

## Commands

- 安装依赖：`pnpm install`
- 开发：`pnpm dev`
- 构建：`pnpm build`
- 生产启动：`pnpm start`
- 本地预览：`pnpm preview`
- 模板快照：`pnpm generate:template-snapshots`

## Maintenance Rules

- 保持改动小而集中。不要顺手重构模板、UI、状态和导出链路。
- 简历数据模型以 `src/types/resume.ts` 为准。新增字段时同步初始数据、编辑器、模板、导出和旧 JSON 兼容。
- 模板入口是 `src/components/templates/registry.ts`。新增模板时只改对应模板目录、registry、必要快照资源。
- `useResumeStore` 负责简历主状态和持久化。不要绕过 store 直接改 localStorage 中的 `resume-storage`。
- 文件同步依赖浏览器 File System Access API 和 IndexedDB handle。调试同步问题时先检查权限、handle、`updatedAt`、文件 `lastModified`。
- `#resume-preview` 是导出链路关键 DOM。不要在预览折叠、布局切换或移动端适配中无意移除它。
- API routes 不得打印 raw API key、Authorization header、完整 request body。
- 可见 UI 文案默认同步 `src/i18n/locales/zh.json` 和 `src/i18n/locales/en.json`。

## Verification

- 文档或配置小改：至少跑 `git diff --check`；能跑构建时跑 `pnpm build`。
- TypeScript、路由、store、模板、导出、API 改动：跑 `pnpm build`。
- Workbench、模板、导出 UI 改动：启动 `pnpm dev`，浏览器检查 `http://localhost:3000` 关键路径。
- PDF/export 改动：用真实简历验证 PDF、打印、JSON 或 Markdown 中受影响的格式。
- AI route 改动：验证成功路径和 upstream error，输出中只报告密钥存在性或 redacted 值。

## Existing Dirty State

开始修改前先看 `git status --short`。如果已有与任务无关的删除、未跟踪文件或用户改动，不要恢复或清理，除非用户明确要求。

