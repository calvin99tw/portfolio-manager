# T5 實作規格：台股收盤價 + 匯率自動抓取

繼續 T5，在 `index.html` 加入台股收盤價與 USD/TWD 匯率的自動抓取功能。

---

## Scope

| 項目 | 說明 |
|------|------|
| 台股收盤價 | 自動抓取所有持股中 `currency === 'TWD'` 的 ticker，更新 `buys.currentPrice` |
| USD/TWD 匯率 | 來源從 `fawazahmed0/currency-api` 改為 TWSE，更新 `pools.usdRate` |
| 觸發方式 | 自動（頁面載入、切回頁面）＋手動（Header 按鈕） |
| 資料表變更 | 無，沿用現有 `buys.currentPrice` 與 `pools.usdRate` |

---

## API 來源

### 台股收盤價

```
GET https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL
```

- 一次 call 拿回全部上市股票當日資料，無需逐 ticker 查詢
- 回傳為 JSON 陣列，每筆物件含股票代號與收盤價（欄位名稱需實測確認）
- 僅於收盤後更新（約 15:00 後），盤中抓到的是前一日收盤價
- 只處理 `buys` 中 `currency === 'TWD'` 的 ticker，其餘略過

### USD/TWD 匯率

```
GET https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK   ← 需實測確認路徑與格式
```

- 與台股股價同網域，共用同一套 CORS 解法
- 取 USD/TWD 匯率，精度保留 4 位小數（與現行一致）

> **注意**：上述兩個 endpoint 的確切欄位名稱與資料格式，需在實作時查閱
> `https://openapi.twse.com.tw` 文件並實測確認後才能寫死。

---

## CORS 策略（兩分支，實作時擇一）

### Branch A：直接呼叫（優先嘗試）

```javascript
fetch("https://openapi.twse.com.tw/v1/...")
```

若瀏覽器不報 CORS 錯誤即採用此方案。

### Branch B：Cloudflare Worker Proxy（CORS 不通時）

部署一個 Cloudflare Worker，作為 TWSE API 的轉發代理。

**Worker 程式碼（約 10 行）：**

```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const twseUrl = "https://openapi.twse.com.tw" + url.pathname + url.search;
    const res = await fetch(twseUrl);
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
};
```

**部署後：**
- 將程式碼中的 base URL 從 `https://openapi.twse.com.tw` 換成
  `https://twse-proxy.{name}.workers.dev`
- Cloudflare Workers 免費方案：100,000 requests/天，足夠使用

---

## 新增函式：`fetchMarketData()`

替換現有 `fetchRate()` 的角色，統一處理台股價格與匯率。

```
async function fetchMarketData(manual = false)
  1. 呼叫 STOCK_DAY_ALL，取回全部上市股票資料
  2. 呼叫 TWSE FX endpoint，取回 USD/TWD 匯率
  3. Filter 出 buys 中 currency==='TWD' 的 ticker，比對並更新 currentPrice
  4. 更新記憶體中的 usdRate
  5. 更新 DOM：document.getElementById("usdRate").value = rate.toFixed(4)
  6. 批次 UPDATE buys（一次 Supabase call，所有 TWD ticker）
  7. UPSERT pools（同 onSettingChange 路徑）
  8. updateLocalCache()
  9. render()
  10. 更新 Header 狀態為「行情已更新 · HH:MM」
  11. if(manual) showToast("行情已更新")
```

**錯誤處理原則：**
- 任何步驟失敗 → 靜默處理，保留記憶體中現有資料，不中斷流程
- `manual === true` 時才顯示失敗 toast
- Header 狀態顯示上次成功更新時間（失敗不更新時間）

---

## 觸發時機

| 時機 | 呼叫方式 |
|------|----------|
| App 啟動（Supabase 載入完成後） | `await fetchMarketData()` |
| 切回頁面（`visibilitychange`） | 追加 `fetchMarketData()` 至現有 handler |
| Header 手動按鈕 | `fetchMarketData(true)`（顯示 toast） |

---

## UI 調整

### Header 狀態列

在現有「已同步 · HH:MM」旁加入行情狀態：

```
已同步 · 14:32   行情已更新 · 15:01 ↻
```

- 「↻」為可點擊的重新整理符號，觸發 `fetchMarketData(true)`
- 抓取中顯示「行情更新中…」
- 失敗時保留上次成功時間，不變動

### Settings 匯率區塊

- **移除** 🔄 抓取按鈕（`btn-fetch-rate`）及其 `onclick`
- **移除** `rateUpdated` 的狀態文字（改由 Header 統一顯示）
- 匯率說明文字改為：`匯率資料來源：TWSE（自動更新）`
- **清除** `fetchRate()` 函式中遺留的 `enableSave()` 呼叫（T4 bug）

### 個別 ticker「更新現價」Modal

保留不動，作為手動覆蓋用途。

---

## Supabase 寫入

### 批次更新台股現價

```javascript
const twdTickers = [...new Set(buys.filter(b => b.currency==='TWD').map(b => b.ticker))];
// 對每個 ticker 執行：
await supabase
  .from('buys')
  .update({ currentPrice: newPrice })
  .eq('ticker', ticker)
  .eq('user_id', user.id);
```

> 若持股 TWD ticker 數量少（< 10），逐 ticker UPDATE 即可，不需要複雜的批次語法。

### 匯率 UPSERT

沿用 T4 的 `onSettingChange` 路徑：

```javascript
await supabase.from('pools').upsert(
  { user_id: user.id, poolTWD, poolUSD, usdRate },
  { onConflict: 'user_id' }
);
```

---

## 清理項目

| 項目 | 動作 |
|------|------|
| `fetchRate()` 函式 | 整個移除，邏輯併入 `fetchMarketData()` |
| `btn-fetch-rate` 按鈕 | 從 HTML 移除 |
| `rateUpdated` 元素 | 從 HTML 移除 |
| `fetchRate()` 內的 `enableSave()` | 隨函式一起移除 |
| 匯率來源說明文字 | 改為 TWSE |

---

## 實作順序

1. **確認 TWSE API 格式**：查閱 `https://openapi.twse.com.tw` 文件，確認 `STOCK_DAY_ALL` 與 FX endpoint 的路徑與回傳欄位名稱，`console.log` 實際回傳結果後再寫解析邏輯
2. **CORS 測試**：在瀏覽器 console 執行 `fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL")` — 成功則採 Branch A，報 CORS 錯誤則直接部署 Cloudflare Worker（Branch B），不需要兩條路都試
3. **實作 `fetchMarketData()`**：依上方流程步驟實作，股價與匯率一起處理
4. **UI 調整**：Header 狀態列 + 移除 Settings 的抓取按鈕
5. **清理舊程式碼**：移除 `fetchRate()`、`btn-fetch-rate`、`rateUpdated`
6. **測試**：確認股價、匯率正確寫回 Supabase，Header 狀態正常顯示
7. **Push**：`git add . && git commit -m "T5: ..." && git push`

---

## 開發注意事項（來自 T4 踩坑記錄）

- **camelCase 統一**：本次不新增欄位，但任何新增變數命名沿用 camelCase
- **CORS 測試優先**：實作第一步先測試 Branch A 是否可行，再決定是否部署 Worker
- **TWSE endpoint 格式**：`STOCK_DAY_ALL` 與 FX endpoint 的回傳欄位名稱需查文件並 console.log 確認後才能寫死解析邏輯

---

## 完成後執行

```bash
git add . && git commit -m "T5: auto-fetch TWD stock prices and USD/TWD rate from TWSE" && git push
```
