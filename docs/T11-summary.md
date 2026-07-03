# T11 工作摘要：台股股價改用 Yahoo Finance

**狀態**：✅ 完成
**影響檔案**：`index.html`、`README.md`、`CLAUDE.md`、`docs/T11-spec.md`、`docs/T11-summary.md`

---

## 問題根因

T5 用的 TWSE `rwd` 端點（`STOCK_DAY_ALL?date=YYYYMMDD&response=json`）行為被官方改掉：**帶 `date` 參數現在回 CSV 而非 JSON**，`res.json()` throw 後被一段空的 `catch(e){}` 吞掉 → `priceMap` 留空 → 永遠掉進只有「前一交易日」的 OpenAPI fallback。因 fallback「成功」，⚠ 不亮，使用者長期看到舊一天的價格卻無任何提示（靜默延遲）。

實測（2026-06-29 21:00）：官方 rwd / OpenAPI / TWSE MCP 當下都只有 06/26 資料，唯有 Yahoo `2330.TW` 已有當日 06/29 價格。

---

## 完成項目

### A. 台股抓取改走 Yahoo（`index.html`）
- 整段「rwd + OpenAPI」台股邏輯換成 Yahoo Finance v8 並行查詢，結構比照美股區塊
- 路徑：`${TWSE_PROXY}/yahoo/v8/finance/chart/<ticker><suffix>?interval=1d&range=1d`
- `.TW`（上市）試不到有效價格再 fallback `.TWO`（上櫃）
- 欄位路徑與美股一致：`data.chart.result[0].meta.regularMarketPrice`，另取 `regularMarketTime`、`marketState`

### B. 盤中／收盤盤別（~~已移除~~，見「後續調整」）
- ~~新增 `let twMarketState = "";`，取第一筆成功標的的 `meta.marketState`~~
- ~~狀態列：`marketState === "REGULAR"` → 「盤中 MM/DD」，其餘 → 「收盤 MM/DD」~~
- 上線後隔日發現 `meta.marketState` 欄位實際不存在，功能移除，詳見文末

### C. 移除吞錯誤的設計
- 刪除 `rwd/zh/afterTrading/STOCK_DAY_ALL`、`/v1/exchangeReport/STOCK_DAY_ALL` 台股邏輯
- 刪除空 `catch(e){}` 與 `priceMap`
- 台股不再保留「前一交易日」fallback：抓失敗即進 `newFailed` 亮 ⚠（與美股一致，不再靜默）

### D. 來源說明文字
- `index.html` 設定頁、`README.md`、`CLAUDE.md` 架構表股價列全部更新為 Yahoo

### E. 抓價失敗指示器樣式修正（驗證時順手）
- 失敗列現價顏色：`t-accent`（紫，語意=選取/主要操作）→ 新增 `t-warn`（`var(--warn)` 琥珀色，與離線橫幅一致）
- 紫色回歸僅供「選取列 / 主要操作」用途，不再誤用於錯誤狀態
- ⚠ 字級 12px → 18px + `vertical-align:middle`，使其與同列粗體現價數字視覺齊平（⚠ glyph 內距大、天生偏小，需放大才平衡）

---

## 設計決策

- **與美股共用同一條路徑**：Yahoo 回 JSON、結構與美股完全相同，最一致、最少維護；Worker `/yahoo/*` 為通用 proxy，不需改動。
- **`.TW → .TWO` 序列查詢**：對不存在或上櫃標的會多打一次 request，目前持股全上市，成本可忽略；Yahoo 免費、併發數小，不觸發限制。
- **盤中延遲約 15–20 分**：本工具非即時交易，盤中僅用於試算當下損益，僅在來源說明文字反映，UI 不另作警告。

---

## 踩坑記錄

- **空 `catch(e){}` 是靜默失效兇手**：上游 API 改格式時，吞錯誤的 fallback 會讓問題完全無感。改寫後台股失敗一律亮 ⚠。
- **`priceMap` 為台股區塊內部變數**：移除前已確認無外部引用，整段替換不留死碼。

---

## 驗證（線上實測通過，2026-06-29 盤後）

- [x] 盤後更新：台積電 2330 由舊價 2,340（06/26）→ 今日 2,370；狀態列「收盤 06/29」為今日
- [x] 盤中更新：價格隨盤更新（07/02 09:14 實測 2330 取得盤中價 2,415）
- [x] ETF `.TW` 命中有價格（009819 中信數據及電力 10.15）
- [x] 失敗情境：不存在代號（test 99999）→ 該列亮 ⚠（驗證後已刪除測試資料）
- [x] Supabase `buys.currentPrice` 有寫入、snapshot 有記錄

---

## 後續調整（2026-07-02）：盤中/收盤標籤移除

盤中時段實測時發現狀態列永遠顯示「收盤」。追查後確認：**Yahoo v8 chart API
（`interval=1d&range=1d`）根本不回傳 `meta.marketState` 欄位——台股、美股皆然**。
T11 的盤別判斷是建立在一個不存在的欄位上，`twMarketState` 永遠為空字串，
必然 fallback 到「收盤」分支。

一度改用台北當地時間判斷交易時段（平日 09:00–13:30），但隨即與使用者確認後
決定**整個移除盤別標籤**，理由：

1. `regularMarketPrice` 本來就是「最近成交價」——盤中 refresh 拿盤中價、盤後拿
   收盤價、假日拿上個交易日收盤價。**標的現價正確即足夠**，盤別是冗餘資訊。
2. 標籤只反映台股時段，與美股無關；台美兩市場同畫面時（一個盤中一個收盤）
   標籤語意模糊，反而誤導。

最終狀態列顯示「行情 MM/DD · 抓取於 HH:MM」。

### 踩坑補充
- **不要信任未經實測的 API 欄位**：`marketState` 是 Yahoo 其他端點（quote API）
  才有的欄位，chart API 沒有。spec 撰寫時參考的欄位清單與實際回應不符，
  且 `r.state || ""` 的寬容寫法讓 undefined 靜默變空字串，掩蓋了欄位不存在的
  事實。若當初寫成嚴格檢查（欄位不存在即報錯），上線當天就會發現。
