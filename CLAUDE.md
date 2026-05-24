# 投資組合管理工具 — Claude 開發指引

這份文件讓 Claude 在沒有歷史對話的情況下，也能完整理解專案背景與目前進度。

每個任務完成後，工作細節與踩坑記錄存放於 `docs/Tx-summary.md`。開始新任務前，**Code 和 Cowork 都應先閱讀相關的 summary**，從過去的經驗中學習，避免重複踩雷。

---

## 專案概述

個人投資組合管理工具，同時管理台股（TWD）與美股（USD）。
正式版本：`index.html`（v4，Supabase + GitHub Pages）
封存版本：`archive/投資組合管理.html`（v3.3.1，純 HTML + localStorage）

---

## v4 架構決策

| 層級 | v3 | v4 |
|------|----|----|
| 儲存 | localStorage + CSV | Supabase（PostgreSQL） |
| 托管 | 本機 file:// | GitHub Pages（HTTPS） |
| 股價 | 手動輸入 | TWSE OpenAPI（台股）+ Yahoo Finance v8（美股） |
| 匯率 | fawazahmed0（手動觸發） | CBC 中央銀行（自動抓取，T5 完成） |
| 登入 | 無 | Supabase Email Magic Link |

---

## Supabase 設定

- Project URL：`https://ewgduyrxtvwznvvmldtr.supabase.co`
- Anon key：由開發者在對話中提供（不寫入此檔）
- 資料表：

```
pools      → id, poolTWD, poolUSD, usdRate
buys       → id, name, ticker, currency, shares, costPerShare, buyFee, currentPrice, buyDate
sells      → id, name, ticker, currency, shares, costPerShare, sellPrice, buyFee, sellFee, sellTax, buyDate, sellDate, holdDays, realizedPnL
dividends  → id, name, ticker, currency, perShare, shares, grossAmount, netAmount, exDate, note
snapshots  → id, user_id, date, twd_value, usd_value, twd_cost, usd_cost, usd_rate（unique: user_id+date）
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
| T1 | Supabase 建專案 + 資料表 | ✅ 完成 | Project URL 與資料表已建立 |
| T2 | GitHub repo + Pages 設定 | ✅ 完成 | Pages 上線，Supabase URL Configuration 已更新 |
| T3 | App 加入登入功能 | ✅ 完成 | index.html 建立，OTP 驗證碼登入，session 預設一週，資料層暫時還是 localStorage |
| T4 | 資料層換成 Supabase | ✅ 完成 | localStorage → Supabase，localStorage 降級為快取，離線同步，詳見 docs/T4-summary.md |
| T5 | 台股股價自動抓取 | ✅ 完成 | TWSE + CBC，Cloudflare Worker proxy，詳見 docs/T5-summary.md |
| T6 | 美股股價自動抓取 | ✅ 完成 | Yahoo Finance v8，共用 Cloudflare Worker；含 ⚠ 失敗指示器、欄位合併、UUID onclick 修正，詳見 docs/T6-summary.md |
| T7 | 資料移轉 + 正式切換 | ✅ 完成 | v3 封存至 archive/，README 改寫為 v4，詳見 docs/T7-summary.md |
| T8 | 績效歷史快照 + 折線圖 | ✅ 完成 | snapshots 資料表，每次更新行情自動記錄，Chart.js 折線圖 Tab，詳見 docs/T8-summary.md |

**Cloudflare Worker**：`https://raspy-cherry-f806.calvin99-tw.workers.dev`（已部署，代理 TWSE / CBC / TAIFEX / Yahoo Finance）
- 原始碼：`infra/worker.js`（版控於此 repo）
- **Origin 白名單**：只允許 `https://calvin99tw.github.io` 與 `localhost`，其他 origin 回 403
- CBC 路由加了 `Accept: application/json`，避免 CBC 偶發回傳 XML 導致解析失敗

---

## 未來開發方向

| 優先度 | 功能 | 說明 |
|--------|------|------|
| 中 | 池間資金轉移 | 從台股池轉到美股池（含匯率），有歷史紀錄 |
| 中 | 池總額變動歷史 | 記錄何時注資/提領 |
| 中 | 目標配置與偏離警示 | 設定每個標的的目標佔比 |
| 低 | 備注欄位 | 每筆買入可加投資理由 |
| 低 | 稅後報酬計算 | 區分股息與資本利得稅率 |

---

## 開發規範

- 字型：`DM Mono`（monospace）+ `Syne`（標題）
- 主題：Dark / Light / System 三段切換，顏色透過 CSS variables 定義
- 顏色語意（亞洲市場慣例）：紅色 = 漲/獲利，綠色 = 跌/虧損，紫色 = 強調
- 每次開發完成後：`git add . && git commit -m "..." && git push`

---

## 資安規範

- **Cloudflare Worker**：新增路由時，`ALLOWED_ORIGINS` 不需更動；若 upstream API 會依 Accept header 回不同格式，記得在 fetch headers 明確指定
- **CDN 腳本**：`index.html` 中的 CDN script tag 須固定版本號並附 `integrity`（sha384）+ `crossorigin="anonymous"`；升版時要重新計算 hash
- **Supabase Anon Key**：publishable key，設計上可公開；安全依賴 RLS，每張資料表都需有 `user_id` 欄位 + policy
- **CSV 備份**：`.gitignore` 已設 `*.csv`，個人財務資料不進 repo

---

## 重要檔案

- `index.html` — 正式版本（v4）
- `infra/worker.js` — Cloudflare Worker 原始碼
- `archive/投資組合管理.html` — v3.3.1 封存版，僅供參考
- `README.md` — 使用者文件（功能說明、計算公式、CSV 格式）
- `CLAUDE.md` — 本檔，Claude 開發指引
