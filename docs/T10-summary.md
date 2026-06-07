# T10 工作摘要：資金明細 Tab

**狀態**：✅ 完成  
**影響檔案**：`index.html`、`CLAUDE.md`、`README.md`、`docs/T10-summary.md`

---

## 完成項目

### A. 新增「資金明細」Tab
- 位置：股息歷史之後、績效之前
- Tab button：`💵 資金明細`
- `switchTab()` 加入 `flows`，切換時呼叫 `renderFlowsTab()`

### B. 摘要區塊
- 台股池投入本金（入金合計 / 出金合計）
- 美股池投入本金（入金合計 / 出金合計）
- 總筆數

### C. 資料表格
- 欄位：日期、幣別、類型、金額、備注、操作
- 排序：日期降序（最新在上）
- 類型：入金 `t-pos`（紅）、出金 `t-neg`（綠）
- 金額：出金加 `−` 前綴
- 空狀態：「尚無資金紀錄」

### D. 編輯功能
- 複用現有 `flowModal`，加入 `_editingFlowId` 追蹤模式
- `openFlowEditModal(id)` 預填資料、標題改為「編輯資金紀錄」
- `confirmFlow()` 依 `_editingFlowId` 區分 INSERT vs UPDATE
- 儲存後更新 poolFlows 陣列、pool card、資金明細表格

### E. 刪除功能
- `deleteFlow(id)` 跳 confirm 確認
- Supabase DELETE + 本地陣列移除
- 刪除後 render() + renderFlowsTab()

---

## 設計決策

- **共用 flowModal**：新增與編輯共用同一個 modal DOM，以 `_editingFlowId === null` 區分模式，避免重複 HTML。
- `openFlowModal()`（新增）關閉時重置 `_editingFlowId = null`，確保下次開啟為新增模式。
