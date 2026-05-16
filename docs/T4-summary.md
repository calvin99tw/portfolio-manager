# T4 工作摘要：資料層換成 Supabase

**狀態**：✅ 完成  
**影響檔案**：`index.html`

---

## 完成項目

### 架構

- 啟動時先從 localStorage 快取瞬間顯示資料，背景再向 Supabase 同步（避免白畫面）
- 所有 CRUD（買入 / 賣出 / 股息 / 資金池）改為寫入 Supabase，成功後更新 localStorage 快取
- `hotThreshold` / `oversoldThreshold` 閾值只存 localStorage，不進 Supabase

### 離線支援

- 離線時頂部顯示警告 banner
- 復線後自動將本機資料同步至 Supabase
- 切換回頁面時靜默拉最新資料

### UI 文字更新

| 位置 | 改前 | 改後 |
|------|------|------|
| Header 狀態列 | 已儲存於本機 | 已同步 · HH:MM（離線時：離線 · 資料暫存本機） |
| 登入頁底部說明 | 資料儲存於本機 · v4 開發中 | 無密碼登入 · 資料儲存於雲端 |
| Settings 資料管理說明 | localStorage 相關說明 | 資料儲存於 Supabase 雲端，登入即可跨裝置存取。CSV 匯出可作為本機備份。 |
| 工具列按鈕 | 開啟資料 / 儲存資料 | 載入備份 / 本地備份 |
| 本地備份檔名 | portfolio.csv | portfolio-backup-YYYY-MM-DD.csv |

### 其他

- 資金配置 bar chart 依佔比由大到小排列（左→右遞減）

---

## 開發過程踩到的坑（供設計下一個 Task 參考）

### 1. Supabase 資料表未開啟 RLS + 缺少 user_id 欄位
**現象**：所有寫入操作失敗，console 無明確錯誤。  
**原因**：資料表透過 Supabase UI 建立時，預設不加 `user_id` 欄位，也不開啟 Row Level Security。  
**解法**：手動執行 SQL — `ADD COLUMN user_id uuid REFERENCES auth.users(id)`、`ENABLE ROW LEVEL SECURITY`、`CREATE POLICY`。  
**設計建議**：未來新增資料表的規格中，應明確列出 `user_id` 欄位與 RLS policy SQL，不要留給開發自行補。

### 2. DB 欄位命名慣例（snake_case vs camelCase）
**現象**：PGRST204 錯誤，Supabase 找不到欄位（如 `buyDate`、`costPerShare`）。  
**原因**：Supabase UI 建立欄位預設存 snake_case（`buy_date`），但規格與 JS 程式碼都用 camelCase。  
**解法**：執行大量 `ALTER TABLE RENAME COLUMN`，將 DB 欄位全部改為 camelCase。  
**設計建議**：規格文件要明確指定欄位命名慣例，並與 DB schema 一致。本專案統一用 **camelCase**。

### 3. ID 型別：UUID vs 數字
**現象**：新增資料 400 錯誤。  
**原因**：規格說 `id` 欄位用 bigint（沿用 `Date.now()`），但實際建表用了 UUID 型別。  
**解法**：程式碼全部換成 `crypto.randomUUID()`。  
**設計建議**：ID 型別需要在規格中明確指定（bigint 或 uuid），且 DB schema 與程式碼要一致。

### 4. CSV 匯入的 ID 相容性
**現象**：V3 CSV 有整數 ID，匯入 V4 時 Supabase 拒絕（型別不符）。  
**原因**：V3 用 `Date.now()` 數字，V4 DB 是 UUID 欄位。  
**解法**：匯入時對所有記錄重新指派 `crypto.randomUUID()`，再 insert 至 Supabase。  
**設計建議**：跨版本資料遷移規格需考慮 ID 型別轉換，不能假設舊資料可直接 upsert。

### 5. Refresh 後資料消失（快取時序問題）
**現象**：CSV 載入後什麼都不做，直接 refresh，資料消失。  
**原因（一）**：`saveToLocalCache()` 放在 Supabase 寫入完成後才呼叫，若 refresh 發生在 Supabase 回應前，快取是空的。  
**原因（二）**：`loadFromSupabase()` 拿到空陣列時無條件覆蓋記憶體，把快取讀進來的資料清掉。  
**解法**：改為「先存快取→再 async 寫 Supabase」，且 `loadFromSupabase()` 在 Supabase 回傳空、本機有快取時不覆蓋。  
**設計建議**：涉及「本機快取 + 雲端同步」的流程，規格需明確定義各情境的優先順序（Supabase 空 + 快取有 → 保留快取）。

### 6. pools upsert 失敗
**現象**：資金池設定無法儲存。  
**原因**：`onConflict: 'user_id'` 的 upsert 需要欄位有 UNIQUE constraint，建表時沒加。  
**解法**：SQL 補上 `ALTER TABLE pools ADD CONSTRAINT pools_user_id_key UNIQUE (user_id)`。  
**設計建議**：規格中標注「每 user 只有一列」的資料表，要同時說明需要 UNIQUE constraint。

---

## 給下一個 Task 的注意事項

- **T5（台股自動抓價）**：TWSE OpenAPI 有 CORS 限制，可能需要 Cloudflare Workers proxy，規格中應預留備案分支。
- **T6（美股自動抓價）**：Yahoo Finance 同樣有 CORS 問題，建議與 T5 共用同一個 proxy 方案。
- **資料表欄位**：全部用 camelCase，任何新增欄位都要同時更新 CLAUDE.md 的 schema 區塊。
- **新資料表**：記得 `user_id uuid REFERENCES auth.users(id)` + RLS policy，這是每張表的標準配備。
