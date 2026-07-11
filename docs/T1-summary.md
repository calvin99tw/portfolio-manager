# T1 工作摘要：Supabase 建專案 + 資料表

**狀態**：✅ 完成
**影響範圍**：Supabase（雲端後端，無 repo 程式碼足跡）

> ⚠️ 本文件為**事後回溯重建**（docs/Tx-summary.md 慣例於 T4 才建立，見 commit `14f97ef`）。
> 內容依 CLAUDE.md 既有記錄與後續任務對此基礎設施的使用回推，非當時同步撰寫。

---

## 完成項目

- 建立 Supabase 專案（PostgreSQL 雲端資料庫），作為 v4 架構的主資料層
  - Project URL：`https://ewgduyrxtvwznvvmldtr.supabase.co`
  - Anon key（publishable，設計上可公開；安全依賴 RLS）由開發者於對話中提供，不寫入 repo
- 建立初始資料表：`pools`、`buys`、`sells`、`dividends`
  （後續任務陸續新增 `snapshots`(T8)、`pool_flows`(T9)、`dashboard`(T12)、`push_subscriptions`(T13)）

---

## 設計基礎（沿用至今）

- **RLS 為安全核心**：anon key 可公開，每張資料表都需有 `user_id` 欄位 + Row Level Security policy，
  確保使用者只能存取自己的資料。
- **原幣別儲存**：buys/sells/dividends 以 currency（TWD/USD）分別記錄，不做即時換算。
- 之後（2026/10/30 起）新增的資料表都須明確 `GRANT SELECT,INSERT,UPDATE,DELETE ... TO anon, authenticated`
  才能透過 PostgREST 存取——此規範在 T9 之後補入 CLAUDE.md 資安規範。

---

## 備註

此任務主要在 Supabase 主控台完成，無對應 repo 程式碼；資料表的實際使用邏輯見 T4
（資料層由 localStorage 換為 Supabase）。
