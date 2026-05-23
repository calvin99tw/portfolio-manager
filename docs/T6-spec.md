# T6 規格：美股股價自動抓取

**狀態**：📋 規格確認，待實作  
**影響範圍**：Cloudflare Worker（`raspy-cherry-f806`）、`index.html`

---

## 目標

在 `fetchMarketData()` 中加入美股現價自動抓取，共用現有 Cloudflare Worker proxy。使用者點擊 ↻ 按鈕時，台股、美股、匯率三段一次完成。

---

## A. Cloudflare Worker 修改

新增一條路由：

```
/yahoo/ → query1.finance.yahoo.com
```

規範：
- 與現有路由（`/taifex/`、`/cbc/`、`/rwd/`）格式一致
- 整段包在 try/catch，catch 也必須回傳含 CORS header 的 Response（參考 T5 踩坑 #6）

---

## B. `fetchMarketData()` 修改

### 新增執行順序（第 1.5 段）

```
1.   台股收盤價（TWSE）      ← 現有
1.5  美股收盤價（Yahoo Finance）← 新增
2.   USD/TWD 匯率（CBC）     ← 現有
3.   寫回 Supabase pools     ← 現有
4.   render + 更新狀態列     ← 現有
```

### 第 1.5 段邏輯

1. 從 `buys` 篩出 `currency === "USD"` 的 ticker，去重
2. 若無美股持倉（長度為 0），`usdStockSuccess = true` 直接跳過
3. 批次查詢端點：
   ```
   GET ${TWSE_PROXY}/yahoo/v7/finance/quote?symbols=NVDA,AAPL,...
   ```
4. 從回傳的 `quoteResponse.result[]` 取 `symbol` 和 `regularMarketPrice`
5. 依 ticker 更新 `buys` 陣列的 `currentPrice`
6. 若 `currentUser` 已登入，批次寫回 Supabase `buys` 資料表（邏輯與台股段相同）
7. 成功取得 quotes 後設 `usdStockSuccess = true`

### 新增狀態變數

```javascript
let usdStockSuccess = false;  // 與現有 stockSuccess、rateSuccess 並列
```

### 狀態列更新

success 判斷加入 `usdStockSuccess`：

```javascript
// 改前
if(stockSuccess || rateSuccess)

// 改後
if(stockSuccess || usdStockSuccess || rateSuccess)
```

日期標籤（`收盤 MM/DD`）維持只顯示台股 TWSE 的日期，不另外加美股日期。

---

## 風險與備案

**主要風險**：Yahoo Finance v7/quote 端點可能因缺少特定 headers（User-Agent、crumb cookie）而回傳 401/403 或空結果。

**處理策略**：
1. 先實作批次端點，實測是否能正常拿到資料
2. 若被擋，在 Worker 層加入 `User-Agent` header 再試
3. 若仍失敗，備案改用 `/v8/finance/chart/{ticker}` 逐一查詢（速度較慢，但相容性較好）

---

## 不在本次範圍內

- 盤中自動輪詢（維持手動 ↻ 觸發）
- 狀態列格式變更（維持現有單一狀態列）
- 美股以外的市場（港股、ETF 等）
