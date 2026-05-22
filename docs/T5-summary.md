# T5 工作摘要：台股收盤價 + 匯率自動抓取

**狀態**：✅ 完成  
**影響檔案**：`index.html`、Cloudflare Worker（`raspy-cherry-f806`）

---

## 完成項目

### 台股收盤價
- 主要來源：`www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?date=YYYYMMDD&response=json`（當日盤後，收盤後更新）
- 備援來源：`openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`（前一交易日）
- 一次 call 取得全市場資料，filter 出持股中 `currency==='TWD'` 的 ticker 更新 `currentPrice`
- 批次寫回 Supabase `buys` 資料表

### USD/TWD 匯率
- 主要來源：`cpx.cbc.gov.tw/api/OpenData/FTDOpenData_Day`（中央銀行，每日更新，有當日資料）
- 備援來源：fawazahmed0 currency-api（第三方，幾乎即時）
- 欄位：`data[data.length-1]["NTD_USD"]`（JSON 陣列，最後一筆為最新）

### Cloudflare Worker（CORS Proxy）
- URL：`https://raspy-cherry-f806.calvin99-tw.workers.dev`
- 路由規則：
  - `/taifex/` → `openapi.taifex.com.tw`
  - `/cbc/` → `cpx.cbc.gov.tw`
  - `/rwd/` → `www.twse.com.tw`
  - 其他 → `openapi.twse.com.tw`
- 改為 passthrough（`res.text()`），不做 JSON parse，加 try/catch 確保永遠回傳 CORS header

### UI
- Header 新增行情狀態（`行情已更新 · MM/DD 收盤 · HH:MM`）
- ↻ 按鈕改為有邊框的 `<button>`，點擊區域更大
- Settings 移除舊的「抓取匯率」按鈕，說明文字改為 CBC 來源
- 已收股息在持倉表格改用 pnlClass（紅色），與資金池卡片一致
- 交易紀錄與股息摘要從 summary-card grid 改為 pool-stat group 風格
- 公式說明文字更新：「年化報酬需持有滿 365 天後才顯示」

---

## 踩坑記錄

### 1. TWSE openapi 只有前一日收盤價
**現象**：抓到的股價是前一天的，不是今天收盤後的資料。  
**原因**：`openapi.twse.com.tw` 更新較慢，通常是前一交易日資料。  
**解法**：改用 `www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?date=YYYYMMDD` 作為主要來源，openapi 降為備援。

### 2. TWSE FMTQIK 不是匯率
**現象**：T5 規格指定 FMTQIK 為匯率來源，實際上是加權指數成交量資料。  
**解法**：改用 fawazahmed0，後來再升級為 CBC 中央銀行。

### 3. TAIFEX 匯率 T+1 延遲
**現象**：TAIFEX `DailyForeignExchangeRates` 最新一筆是前一交易日，不是當日。  
**原因**：TAIFEX 的匯率資料在下一個交易日才發布。  
**解法**：改用 CBC 中央銀行 API，當日收盤後即有資料。

### 4. CBC API 格式判斷錯誤（XML vs JSON）
**現象**：用 `DOMParser` 解析 XML 失敗。  
**原因**：Cloudflare Worker 回傳的是 JSON（Worker 做了 content-type 轉換），不是原始 XML。  
**解法**：改用 `res.json()`，取 `data[data.length-1]["NTD_USD"]`。

### 5. TWSE_PROXY 變數 scope 問題
**現象**：`ReferenceError: TWSE_PROXY is not defined`（匯率段落）。  
**原因**：`TWSE_PROXY` 定義在第一個 `try { }` 區塊內部，第二個 `try` 無法存取。  
**解法**：將 `TWSE_PROXY` 移到 `fetchMarketData()` 函式頂層。

### 6. Cloudflare Worker 未加 try/catch
**現象**：Worker 報 CORS error（`No 'Access-Control-Allow-Origin' header`）。  
**原因**：Worker 內部拋出例外時，Cloudflare 回傳預設 500 頁面，沒有我們設定的 CORS header。  
**解法**：整個 Worker 邏輯包在 try/catch，catch 也要回傳含 CORS header 的 Response。

---

## API 來源整理

| 資料 | 來源 | 說明 |
|------|------|------|
| 台股收盤價（主）| `www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL` | 當日盤後，15:00 後更新 |
| 台股收盤價（備）| `openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL` | 前一交易日 |
| USD/TWD 匯率（主）| `cpx.cbc.gov.tw/api/OpenData/FTDOpenData_Day` | 中央銀行，當日更新 |
| USD/TWD 匯率（備）| fawazahmed0 currency-api | 第三方，即時 |

---

## 給下一個 Task 的注意事項

- **T6（美股自動抓價）**：可共用同一個 Cloudflare Worker proxy，加新的路由前綴即可
- **Worker 修改**：每次加新的代理來源，都要記得加 try/catch，且確保 catch 也回傳 CORS header
- **變數 scope**：在 `fetchMarketData()` 內有多個 try 區塊，共用的常數（如 proxy URL）要放在函式最頂層
