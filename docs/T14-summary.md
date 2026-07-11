# T14 工作摘要：看板 origin 分類徽章 + catalysts dateConfidence

**狀態**：✅ 完成
**影響檔案**：`index.html`（純顯示層，不動 Worker/Supabase）
**上游契約**：`../股票分析/dashboard_json_契約_v1.md`（第 85、103 行新增兩欄位）
**規劃**：無獨立 Tx-spec，經 plan mode 定案（呈現決策已與使用者確認）

---

## 背景

Cowork 在契約 v1 新增兩個欄位並補齊現行 `dashboard.json`（已擴至 15 檔，較 T12 多
DRAM/CRWD/3017）：

1. **`origin`**（`pipeline` / `user`）：標的「如何被納入追蹤」——策略篩選管線系統化選出（🔬）
   vs 使用者手動帶入（👤）。持有標的沿用入列時 origin（血緣，供歸因）。
2. **`catalysts[].dateConfidence`**（`confirmed` / `estimated`）：催化劑日期為官方查證得日
   或歷史推估。

## 完成項目（`dashCardHTML` / `renderDashboardTab`）

- **origin 徽章**：`orMap = {pipeline:"🔬 篩選", user:"👤 自選"}`，於標題列 status 徽章後渲染；
  中性 `.dash-badge`（不用紅/綠/琥珀——附錄 A 琥珀為唯一注意色）；`origin` 缺失則不渲染。
- **觀察區分兩組**：`watching` 依 origin 切成「🔬 策略篩選」「👤 手動自選」兩子區塊，
  各用縮排子標題 + `.dash-grid`；子組為空不出標題。持有區「💼 持有標的」不變。
- **dateConfidence 分色**：催化劑列的**日期字串** confirmed 正常色、estimated（或缺失）
  淡色（var(--text-4)）；當日到期整列 t-warn 高亮優先級最高，維持不變。event 文字與
  bias 圖示不動（estimated 的「日期約值」已在 event 字串內）。

## 驗證

- 離線單元測試（現行 15 檔 dashboard.json）全通過：3017 🔬 篩選、6531 等 👤 自選、
  持有檔亦帶 origin 徽章、2308 estimated 日期淡色、DRAM 缺欄位容錯不報錯、XSS 跳脫。
- 分組計數：持有 8、🔬 篩選 1（3017）、👤 自選 6（6531/INTC/ON/SPCX/DRAM/CRWD）。
- 線上實測待部署後匯入 15 檔 JSON 確認。

## 需回報 Cowork（非阻擋）

- `DRAM` 的 catalyst 缺 `dateConfidence` 欄位，App 已容錯當 estimated（淡色）；來源仍應補正。

## 設計決策

- **不動 Worker**：推播行為不變，estimated 催化劑仍照常於估計日推播，event 已帶約值標記
  （附錄 B），與進行中的雙軌驗證解耦。
- **origin 用中性徽章不用顏色**：色彩語意受附錄 A 嚴格約束（紅綠專用損益、琥珀唯一注意色），
  emoji + 文字已足夠區辨來源。
