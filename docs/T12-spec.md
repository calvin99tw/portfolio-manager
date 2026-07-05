# T12 規格：看板 Tab（dashboard.json 契約 v1 實作）

**版本**：v4.2.0
**狀態**：📋 實作中
**影響範圍**：`index.html`、Supabase（新表 `dashboard`）
**上游契約**：`../股票分析/dashboard_json_契約_v1.md`（v1.0，含附錄 C 交付管道決議）

---

## 一、背景

Claude（決策層）每次日更/建檔後產出 `dashboard.json`（慢層語意：關鍵價、論點、催化劑）；
App（掃描層＋呈現層）讀取後用自有 Yahoo 價格計算快層數值（距離 %、貼線、跨線、催化劑到期）。
本任務實作契約遷移路徑階段②（看板頁）；階段③（PWA 推播）為後續任務。

### 與 Cowork 的決議（2026-07-05）

| 項目 | 決議 |
|------|------|
| 交付管道 | Supabase 新表（RLS）+ 設定頁「匯入看板 JSON」；純掃描日 JSON 不變動，實際匯入頻率約每週數次，手動可承受 |
| 距離 % | `(levelPrice − eodPrice) / eodPrice × 100`，above 線為正、below 線為負；貼線 = \|x\| ≤ nearLinePct |
| 盤中語意 | 距離 % 用最新價即時算；「跨線」依框架僅認收盤價，盤中越線顯示弱化文案「盤中越線，待收盤確認」 |
| 量能條件 | 第一階段只判張數/股數門檻（`max`/`min`），RVOL 留二階段；無量能數據時標「量能條件待人工確認」 |
| 資料 | 直接用正式 `dashboard.json`（W28 全 12 檔）開發，schema 與 sample 一致 |

---

## 二、Supabase：新表 `dashboard`

單列覆蓋式（每 user 一列，重複匯入即覆蓋）：

```sql
create table public.dashboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  imported_at timestamptz not null default now()
);

alter table public.dashboard enable row level security;

create policy "dashboard_select" on public.dashboard for select using (auth.uid() = user_id);
create policy "dashboard_insert" on public.dashboard for insert with check (auth.uid() = user_id);
create policy "dashboard_update" on public.dashboard for update using (auth.uid() = user_id);
create policy "dashboard_delete" on public.dashboard for delete using (auth.uid() = user_id);

-- 2026/10/30 起必要（資安規範）
grant select, insert, update, delete on table public.dashboard to anon, authenticated;
```

---

## 三、設定頁：匯入看板 JSON

- 位置：設定 Tab「本地備份」區塊附近，新增「看板資料」小節
- `<input type="file" accept=".json">` → 讀檔 → `JSON.parse` → 驗證：
  - `schemaVersion` 以 `"1."` 開頭（向後相容 minor 版本）
  - `tickers` 為非空陣列
  - 驗證失敗 toast 錯誤、不寫入
- 通過 → `upsert` 至 Supabase `dashboard`（onConflict: user_id）+ 寫入 localStorage 快取
- 顯示目前已匯入的 `generatedAt` / `sourceReport` / 標的數，讓使用者知道資料新鮮度

## 四、看板 Tab

- Tab 名稱：`📋 看板`，位置：持倉中之後、交易歷史之前
- `switchTab('dashboard')` 時呼叫 `renderDashboardTab()`
- 資料流：`loadFromSupabase()` 一併載入 dashboard payload → 模組變數 `dashboardData`

### 4.1 取價

- 每檔用 `yahooSymbol` 直接查（`${TWSE_PROXY}/yahoo/v8/finance/chart/<yahooSymbol>?interval=1d&range=1d`），
  **不依賴 buys**（涵蓋 watch 未持有標的）；與 `fetchMarketData()` 分離，切到看板 Tab 時才抓、5 分鐘內不重抓
- 取 `regularMarketPrice`（現價）、`regularMarketTime`（時間）、`regularMarketVolume`（量能判定用）、
  `chartPreviousClose`（跨線比對的前收）
- 抓不到價：卡片照常顯示，距離欄標「價格待更新 ⚠」（如 SPCX 類冷門標的），不擋其他卡片

### 4.2 快層計算（契約第 3 節，已修訂版）

```
distancePct = (levelPrice − price) / price × 100
貼線   = |distancePct| ≤ nearLinePct（預設讀 JSON alertRule，App 不做覆寫 UI）
跨線   = 價格依 direction 越過 levelPrice：
         below → price < levelPrice；above → price > levelPrice
         盤中（台股 09:00–13:30 / 美股依 regularMarketTime 判斷是否當日盤中）＝弱化文案
催化劑 = catalysts.date == 今日 → 卡片頂部高亮「今日 [event]」
```

- 量能判定：`volumeCondition.type=dry` → 當日量 ≤ max；`surge` → 當日量 ≥ min。
  台股 `unit=lot` 需將 Yahoo 股數 ÷1000。無法取得量 → 標「量能條件待人工確認」

### 4.3 卡片呈現（契約附錄 A 必遵）

- 紅＝漲/獲利、綠＝跌/虧損，**專用於損益/距離數字**；琥珀為唯一注意色（貼線、trim_alert）；stop 高反差實心
- status 五態：圖示＋文字（➕加碼 / ⏸持有 / 👁觀望 / ⚠️減碼警戒 / 🛑停損）——不得用紅綠當狀態色
- 卡片結構：
  - 標題列：`代碼＋名稱`（並列必顯）、holdingType 標記（🏛 core / 🌱 future / 🔁 dca / 👁 watch）、status
  - 現價列：現價、漲跌（vs chartPreviousClose）
  - `conclusion` / `why` / `waitingFor` 三行文字
  - levels 列表：kind 標籤、price、距離 %（貼線琥珀高亮、跨線標記）、note、量能狀態
  - `thesisFalsification`：future/core 顯示於卡片，「論點證偽優先於價格停損」語氣
  - catalysts：日期＋event＋bias 圖示（🔼🔻⚖️），今日到期高亮
  - footer：`維持 N 日`（unchangedDays）或 `上次變化 lastChanged`
- 排序：持有（core/future/dca 且 status≠watch 的持有位）在上、watch 在下；
  watch 標的停損欄「—（未持有）」
- **XSS**：`name`/`conclusion`/`why`/`waitingFor`/`note`/`event`/`thesisFalsification[]`/`sourceReport`
  等全部自由文字進 innerHTML 前一律 `esc()`

### 4.4 空狀態

未匯入 dashboard.json 時：顯示 empty-state「尚未匯入看板資料，請至 設定 → 看板資料 匯入 dashboard.json」

---

## 五、不做（後續階段）

- PWA manifest + Service Worker + Web Push（契約階段③，另開任務）
- RVOL 判定（需歷史均量，二階段）
- nearLinePct 的 App 端覆寫 UI（先固定讀 JSON 值）

---

## 六、驗證

1. Supabase SQL 執行後，設定頁匯入正式 dashboard.json（12 檔）成功，顯示 generatedAt/標的數
2. 看板 Tab：12 檔卡片按持有/觀察排序，代碼＋名稱並列
3. 距離 %：抽 2330 手驗 `(2600−現價)/現價`（above 正）與 `(2264−現價)/現價`（below 負）
4. 009819 若仍貼線 → 琥珀高亮；催化劑日期為今日者高亮
5. SPCX 等抓不到價 → 「價格待更新 ⚠」，其餘卡片正常
6. watch 標的（6531/INTC/ON/SPCX）停損欄顯示「—（未持有）」
7. 換裝置登入（或清 localStorage）→ dashboard 從 Supabase 載回
8. 重新匯入更新過的 JSON → 覆蓋舊資料

---

*T12 spec｜2026-07-05*
