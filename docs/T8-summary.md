# T8 工作摘要：績效歷史快照 + 折線圖

**狀態**：✅ 完成  
**影響檔案**：`index.html`、Supabase（新增 `snapshots` 資料表）

---

## 完成項目

### Supabase `snapshots` 資料表
```sql
create table snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  twd_value numeric,   -- 台股市值
  usd_value numeric,   -- 美股市值（USD）
  twd_cost  numeric,   -- 台股投入成本
  usd_cost  numeric,   -- 美股投入成本（USD）
  usd_rate  numeric,   -- 當日匯率
  unique(user_id, date)
);
alter table snapshots enable row level security;
create policy "snapshots: own rows" on snapshots
  for all using (auth.uid() = user_id);
```

### 快照機制
- `saveSnapshot()`：在 `fetchMarketData()` 成功後自動呼叫
- 使用 upsert（`onConflict: 'user_id,date'`）→ 同一天多次更新，最後一筆覆蓋前面
- 設計原則：收盤後最後一次更新行情的數字最有意義，故選最後一筆
- 本地 `snapshots[]` 陣列同步更新，不需重新從 Supabase 載入
- App 初始化時 `loadSnapshots()` 讀取歷史資料

### 績效 Tab UI
- 新增「📈 績效」Tab（在股息歷史與設定之間）
- 圖表：Chart.js 折線圖（CDN 引入），高度 300px
  - 紫色實線：總市值走勢（TWD 計價，USD 部分依當日匯率換算）
  - 虛線：投入成本基準線
- 時間篩選：1M / 3M / 6M / YTD / 1Y / ALL
- 區間統計（篩選期間的首筆 vs 末筆）：區間報酬率、區間損益金額、最新市值
- 尚無資料 / 所選期間無資料：顯示說明文字
- 只有 1 筆資料：顯示單點 + 底部提示「再次更新行情後即可顯示走勢」

### 主題整合
- 顏色來源：`getComputedStyle(document.body)` 讀取 CSS variables，確保與 dark/light 主題一致
- 切換主題時，若績效 Tab 為 active，自動重新渲染圖表
- 避免錯誤：theme 設在 `document.body`，判斷用 `document.body.getAttribute("data-theme")`，**不是** `documentElement`

---

## 踩坑記錄

### 1. 主題偵測用錯節點
**現象**：淺色模式下圖表顯示深色配色（tooltip 背景深色、線條顏色不對）。  
**原因**：`document.documentElement.getAttribute("data-theme")` 永遠回傳 `null`（theme 是設在 `body` 不是 `html`），所以 `isDark` 恆為 `true`。  
**解法**：改用 `document.body.getAttribute("data-theme") !== "light"`。

### 2. Chart.js 顏色硬編碼
**現象**：即使修正 `isDark`，顏色仍可能與主題 CSS 不完全一致。  
**解法**：改用 `getComputedStyle(document.body).getPropertyValue('--accent')` 等方式直接讀取 CSS variable 的實際值，完全跟隨主題。

---

## 設計決策

| 決策 | 選擇 | 原因 |
|------|------|------|
| 快照時機 | fetchMarketData 成功後 | 零額外操作，每次更新行情順便記錄 |
| 同天多筆 | upsert 最後一筆 | 收盤後最後一次更新最準確 |
| 計價幣別 | 統一 TWD | USD 部分依當日快照匯率換算，方便比較 |
| 圖表庫 | Chart.js v4（CDN） | 輕量、API 簡單、適合單頁 App |
| Tab 位置 | 獨立 Tab | 保持持倉頁面乾淨，不干擾主要操作 |

---

## 給下一個 Task 的注意事項

- **快照從今天開始累積**，無法回補過去資料，這是設計上的取捨
- **Chart.js 主題**：顏色務必從 `getComputedStyle` 讀取，不要硬編碼 hex
- **`data-theme` 位置**：在 `<body>` 不在 `<html>`，所有主題相關判斷需用 `document.body`
- **T7（資料移轉）**：仍待執行，完成後 v4 正式取代 v3
