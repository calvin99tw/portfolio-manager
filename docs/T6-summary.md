# T6 工作摘要：美股股價自動抓取

**狀態**：✅ 完成  
**影響檔案**：`index.html`、Cloudflare Worker（`raspy-cherry-f806`）

---

## 完成項目

### 美股收盤價
- 端點：`Yahoo Finance v8/finance/chart/{ticker}?interval=1d&range=1d`
- 每個 ticker 獨立查詢，`Promise.all` 並行執行（持倉標的數量少，效能無問題）
- 解析欄位：`chart.result[0].meta.regularMarketPrice`
- 成功取得後寫回 Supabase `buys` 資料表（與台股邏輯相同）
- 新增 `usdStockSuccess` 狀態變數，納入 Header 狀態列判斷

### Cloudflare Worker
- 新增 `/yahoo/` 路由 → `query1.finance.yahoo.com`
- 所有 fetch 加入 `User-Agent: Mozilla/5.0` header（預防被擋）
- Worker 全部改為 passthrough（`res.text()`），統一格式

### 自動抓價失敗指示器（T6 後續清理）
- 模組層級 `let failedAutoFetch = new Set()` 追蹤抓價失敗的 ticker
- 持倉表現價欄：失敗時文字轉紫色（`t-accent`）+ ⚠ 符號（12px）
- ⚠ 可直接點擊開啟現價更新 modal（`event.stopPropagation()`，不觸發列選取）
- 手動更新現價後，自動從 `failedAutoFetch` 移除該 ticker，⚠ 消失
- 手動觸發時，toast 會列出所有無法自動更新的 ticker

### 持倉表欄位合併（14 欄 → 10 欄）
- 移除「總成本」欄，合併進「均攤成本」格的下方小字
- 移除「市值」欄，合併進「現價」格的下方小字
- 合併「已收股息 + 總報酬」為一格（上/下）
- 合併「佔池比 + 年化報酬」為一格（上/下）
- 設計原則：上行 = 單位/局部指標，下行 = 彙總/完整指標

---

## 踩坑記錄

### 1. Yahoo Finance v7/quote 需要認證
**現象**：`{"finance":{"result":null,"error":{"code":"Unauthorized",...}}}`  
**原因**：Yahoo Finance v7 批次 quote 端點已改為需要帳號認證。  
**解法**：改用 v8/finance/chart/{ticker}，逐一查詢，相容性較好。

### 2. 批次行 UUID 未加引號（SyntaxError）
**現象**：展開標的後，批次列點擊完全無反應。  
**原因**：`onclick="pickBatch(${b.id},..."` 中 `b.id` 是 UUID 字串（`550e8400-...`），沒有加引號，渲染出的 HTML 是無效 JS，點擊即 SyntaxError。  
**解法**：改為 `pickBatch('${b.id}',...)`。  
**注意**：此 bug 從 T4 換 Supabase 就存在，UUID 型 ID 插入 HTML 屬性時**一律要加引號**。

---

## API 來源整理（T5 + T6 完整版）

| 資料 | 來源 | 說明 |
|------|------|------|
| 台股收盤價（主）| `www.twse.com.tw/rwd/zh/afterTraeting/STOCK_DAY_ALL` | 當日盤後 |
| 台股收盤價（備）| `openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL` | 前一交易日 |
| 美股收盤價 | `query1.finance.yahoo.com/v8/finance/chart/{ticker}` | 逐 ticker 查詢 |
| USD/TWD 匯率（主）| `cpx.cbc.gov.tw/api/OpenData/FTDOpenData_Day` | 中央銀行，當日更新 |
| USD/TWD 匯率（備）| fawazahmed0 currency-api | 第三方備援 |

---

## 給下一個 Task 的注意事項

- **T7（資料移轉）**：CSV 匯入 Supabase，注意 ID 型別轉換（v3 整數 → v4 UUID），參考 T4-summary.md 坑 #4
- **Yahoo Finance**：v7 batch endpoint 已需認證，維持使用 v8 chart endpoint
- **Cloudflare Worker**：目前所有路由都用 `res.text()` passthrough，新增路由只需加一個 if 分支
- **HTML 中插入 UUID**：凡是將 Supabase UUID 型 ID 插入 `onclick` 等 HTML 屬性，**必須加單引號**，否則是無效 JS
