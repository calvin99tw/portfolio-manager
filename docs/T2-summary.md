# T2 工作摘要：GitHub repo + Pages 設定

**狀態**：✅ 完成
**影響範圍**：GitHub repo 建立 + Pages 托管設定（無 repo 程式碼足跡）

> ⚠️ 本文件為**事後回溯重建**（docs/Tx-summary.md 慣例於 T4 才建立，見 commit `14f97ef`）。
> 內容依 CLAUDE.md 既有記錄回推，非當時同步撰寫。git 最早的 `Initial commit`、
> `Add CLAUDE.md` 對應此階段。

---

## 完成項目

- 建立 GitHub repo：`https://github.com/calvin99tw/portfolio-manager`（Public）
- 啟用 GitHub Pages 托管（HTTPS）：
  - Pages URL：`https://calvin99tw.github.io/portfolio-manager/`
  - 部署方式：push to `main` → 自動觸發 `pages-build-deployment` workflow（GitHub 內建，非 repo 內自訂）
- 於 Supabase 更新 **URL Configuration**：把 Pages 網址加入 Auth 的 Site URL / Redirect URLs 白名單，
  使 Magic Link / OTP 登入導回正式站（T3 登入的前置條件）。

---

## 設計基礎（沿用至今）

- **靜態站 + 雲端後端**：GitHub Pages 只托管靜態 `index.html`，所有狀態存 Supabase；
  無伺服器端，任何需要排程/後端運算的功能（如 T13 推播）改由 Cloudflare Worker 承接。
- **Public repo 的資安界線**：因 repo 公開，個人財務資料一律不進版控——
  `.gitignore` 設 `*.csv`（本機備份）、dashboard.json（投資決策，T12 改走 Supabase 匯入）等。

---

## 備註

此任務為平台設定，無對應程式碼邏輯；Pages 部署行為與踩坑（如 Node 20 deprecation 告警、
偶發 `deployment_queued` 排隊）詳見後續 T11/T12 期間的實務記錄。
