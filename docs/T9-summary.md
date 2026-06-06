# T9 工作摘要：v4.1 資金池重構

**狀態**：✅ 完成  
**影響檔案**：`index.html`、`CLAUDE.md`、`README.md`、`docs/T9-spec.md`、`docs/T9-summary.md`

---

## 完成項目

### A. Supabase 變更
- 新增 `pool_flows` 資料表（user_id, currency, type 入金/出金, amount, date, note）
- RLS policy + GRANT 已執行
- `snapshots` 資料表新增 `twd_net_deposit`、`usd_net_deposit` 兩欄

### B. Migration（一次性自動執行）
- App 初始化時檢查 pool_flows 是否為空
- 若空，從舊 `pools.poolTWD / poolUSD` 值自動建立初始入金記錄
- 日期取對應幣別最早的買入日，note 標記「初始資金（v4.1 移轉）」

### C. 核心公式重構
- `calcNetDeposit(currency)` = Σ入金 - Σ出金
- `poolStats()` 重寫：`total` 改用 `calcNetDeposit`，新增 `totalAssets`、`cumulativeReturn`、`flowCount`
- 佔池比分母改為 `calcNetDeposit(currency)`（不再讀 input DOM）
- `saveSnapshot()` 新增寫入 `twd_net_deposit`、`usd_net_deposit`

### D. Pool Card UI 四區塊重構
- **Block①** Header：標題左、總資產（持股市值 + 可用餘額）右
- **Block②** Alloc Bar：以市值為比例（非成本），分母為總資產，末段為灰色可用餘額
- **Block③** 資金現況 3 欄：投入本金（X 筆）/ 持股市值（已投入成本）/ 可用餘額
- **Block④** 報酬 grid：未實現損益 / 已實現損益 / 已收股息 → 累計報酬（全寬，含百分比）
- 合併檢視同邏輯，TWD 換算

### E. 入金/出金 Modal
- 按鈕位於 holdings tab 左上（資金操作語意）
- 分池/合併切換移至右側（檢視設定語意）
- Modal：入金/出金 toggle、幣別、金額、日期、備注
- 確認後即時更新 pool card，disable 按鈕防重複送出

### F. 用語全站替換
- 池總額 → 投入本金
- 閒置現金 → 可用餘額
- 真實總報酬 → 累計報酬
- 設定頁公式說明更新

### G. 版本號
- v4.0.0 → v4.1.0

---

## Bug 修正（同期）
- 交易歷史「實領金額」補上（賣出價欄位第二行）
- 賣出/配息/更新現價按鈕加 disabled 防重複送出

---

## 踩坑記錄

- **`calcNetDeposit` 在 `groups()` 中被呼叫**：`groups()` 計算佔池比時需要 `calcNetDeposit`，確保 `poolFlows` 陣列在 `loadFromSupabase` 完成前已初始化為 `[]`（module-level var），不會出現 undefined。
- **migration 時機**：需在 pools 資料載入後才能讀 poolTWD/poolUSD；`loadFromSupabase` 中 Promise.all 包含 pool_flows 查詢，migration 在 all settled 之後執行。
- **`syncLocalToSupabase`、`clearAllData`、`resetToSample`** 三個函式原本不含 pool_flows，T9 完成後補上。

---

## 驗證結果

- `可用餘額` = 移轉前的 `閒置現金`（數字一致）
- `投入本金` 顯示「1 筆」（初始移轉記錄）
- 入金/出金後 pool card 即時更新
- Alloc bar 各段加總 = 總資產 = 100%
