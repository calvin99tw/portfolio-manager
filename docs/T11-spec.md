# T11 規格：台股股價改用 Yahoo Finance（修正收盤價失效）

**版本**：v4.1.2
**狀態**：📋 待實作
**影響範圍**：`index.html`（僅 `fetchMarketData()` 台股區塊 + 來源說明文字）；Worker 不需改動

---

## 一、背景與問題根因

### 現象
台股收盤後抓不到「當日」收盤價，畫面顯示的是前一交易日的價格，且**沒有任何錯誤提示**（⚠ 不亮）。非今天才發生，是更早就靜默失效。

### 根因（已實測確認，2026-06-29）
T5 當初把主來源改為 `www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?date=YYYYMMDD&response=json`，因為那時它**帶 date 參數會回 JSON**。TWSE 後來改了行為：

- **帶 `date=` 參數時，該端點現在回傳 CSV**（`Content-Type: text/csv`），`response=json` 被忽略。
- 程式用 `res.json()` 解析 CSV 會 throw，被 `index.html:1465` 那段空的 `catch(e){}` 吞掉，`priceMap` 留空。
- 於是每次都掉進 OpenAPI fallback（`/v1/exchangeReport/STOCK_DAY_ALL`），而 OpenAPI **只有前一交易日**收盤價。
- `⚠` 不亮，因為 fallback「成功」了 → 使用者只看到日期偏舊的價格，毫無提示。

### 為何改用 Yahoo
實測同一時間（06/29 21:00，官方 rwd 端點與 TWSE 官方 MCP 都還只有 06/26 資料）：

```
Yahoo 2330.TW → price: 2370.0（今日 06/29）, previous_close: 2340.0（06/26）
```

Yahoo **當下就有今日價格**，官方端點還沒有。且 Yahoo 回 JSON、結構與美股完全相同，可與美股共用同一套抓取邏輯，最一致、最少維護。

### 調查過程與實測證據（2026-06-29 21:00，台股交易日，已確認不在休市表）

| # | 端點 / 來源 | 請求 | 回傳 | 判讀 |
|---|------------|------|------|------|
| 1 | rwd（主，現用） | `STOCK_DAY_ALL?date=20260629&response=json` | **空白**（無 body、無 content-type） | 今日資料抓不到 |
| 2 | rwd（主，現用） | `STOCK_DAY_ALL?date=20260626&response=json` | **CSV**（`text/csv`，`response=json` 被忽略） | **關鍵**：帶 date 時格式已從 JSON 變 CSV → `res.json()` throw |
| 3 | rwd | `STOCK_DAY_ALL?response=json`（不帶 date） | JSON（`stat:OK`） | 不帶 date 才回 JSON，但這版不支援指定日期 |
| 4 | OpenAPI（備援） | `/v1/exchangeReport/STOCK_DAY_ALL` | JSON，`Date:1150626`（06/26） | 只有前一交易日，落後一天 |
| 5 | TWSE 官方 MCP | 2330 日成交 | 收盤價 2340，日期 1150626 | 官方來源 21:00 仍只有 06/26 |
| 6 | **Yahoo** | `2330.TW` | `price:2370`（06/29）, `previous_close:2340`（06/26） | **唯一**當下就有今日價格者 |

結論：主路徑因 #2 的格式變動 throw → 被 `index.html:1465` 空 `catch(e){}` 吞掉 → 永遠落到 #4 的延遲資料；`⚠` 因 fallback「成功」而不亮，形成靜默延遲。Yahoo（#6）為唯一兼具「即時 + JSON + 與美股一致」的來源。

> 註：直接從沙箱／本機打 Worker 會被其 Origin 白名單擋下（回 403/空白），屬預期行為；上述 Yahoo 驗證透過已連線的 Yahoo Finance MCP 取得。

---

## 二、設計目標

1. 台股改走 Yahoo Finance v8（`${TWSE_PROXY}/yahoo/v8/finance/chart/<ticker>`），與美股同一條路徑。
2. 支援**盤中取價**：與美股一樣，盤中回最新成交價、盤後回收盤價。
3. 上市／上櫃代號自動處理：先試 `.TW`，無結果再試 `.TWO`（fallback）。
4. 修掉吞錯誤的設計：抓取失敗的標的要進 `newFailed`、亮 ⚠，不再靜默。
5. **移除** TWSE `rwd` 主端點與 OpenAPI fallback 的台股抓取邏輯（已壞且會造成靜默延遲）。

### 已確認的前提
- 目前持股只有**上市股與 ETF**，`.TW` 即可命中；`.TWO` fallback 僅為保險。
- Worker 的 `/yahoo/*` 路由（`infra/worker.js:40–42`）是通用 proxy 到 `query1.finance.yahoo.com`，**不限美股，不需修改**。

### Caveat（需在來源說明文字反映）
Yahoo 的台股**盤中**報價通常延遲約 15–20 分鐘（非真即時）；**收盤價**準確。對組合估值影響不大。

---

## 三、實作細節

### 3.1 取代台股區塊（`index.html:1445–1500`）

把整段「台股收盤價（rwd + OpenAPI）」邏輯換成 Yahoo 並行查詢，結構比照現有美股區塊（`1502–1535`）：

```js
// ── 1. 台股股價（Yahoo Finance v8，.TW → .TWO fallback，並行）──
try {
  const twdTickers = [...new Set(buys.filter(b => b.currency === "TWD").map(b => b.ticker))];
  if (twdTickers.length === 0) {
    stockSuccess = true;
  } else {
    const uid = currentUser?.id;
    const results = await Promise.all(twdTickers.map(async ticker => {
      // 先試 .TW，無有效價格再試 .TWO
      for (const suffix of [".TW", ".TWO"]) {
        try {
          const res = await fetch(`${TWSE_PROXY}/yahoo/v8/finance/chart/${ticker}${suffix}?interval=1d&range=1d`);
          if (!res.ok) continue;
          const data = await res.json();
          const meta = data?.chart?.result?.[0]?.meta;
          const price = meta?.regularMarketPrice;
          if (typeof price !== "number" || price <= 0) continue;
          return { ticker, price, time: meta.regularMarketTime, state: meta.marketState };
        } catch (e) { /* 試下一個 suffix */ }
      }
      return null;
    }));

    let anySuccess = false;
    twdTickers.forEach((ticker, i) => { if (!results[i]) newFailed.add(ticker); });
    for (const r of results) {
      if (!r) continue;
      buys.forEach(b => { if (b.ticker === r.ticker && b.currency === "TWD") b.currentPrice = r.price; });
      if (uid) {
        try {
          await sb.from('buys').update({ currentPrice: r.price }).eq('ticker', r.ticker).eq('user_id', uid);
        } catch (e) { console.warn(`buys 更新現價失敗 (${r.ticker}):`, e); }
      }
      // 收盤日期 / 盤中狀態：取第一筆成功的代表值
      if (!stockDate && r.time) {
        const d = new Date(r.time * 1000);
        stockDate = `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
        twMarketState = r.state;  // 供狀態列判斷盤中／收盤
      }
      anySuccess = true;
    }
    if (anySuccess) stockSuccess = true;
  }
} catch (e) {
  console.warn("台股股價抓取失敗：", e);
}
```

> 註：欄位路徑 `data.chart.result[0].meta.regularMarketPrice` 與現有美股區塊完全一致，僅多取 `regularMarketTime`（epoch 秒）與 `marketState`。

### 3.2 盤中／收盤狀態列（`index.html:1581`）

在 `fetchMarketData()` 開頭宣告 `let twMarketState = "";`（與 `stockDate` 並列）。

狀態列文字依 `twMarketState` 區分：

```js
const phase = (twMarketState === "REGULAR") ? "盤中" : "收盤";
const dateLabel = stockDate ? `${phase} ${stockDate} · ` : "";
```

- `marketState === "REGULAR"` → 顯示「盤中 MM/DD」
- 其他（`PRE` / `POST` / `POSTPOST` / `CLOSED`）→ 顯示「收盤 MM/DD」

### 3.3 移除項目
- 刪除 `rwd/zh/afterTrading/STOCK_DAY_ALL` 與 `/v1/exchangeReport/STOCK_DAY_ALL` 的台股抓取程式碼。
- 台股不再保留「前一交易日」fallback：Yahoo 失敗即進 `newFailed` 亮 ⚠，由使用者手動補價（與美股行為一致）。

### 3.4 不變動
- 美股區塊（`1502–1535`）：維持原樣。
- 匯率區塊（CBC + fawazahmed0，`1537–1568`）：維持原樣。
- Worker：不動。

---

## 四、來源說明文字更新

| 檔案 | 行號 | 原文 | 改為 |
|------|------|------|------|
| `index.html` | 525 | 股價來源：TWSE OpenAPI（台股收盤價，每日 15:00 後更新） | 股價來源：Yahoo Finance（台股 + 美股，盤中約延遲 15–20 分，收盤價準確） |
| `README.md` | 59 | 台股收盤價：自動抓取 TWSE（每日 15:00 後更新） | 台股／美股股價：自動抓取 Yahoo Finance（盤中延遲約 15–20 分，收盤價準確） |
| `CLAUDE.md` | 架構表「股價」列 | TWSE OpenAPI（台股）+ Yahoo Finance v8（美股） | Yahoo Finance v8（台股 `.TW`/`.TWO` + 美股） |
| `CLAUDE.md` | 任務清單 | — | 新增 T11 列，標記 ✅ 完成 |

---

## 五、驗證

1. **盤後**（收盤後）：手動「更新行情」，確認台股顯示**今日**收盤價，狀態列顯示「收盤 MM/DD」為今日日期。
2. **盤中**（09:00–13:30）：手動更新，確認台股價格隨盤更新、狀態列顯示「盤中 MM/DD」。
3. **ETF**（如 0050、00878）：確認 `.TW` 命中、有價格。
4. **失敗情境**：暫時把某 ticker 改成不存在的代號，確認該列亮 ⚠ 且 toast 列出無法更新的標的（不再靜默）。
5. 確認 Supabase `buys.currentPrice` 有寫入、snapshot 有記錄。

---

## 六、注意事項

- Worker 的 Origin 白名單只允許 `https://calvin99tw.github.io` 與 `localhost`；測試請在正式 Pages 網址或本機 localhost 進行，直接打 Worker 會 403。
- `.TW`（上市）→ `.TWO`（上櫃）順序不可顛倒；目前持股全為上市，`.TWO` 幾乎不會觸發，但保留以防未來加入上櫃標的。
- 完成後依慣例 `git add . && git commit && git push`，並補寫 `docs/T11-summary.md`。
