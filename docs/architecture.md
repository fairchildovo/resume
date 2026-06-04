# Magic Resume Architecture

本文档记录当前项目结构和维护边界。内容来自仓库现有文件，不代表未来计划。

## 项目定位

Magic Resume 是一个基于 TanStack Start 的在线简历编辑器。核心能力包括：

- 简历创建、编辑、复制、删除和本地持久化。
- 多模板 A4 简历预览。
- PDF、浏览器打印、JSON、Markdown 导出。
- AI 润色和错别字/标点校对。
- 中英文界面与模板初始数据。
- 可选目录同步，将简历 JSON 保存到用户授权的本地目录。

## 技术栈

- Runtime: Node.js 20，浏览器端 React 18。
- App framework: TanStack Start + `@tanstack/react-router` 文件路由。
- Build: Vite 7，`@vitejs/plugin-react`，`vite-tsconfig-paths`。
- Language: TypeScript，`strict: true`。
- UI: Tailwind CSS，shadcn/radix 风格组件，HeroUI，lucide-react。
- State: Zustand + `persist` middleware。
- Rich text: Tiptap。
- Motion: framer-motion。
- AI upstream: OpenAI-compatible chat completion endpoints，按模型配置转发。
- Export: 客户端 DOM 克隆 + 外部 PDF export server，另有浏览器打印、JSON、Markdown 导出。

## Runtime Topology

```text
Browser
  |
  | React UI, Zustand, localStorage, IndexedDB, File System Access API
  v
TanStack Start routes
  |
  | /api/polish
  | /api/grammar
  | /api/proxy/image
  v
Upstream services
  - AI provider endpoint
  - Remote image URL
  - PDF export server from PDF_EXPORT_CONFIG.SERVER_URL
```

Production Node 启动路径：

```text
pnpm build
node server.mjs
```

`server.mjs` 从 `dist/client` 提供静态文件，再把非静态请求交给 `dist/server/server.js` 的 `fetch` handler。Docker 镜像也使用这个 Node server。

Cloudflare Workers 配置在 `wrangler.toml`：入口为 `dist/server/server.js`，静态资源目录为 `dist/client`，启用 `nodejs_compat`。

## Source Layout

```text
src/
  app/                 Compatibility pages, layouts, API routes, app shells
  routes/              TanStack Start file routes
  components/          UI, editor, preview, templates, shared widgets
  store/               Zustand stores
  hooks/               Browser-side hooks
  utils/               Export, print, file sync, markdown, fonts, images
  config/              Constants, templates export, initial resume data, AI config
  i18n/                Locale runtime, compatibility layer, locale messages
  types/               Resume and template domain types
  styles/              Tiptap styles
  generated/           Generated template snapshot manifest
public/
  fonts/               Runtime font assets
  template-snapshots/  Template cover images by locale
  features/            Feature artwork
scripts/
  generate-template-snapshots.ts
```

## Routing

The active router is TanStack Router.

- `src/router.tsx` builds the router from generated `routeTree`.
- `src/routes/__root.tsx` owns root HTML, CSS links, locale provider, theme provider, and toast host.
- `src/routes/index.tsx` and `src/routes/$locale.tsx` route public pages.
- `src/routes/app/dashboard/` redirects to dashboard child pages.
- `src/routes/app/workbench/$id.tsx` disables SSR and binds URL resume id into `useResumeStore`.

`src/app/**` remains in use as compatibility/source modules. Several TanStack routes import page components from `src/app/**`, so do not remove `src/app` as "unused Next.js code" without checking imports.

## State And Persistence

Primary resume state lives in `src/store/useResumeStore.ts`.

State shape:

- `resumes: Record<string, ResumeData>`
- `activeResumeId`
- `activeResume`

Persistence layers:

- Zustand `persist` stores `resumes` and `activeResumeId` under `resume-storage`.
- `src/utils/fileSystem.ts` stores File System Access handles in IndexedDB database `FileHandleDB`.
- Optional directory sync uses the `syncDirectory` handle.

Write model:

1. UI calls store update functions.
2. Store updates in-memory state and persisted local storage.
3. Most resume changes trigger debounced file sync after 1.5 seconds when a directory handle exists and permission is granted.
4. On provider mount, `useResumeDirectorySync` imports newer JSON files from the sync directory once per page lifecycle.

Conflict rule:

- File import compares `updatedAt` and source file `lastModified`.
- Newer file data can replace local data.
- Stale files are skipped.

## Resume Domain Model

`src/types/resume.ts` defines the canonical resume model.

Major sections:

- `basic`
- `education`
- `experience`
- `projects`
- `certificates`
- `skillContent`
- `selfEvaluationContent`
- `customData`
- `menuSections`
- `globalSettings`

When adding resume fields, update all relevant layers:

- Type definition.
- Initial data in `src/config/initialResumeData.ts`.
- Editor panel.
- Template rendering.
- Export to JSON/Markdown/PDF if the field should appear in output.
- Import/sync compatibility if older JSON files may omit the field.

## Workbench UI

Workbench route:

```text
/app/workbench/$id
```

Key modules:

- `src/app/app/workbench/[id]/page.tsx`: desktop layout, mobile fallback, panel collapse state.
- `src/components/editor/SidePanel.tsx`: section navigation.
- `src/components/editor/EditPanel.tsx`: active section editor dispatch.
- `src/components/preview/index.tsx`: A4 preview, section click targeting, page break lines, auto-one-page scaling.
- `src/components/mobile/MobileWorkbench.tsx`: mobile workbench.
- `src/components/preview/PreviewDock.tsx`: preview/export controls.

Important invariant:

- `#resume-preview` must stay in the DOM for export. Current desktop workbench hides the preview panel with CSS when collapsed instead of unmounting it.

## Templates

Templates are registered in `src/components/templates/registry.ts`.

Each template has:

```text
src/components/templates/<template-id>/
  config.ts
  index.tsx
  sections/
```

Current registry exports:

- `TEMPLATE_REGISTRY`
- `DEFAULT_TEMPLATES`
- `getTemplateComponent(layout)`

To add a template:

1. Create a template directory with `config.ts` and `index.tsx`.
2. Implement section components under `sections/`.
3. Add config and component imports to `registry.ts`.
4. Add snapshot assets under `public/template-snapshots/<locale>/` if the dashboard should show covers.
5. Run `pnpm generate:template-snapshots` when snapshot generation is needed.

## AI Routes

API routes:

- `src/app/api/polish/route.ts`
- `src/app/api/grammar/route.ts`
- `src/app/api/proxy/image/route.ts`

AI route behavior:

- Client sends `apiKey`, `model`, `content`, `modelType`, and optional `apiEndpoint`.
- Routes look up provider behavior from `src/config/ai.ts`.
- API keys come from the request body and are forwarded upstream; do not log them.
- `/api/polish` streams text back as `text/event-stream`.
- `/api/grammar` expects upstream JSON and returns JSON.

Image proxy behavior:

- Accepts only `http:` and `https:` URLs.
- Fetches remote image with browser-like headers.
- Returns image bytes with no-store cache headers and permissive CORS.

## Export Paths

Main export entry:

- `src/components/shared/PdfExport.tsx`

Utilities:

- `src/utils/export.ts`
- `src/utils/print.ts`
- `src/utils/markdown.ts`

Formats:

- PDF: clone `#resume-preview`, inline optimized styles/images, POST to `PDF_EXPORT_CONFIG.SERVER_URL`.
- Browser print: render via browser print flow.
- JSON: serialize current `ResumeData`.
- Markdown: generated by `generateResumeMarkdown`.

PDF export depends on the preview DOM and current CSS. Changes to preview layout, page padding, font loading, or auto-one-page scaling require export verification.

## Internationalization

Locale files:

- `src/i18n/locales/zh.json`
- `src/i18n/locales/en.json`

Runtime:

- `src/i18n/runtime.ts` resolves preferred locale from path/cookie.
- Root route writes `NEXT_LOCALE`.
- `NextIntlClientProvider` compatibility layer is mounted in `src/routes/__root.tsx`.

When adding visible text, update both locale files unless the text is intentionally fixed-language content.

## Styling And Assets

Global CSS:

- `src/app/globals.css`
- `src/app/font.css`
- `src/styles/tiptap.scss`

Tailwind config scans `src/**/*`, app/page folders, HeroUI theme, and Streamdown output.

Fonts:

- Source Han, Noto Sans SC, MiSans, Alibaba PuHuiTi under `public/fonts`.
- `fonts/` contains additional server/container font files.

Template and export changes should be checked with realistic Chinese and English resume text because font fallback and CJK line wrapping affect A4 pagination.

## Build And Deploy

Common commands:

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
pnpm preview
pnpm generate:template-snapshots
```

Docker:

- `Dockerfile` builds with Node 20 Alpine.
- Build stage runs `pnpm run build` and `pnpm prune --prod`.
- Runtime stage copies `node_modules`, `package.json`, `dist`, and `server.mjs`.
- Container listens on port `3000`.

Cloudflare:

- `wrangler.toml` uses `dist/server/server.js` plus `dist/client` assets.

## Maintenance Guidelines

- Treat TanStack routes as the routing source of truth.
- Keep `src/app/**` compatibility modules if they are imported by routes.
- Keep resume model changes backward-compatible with existing stored JSON.
- Keep template changes isolated to the template directory plus registry/config.
- Keep API routes free of raw secret logging.
- Avoid moving `#resume-preview` or unmounting it during export flows.
- For UI/export changes, test desktop workbench, mobile workbench, and at least one PDF/export path when feasible.
- For AI changes, test upstream error handling without exposing API keys.

## Verification

Minimum checks by change type:

- Documentation-only: `pnpm build` when practical, plus `git diff --check`.
- Type/domain/store changes: `pnpm build`.
- Routing/workbench/template changes: `pnpm build` and browser smoke test at `http://localhost:3000`.
- Export changes: verify PDF or browser print path with a real resume.
- AI route changes: verify success and upstream failure responses with redacted credentials.

