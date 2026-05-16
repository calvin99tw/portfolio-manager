# 投資組合管理工具 — Claude 開發指引

這份文件讓 Claude 在沒有歷史對話的情況下，也能完整理解專案背景與目前進度。

---

## 專案概述

個人投資組合管理工具，同時管理台股（TWD）與美股（USD）。
目前版本：`投資組合管理.html`（v3.3.1，純 HTML + localStorage，持續可用）
開發中版本：`index.html`（v4，Supabase + GitHub Pages）

---

## v4 架構決策

| 層級 | v3 | v4 |
|------|----|----|
| 儲存 | localStorage + CSV | Supabase（PostgreSQL） |
| 托管 | 本機 file:// | GitHub Pages（HTTPS） |
| 股價 | 手動輸入 | TWSE OpenAPI（台股）+ Yahoo Finance（美股） |
| 登入 | 無 | Supabase Email Magic Link |

**平行開發原則**：`投資組合管理.html` 完全不動，`index.html` 為 v4 新檔，T7 完成後才正式取代。

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
| T3 | App 加入登入功能 | ⏳ 待執行 | 建立 index.html，Magic Link 登入流程，資料層暫時還是 localStorage |
| T4 | 資料層換成 Supabase | ⏳ 待執行 | localStorage → Supabase，需要 anon key |
| T5 | 台股股價自動抓取 | ⏳ 待執行 | TWSE OpenAPI，需實測 CORS |
| T6 | 美股股價自動抓取 | ⏳ 待執行 | Yahoo Finance，需實測 CORS |
| T7 | 資料移轉 + 正式切換 | ⏳ 待執行 | CSV 匯入 Supabase，取代現有版本 |

**備案**：若 T5/T6 CORS 不通，加 Cloudflare Workers proxy（免費方案每日 10 萬次請求）

---

## 開發規範

- 字型：`DM Mono`（monospace）+ `Syne`（標題）
- 主題：Dark / Light / System 三段切換，顏色透過 CSS variables 定義
- 顏色語意（亞洲市場慣例）：紅色 = 漲/獲利，綠色 = 跌/虧損，紫色 = 強調
- 每次開發完成後：`git add . && git commit -m "..." && git push`

---

## 重要檔案

- `投資組合管理.html` — 目前正式版本（v3.3.1），不可修改
- `index.html` — v4 開發中版本
- `README.md` — 使用者文件（功能說明、計算公式、CSV 格式）
- `CLAUDE.md` — 本檔，Claude 開發指引
