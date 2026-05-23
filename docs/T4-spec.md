# T4 實作規格：資料層換成 Supabase

繼續 T4，把 `index.html` 的資料層從 localStorage 換成 Supabase。

---

## 儲存策略

### 移除以下 localStorage 相關機制

- `loadFromStorage()`
- `saveToStorage()`
- `_saveEnabled`、`_dirty`、`markDirty()`、`markClean()`、`enableSave()`
- `updateSaveButtonState()`
- `render()` 末端呼叫的 `saveToStorage()`
- `beforeunload` 警告 listener
- 所有 CRUD 函式裡的 `enableSave()` 呼叫

### 保留 localStorage 作為快取

- 每次 Supabase 寫入成功後，把完整資料同步寫一份到 localStorage（key: `"portfolio-manager-data-v3.1"`）
- App 啟動時先從 localStorage 快速顯示資料，再背景同步 Supabase

### 閾值設定不進 Supabase

`hotThreshold` / `oversoldThreshold` 只存 localStorage，不寫入任何 Supabase 資料表。

---

## 啟動流程（`initPortfolioApp()` 改為 async）

1. 從 localStorage 讀快取 → 如果有，立刻填入資料並 `render()`（畫面瞬間出現）
2. 從 localStorage 讀 `hotThreshold` / `oversoldThreshold` 並填入欄位
3. 呼叫 `loadFromSupabase()`：
   - `SELECT * FROM buys WHERE user_id = auth.uid()`
   - `SELECT * FROM sells WHERE user_id = auth.uid()`
   - `SELECT * FROM dividends WHERE user_id = auth.uid()`
   - `SELECT * FROM pools WHERE user_id = auth.uid() LIMIT 1`
4. 用 Supabase 資料覆蓋記憶體中的 `buys` / `sells` / `dividends` / settings
5. 更新 localStorage 快取
6. `render()`

---

## 各 CRUD 操作改為 Supabase

每次操作完後都要更新 localStorage 快取。

### buys 表

| 操作 | 函式 | Supabase |
|------|------|----------|
| 新增買入 | `saveBuy`（新增路徑） | `INSERT INTO buys` |
| 編輯批次 | `saveBuy`（編輯路徑） | `UPDATE buys SET ... WHERE id = ? AND user_id = auth.uid()` |
| 更新現價 | `confirmUpdatePrice` | `UPDATE buys SET currentPrice = ? WHERE ticker = ? AND user_id = auth.uid()` |
| 刪除批次 | `toolbarDelete`（batch） | `DELETE FROM buys WHERE id = ? AND user_id = auth.uid()` |
| 刪除整個標的 | `toolbarDelete`（group） | `DELETE FROM buys WHERE ticker = ? AND user_id = auth.uid()` |

### sells 表

| 操作 | 函式 | Supabase |
|------|------|----------|
| 新增賣出 | `confirmSell`（新增路徑） | `INSERT INTO sells`；同時 UPDATE 或 DELETE 對應的 buys 列 |
| 編輯賣出 | `confirmSell`（編輯路徑） | `UPDATE sells SET ... WHERE id = ? AND user_id = auth.uid()` |
| 刪除賣出 | `deleteSell` | `DELETE FROM sells WHERE id = ? AND user_id = auth.uid()` |

### dividends 表

| 操作 | 函式 | Supabase |
|------|------|----------|
| 新增股息 | `confirmDividend`（新增路徑） | `INSERT INTO dividends` |
| 編輯股息 | `confirmDividend`（編輯路徑） | `UPDATE dividends SET ... WHERE id = ? AND user_id = auth.uid()` |
| 刪除股息 | `deleteDividend` | `DELETE FROM dividends WHERE id = ? AND user_id = auth.uid()` |

### pools 表（settings 變動時）

- `onSettingChange()` 觸發時 → `UPSERT INTO pools (user_id, poolTWD, poolUSD, usdRate)`，`ON CONFLICT (user_id) DO UPDATE`（每個 user 只有一列）
- `fetchRate()` 成功後也要觸發同樣的 upsert

### 重設 / 清空

- `resetToSample()`：DELETE 三張表所有 user 資料 → INSERT 範例資料 → upsert pools
- `clearAllData()`：DELETE 三張表所有 user 資料 → DELETE pools

### CSV 匯入

讀完 CSV 後，整批 `upsert`（`onConflict: 'id'`）到 Supabase，再 upsert pools。

---

## ID 管理

維持現有做法：`Date.now()` 產生數字 ID。Supabase `id` 欄位為 bigint，可直接使用。

---

## 離線偵測與同步

### 離線 banner

加在 `<div id="app">` 內最上方：

```html
<div id="offlineBanner" style="display:none; background:var(--warn-bg); border-bottom:1px solid var(--warn-border); padding:8px 32px; font-size:12px; color:var(--warn)">
  ⚠ 目前離線，資料暫存本機。請勿同時在其他裝置編輯，以免復線時資料被覆蓋。
</div>
```

### 離線 / 復線事件

```javascript
window.addEventListener('offline', () => {
  document.getElementById('offlineBanner').style.display = 'block';
});

window.addEventListener('online', async () => {
  document.getElementById('offlineBanner').style.display = 'none';
  await syncLocalToSupabase(); // 把 localStorage 現狀整批 upsert 回 Supabase
  showToast('已自動同步至雲端 ✓');
});
```

### 切換回頁面時重新同步

```javascript
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && navigator.onLine) {
    await loadFromSupabase(); // 靜默拉最新資料
    render();
  }
});
```

---

## 錯誤處理原則

- 每個 Supabase 操作加 try/catch
- 失敗時：`showToast('儲存失敗，請確認網路連線', true)`
- 資料留在記憶體中（不回滾），下次復線會自動同步
- 不因 Supabase 失敗阻止 UI 更新

---

## UI 文字更新

| 位置 | 原文 | 改為 |
|------|------|------|
| Header `storageStatus` | 已儲存於本機 | 離線時：「離線 · 資料暫存本機」／上線時：「已同步 · HH:MM」 |
| Login 頁底部說明 | 資料儲存於本機 · v4 開發中 · 資料層 localStorage | 無密碼登入 · 資料儲存於雲端 |
| Settings「資料管理」說明 | localStorage 相關說明 | 資料儲存於 Supabase 雲端，登入即可跨裝置存取。CSV 匯出可作為本機備份。 |

---

## 完成後執行

```bash
git add . && git commit -m "T4: replace localStorage with Supabase data layer" && git push
```
