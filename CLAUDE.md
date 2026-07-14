# 投資組合管理工具 — Claude 開發指引

這份文件讓 Claude 在沒有歷史對話的情況下，也能完整理解專案背景與目前進度。

**開發流程（2026-07 起）**：任務的規劃/討論/踩坑改由 **GitHub Issue + PR** 承載，程式碼變更一律走 **PR**（不直推 main），詳見下方「開發規範 → 開發流程（PR + Issue）」。本檔的「開發任務清單」表為 in-repo 永久索引，新任務指向對應 `#issue / PR #`。既有 `docs/T1~T14` 的 spec/summary **封存保留、不再新增**（歷史紀錄）。

## 開工前必讀

1. 先讀本檔「開發任務清單」表定位相關任務。
2. **T15 起**：任務脈絡在 GitHub Issue/PR——用 `gh issue view <N>` / `gh pr view <M>` 讀取
   （需 active 帳號為 `calvin99tw`，見「開發流程」）。
3. **T1~T14**：脈絡在封存的 `docs/Tx-spec.md` / `docs/Tx-summary.md`，直接讀檔。
4. **檢查 `../INBOX.md`**（位於 `投資理財/` 根目錄）是否有 Cowork 留給 Code 的待處理訊息——這是 Code ↔ Cowork 的臨時交換管道（local 檔案，兩邊皆可讀寫，繞開 GitHub 帳號問題），非正式規格仍走 Issue/建檔文件。處理完該筆訊息後記得清空（刪除內容，只留區塊標題）。

---

## 專案概述

個人投資組合管理工具，同時管理台股（TWD）與美股（USD）。
正式版本：`index.html`（v4.2，Supabase + GitHub Pages）
封存版本：`archive/投資組合管理.html`（v3.3.1，純 HTML + localStorage）

---

## v4 架構決策

| 層級 | v3 | v4 |
|------|----|----|
| 儲存 | localStorage + CSV | Supabase（PostgreSQL） |
| 托管 | 本機 file:// | GitHub Pages（HTTPS） |
| 股價 | 手動輸入 | Yahoo Finance v8（台股 `.TW`/`.TWO` + 美股，T11 統一） |
| 匯率 | fawazahmed0（手動觸發） | CBC 中央銀行（自動抓取，T5 完成） |
| 登入 | 無 | Supabase Email Magic Link |

---

## Supabase 設定

- Project URL：`https://ewgduyrxtvwznvvmldtr.supabase.co`
- Anon key：由開發者在對話中提供（不寫入此檔）
- 資料表：

```
pools       → id, poolTWD, poolUSD, usdRate（poolTWD/poolUSD 已廢棄，欄位保留）
buys        → id, name, ticker, currency, shares, costPerShare, buyFee, currentPrice, buyDate
sells       → id, name, ticker, currency, shares, costPerShare, sellPrice, buyFee, sellFee, sellTax, buyDate, sellDate, holdDays, realizedPnL, annualized
dividends   → id, name, ticker, currency, perShare, shares, grossAmount, netAmount, exDate, note
snapshots   → id, user_id, date, twd_value, usd_value, twd_cost, usd_cost, usd_rate, twd_net_deposit, usd_net_deposit（unique: user_id+date）
pool_flows  → id, user_id, currency, type(入金/出金), amount, date, note（T9 新增）
dashboard   → user_id(PK), payload(jsonb), imported_at（T12 新增；dashboard.json 契約 v1 交付管道，單列覆蓋式）
push_subscriptions → id, user_id, endpoint(unique), p256dh, auth, created_at（T13 新增；Web Push 訂閱，Worker 以 service_role 讀取）
```

---

## GitHub Pages

- Repo：https://github.com/calvin99tw/portfolio-manager（Public）
- Pages URL：https://calvin99tw.github.io/portfolio-manager/
- 部署方式：push to main → 自動部署

---

## 開發任務清單

| # | 任務 | 狀態 | 說明 |
|---|------|------|------|
| T1 | Supabase 建專案 + 資料表 | ✅ 完成 | Project URL 與資料表已建立，詳見 docs/T1-summary.md（事後回溯重建） |
| T2 | GitHub repo + Pages 設定 | ✅ 完成 | Pages 上線，Supabase URL Configuration 已更新，詳見 docs/T2-summary.md（事後回溯重建） |
| T3 | App 加入登入功能 | ✅ 完成 | index.html 建立，OTP 驗證碼登入，session 預設一週，資料層暫時還是 localStorage，詳見 docs/T3-summary.md（事後回溯重建） |
| T4 | 資料層換成 Supabase | ✅ 完成 | localStorage → Supabase，localStorage 降級為快取，離線同步，詳見 docs/T4-summary.md |
| T5 | 台股股價自動抓取 | ✅ 完成 | TWSE + CBC，Cloudflare Worker proxy，詳見 docs/T5-summary.md |
| T6 | 美股股價自動抓取 | ✅ 完成 | Yahoo Finance v8，共用 Cloudflare Worker；含 ⚠ 失敗指示器、欄位合併、UUID onclick 修正，詳見 docs/T6-summary.md |
| T7 | 資料移轉 + 正式切換 | ✅ 完成 | v3 封存至 archive/，README 改寫為 v4，詳見 docs/T7-summary.md |
| T8 | 績效歷史快照 + 折線圖 | ✅ 完成 | snapshots 資料表，每次更新行情自動記錄，Chart.js 折線圖 Tab，詳見 docs/T8-summary.md |
| T9 | v4.1 資金池重構 | ✅ 完成 | pool_flows 資料表，入金/出金 modal，pool card 四區塊重構，詳見 docs/T9-summary.md |
| T10 | 資金明細 Tab | ✅ 完成 | 列出 pool_flows 紀錄，支援編輯與刪除，詳見 docs/T10-summary.md |
| T11 | 台股股價改用 Yahoo | ✅ 完成 | 修正 TWSE rwd 端點改回 CSV 導致的收盤價靜默失效；台股改走 Yahoo（`.TW`/`.TWO`），支援盤中取價，詳見 docs/T11-summary.md |
| T12 | 看板 Tab | ✅ 完成 | dashboard.json 契約 v1 階段②：Supabase dashboard 表 + 設定頁匯入 + 看板頁（距行動價%、貼線/跨線/催化劑、附錄 A 呈現），詳見 docs/T12-summary.md |
| T13 | 看板推播 | ✅ infra 完成 | 契約階段③：Worker cron 收盤掃描 + Web Push（RFC 8291/8292 全自建）+ PWA/訂閱管理；催化劑推播已上線，價格推播藏於 `PRICE_PUSH_ENABLED` flag 待雙軌驗證後撥開，詳見 docs/T13-summary.md |
| T14 | 看板 origin/dateConfidence | ✅ 完成 | 契約新增欄位：origin（🔬篩選/👤自選）卡片徽章 + 觀察區分兩組；catalysts.dateConfidence（estimated 淡色/confirmed 醒目），純顯示層，詳見 docs/T14-summary.md |

**Bugfix**：可用餘額對帳失準（美股+台股）（2026-07）— NVDA 重複股息、台達電分批賣出手續費攤分錯誤；修正交易/股息歷史排序（改真正 sort by date）、新增送出前重複檢查，詳見 docs/bugfix-2026-07-可用餘額對帳與重複資料.md

**Cloudflare Worker**：`https://raspy-cherry-f806.calvin99-tw.workers.dev`（已部署，代理 TWSE / CBC / TAIFEX / Yahoo Finance）
- 原始碼：`infra/worker.js`（版控於此 repo）
- **Origin 白名單**：只允許 `https://calvin99tw.github.io` 與 `localhost`，其他 origin 回 403
- CBC 路由加了 `Accept: application/json`，避免 CBC 偶發回傳 XML 導致解析失敗
- **部署方式**：`cd infra && npx wrangler deploy`（npx 當場抓最新版 wrangler，無需在 repo 留 npm 工具鏈；設定全讀 `wrangler.toml`）
  - 需先 `npx wrangler login` 授權一次，token 存於 `~/.config/.wrangler`（本機家目錄，持久保存）
  - **不再 commit `package.json` / `package-lock.json`**：避免部署工具鏈的間接相依（undici/esbuild 等）一直觸發 Dependabot 警示；改用 npx 後每次自動取修補版

---

## 未來開發方向

| 優先度 | 功能 | 說明 |
|--------|------|------|
| 高 | 價格推播撥開 flag | 雙軌比對（App 判定 vs Claude 日掃，7/7 起一至兩週）通過後，`infra/wrangler.toml` 改 `PRICE_PUSH_ENABLED="true"` → `npx wrangler deploy`；之後 Claude 例行掃描交棒（v3.2 B4） |
| 中 | 池間資金轉移 | 從台股池轉到美股池（含匯率換算），同時記兩筆 pool_flows |
| 中 | 目標配置與偏離警示 | 設定每個標的的目標佔比 |
| 低 | 備注欄位 | 每筆買入可加投資理由 |
| 低 | 稅後報酬計算 | 區分股息與資本利得稅率 |

---

## 開發規範

- 字型：`DM Mono`（monospace）+ `Syne`（標題）
- 主題：Dark / Light / System 三段切換，顏色透過 CSS variables 定義
- 顏色語意（亞洲市場慣例）：紅色 = 漲/獲利，綠色 = 跌/虧損，紫色 = 強調
- **CSV 匯出格式變更須同步策略文件**：本地備份 CSV 的區塊或欄位有任何變更（新增/廢棄/改名）時，必須同步檢查並更新 `../股票分析/Taiwan_Alpha_Strategist_v3_1.md` 的 Step 0 解讀規則。該 prompt 以備份 CSV 為唯一資料介面，漏更新會導致分析報告誤讀資料（前例：T9 廢棄 poolTWD/poolUSD 後未同步，日更報告把初始入金額誤當可動用現金）
- **任務與修復皆用 GitHub Issue 追蹤（T15 起），不再寫 `docs/Tx-spec.md` / `docs/Tx-summary.md` / `docs/bugfix-*.md`**：每個正式任務或臨時修復開一個 Issue 當 spec/討論起點，完工於該 Issue 留 summary 註解後關閉；程式碼變更用 PR 掛 `Fixes #N`。既有 T1~T14 的 `docs/Tx-*.md` 封存不動。
- **隱私（重要）**：repo 為 **Public → Issue 與 PR 皆公開**。持倉部位、加碼價位、決策細節等敏感內容**不得寫入 Issue/PR**（那些留在 Supabase / iCloud `股票分析/`）；Issue/PR 只談 App 架構與實作。

### 開發流程（PR + Issue）

**帳號**：git 用 SSH 別名 `git@github.com-personal:calvin99tw/...` 推送；gh 用 token（HTTPS）開 PR / 讀 issue。這台機器 gh 同時存有公司帳號，**動作前務必確認 active 帳號**：

```bash
gh auth status | grep -A1 "Active account: true"   # 應為 calvin99tw
gh auth switch --user calvin99tw                    # 若不是，切回個人
```

**流程**：
1. 開任務/修復 → 建 GitHub Issue（`gh issue create`，標題+目標+驗收；勿含持倉細節）。
2. 建分支：`feat/<slug>`（功能）、`fix/<slug>`（修復）、`chore/<slug>`（雜項），基於最新 `origin/main`。
3. 開發 → commit（訊息含 `Co-Authored-By`）→ `git push -u origin <branch>`。
4. `gh pr create`：內文寫 what/why + `Fixes #N`（自動連結並在合併時關 issue）。
5. 合併到 `main`（`gh pr merge` 或網頁）→ 觸發 `pages-build-deployment` 自動部署。
6. 完工於 Issue 留 summary 註解（做了什麼、踩坑、驗證結果）→ 關閉。
7. 更新本檔「開發任務清單」，「詳見」欄指向 `#N / PR #M`。

> Pages 無 per-PR 預覽；驗證在合併後的正式站進行（同既往）。

---

## 資安規範

- **Cloudflare Worker**：新增路由時，`ALLOWED_ORIGINS` 不需更動；若 upstream API 會依 Accept header 回不同格式，記得在 fetch headers 明確指定
- **CDN 腳本**：`index.html` 中的 CDN script tag 須固定版本號並附 `integrity`（sha384）+ `crossorigin="anonymous"`；升版時要重新計算 hash
- **Supabase Anon Key**：publishable key，設計上可公開；安全依賴 RLS，每張資料表都需有 `user_id` 欄位 + policy
- **Supabase Data API GRANT**：2026/10/30 起，public schema 的資料表需要明確 GRANT 才能透過 PostgREST/supabase-js 存取。**每次新增資料表都必須執行**：`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.<table> TO anon, authenticated;`
- **XSS 跳脫（重要）**：使用者可控的自由文字（name/ticker/note/未來備註欄）進 `innerHTML` 前一律包 `esc()`；插入 `onclick` 等 inline JS 字串時先 `escJs()` 再 `esc()`。session token 存於 localStorage，XSS = 帳號接管，跳脫不可省。
- **登出清快取**：`signOut()` 須 `localStorage.removeItem(STORAGE_KEY)`，避免共用電腦上殘留財務資料
- **CSV 備份**：`.gitignore` 已設 `*.csv`，個人財務資料不進 repo
- **歷次安全測試**：詳見 `docs/security-audit-YYYY-MM.md`

---

## 重要檔案

- `index.html` — 正式版本（v4）
- `infra/worker.js` — Cloudflare Worker 原始碼
- `infra/wrangler.toml` — Wrangler 部署設定（Worker 名稱、Account ID）；用 `npx wrangler deploy` 部署
- `archive/投資組合管理.html` — v3.3.1 封存版，僅供參考
- `README.md` — 使用者文件（功能說明、計算公式、CSV 格式）
- `CLAUDE.md` — 本檔，Claude 開發指引
