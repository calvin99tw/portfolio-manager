# T10 規格：資金明細 Tab

**版本**：v4.1.1  
**狀態**：📋 待實作  
**影響範圍**：`index.html`（純 UI，無新增 Supabase 資料表）

---

## 功能說明

新增「資金明細」Tab，列出 `pool_flows` 的所有入金／出金紀錄，支援編輯與刪除。

---

## 一、Tab 設定

**名稱**：資金明細  
**位置**：股息歷史之後、績效之前

```
持倉中 → 交易歷史 → 股息歷史 → 資金明細 → 績效 → 設定
```

HTML 中在股息歷史 tab button 之後插入：
```html
<button class="tab" onclick="switchTab('flows')">💵 資金明細</button>
```

---

## 二、Tab 內容

### 表格欄位

| 日期 | 幣別 | 類型 | 金額 | 備注 | 操作 |
|------|------|------|------|------|------|
| YYYY-MM-DD | TWD / USD | 入金 / 出金 | NT$ XXX,XXX | ... | 編輯　刪除 |

- 排序：日期**降序**（最新在上）
- 類型欄：入金用 `t-pos`（紅），出金用 `t-neg`（綠），與現有損益色彩語意一致
- 金額欄：入金顯示正數，出金顯示負數並加 `−` 前綴
- 操作欄：
  - 「編輯」用 `btn btn-action`
  - 「刪除」用 `btn btn-danger`，點擊先跳確認（與現有刪除行為一致）

### 空狀態

若 pool_flows 無資料，顯示 `empty-state`：「尚無資金紀錄」

---

## 三、編輯 Modal

點「編輯」開啟 modal，欄位預填該筆資料，結構與現有「入金／出金」modal 相同：

```
標題：編輯資金紀錄

[入金]  [出金]          ← toggle，預填該筆 type

幣別                    ← select 預填，TWD / USD
金額                    ← number input 預填
日期                    ← date input 預填
備注（選填）            ← text input 預填

[儲存]  [取消]
```

**儲存邏輯**：
- `UPDATE pool_flows SET ... WHERE id = ?`
- 儲存後重新計算該幣別的 `投入本金`、`可用餘額`，更新 pool card UI
- 關閉 modal，重新渲染資金明細表格

---

## 四、刪除邏輯

- `DELETE FROM pool_flows WHERE id = ?`
- 刪除後重新計算該幣別的 `投入本金`、`可用餘額`，更新 pool card UI
- 重新渲染資金明細表格

---

## 五、實作順序建議

1. HTML：新增 tab button + `tab-content` 區塊
2. JS：`renderFlowsTab()` 函式，讀取已載入的 `poolFlows[]` 陣列渲染表格
3. JS：編輯 modal（複用現有 modal 結構，加入 `id` 欄位追蹤編輯對象）
4. JS：刪除確認 + Supabase DELETE
5. JS：編輯／刪除後重新計算並更新 pool card

---

## 注意事項

- `poolFlows[]` 陣列在 T9 的 `loadData()` 中已載入，Tab 直接讀取即可，不需額外 API call
- 編輯 modal 與「新增入金／出金」modal 邏輯相近，建議共用同一個 modal DOM，用 `editingFlowId` 變數區分「新增」vs「編輯」模式
- 刪除最後一筆時，`投入本金` 會變為 0，`可用餘額` 計算可能出現負值，UI 應正常顯示（不需特別攔截）
