# T3 工作摘要：App 加入登入功能

**狀態**：✅ 完成
**影響檔案**：`index.html`（建立，v4.0.0）

> ⚠️ 本文件為**事後回溯重建**（docs/Tx-summary.md 慣例於 T4 才建立，見 commit `14f97ef`）。
> 內容依 CLAUDE.md 既有記錄 + git 早期 commit 軌跡回推，非當時同步撰寫。

---

## 完成項目

- 建立 `index.html`（v4.0.0），導入 Supabase Auth 登入
- 登入方式演進（見 git 軌跡）：
  1. `f76c226` **Magic Link**（Email 連結登入）初版
  2. `8a07e50` 重構為 **OTP 六位數驗證碼**（免點連結、手機輸入更順）
- Session 預設效期一週
- **此階段資料層仍為 localStorage**（Supabase 換層在 T4 才完成）——登入先行、資料後遷

---

## 踩坑記錄（從 git 還原）

- **OTP 位數與 Supabase 設定不一致**：驗證碼長度一度在 6 / 8 位數間來回
  （`8aadbed` 6→8、`1daa76c` 同步 UI 文案、`e1d2a2f` 8→6 改回）。
  根因是**前端 OTP 長度必須與 Supabase Auth 專案設定的驗證碼長度一致**，否則驗證必失敗；
  最終定為 6 位數。教訓：改 OTP 長度要同時對齊 Supabase 後台設定與前端輸入框/文案。

---

## 設計基礎（沿用至今）

- **session token 存 localStorage**：因此 XSS = 帳號接管，使用者可控自由文字進 innerHTML
  一律 `esc()`（此資安規範在後續任務強化並寫入 CLAUDE.md）。
- **登出須清快取**：`signOut()` 需 `localStorage.removeItem(STORAGE_KEY)`，
  避免共用電腦殘留財務資料（後續安全稽核補強）。
