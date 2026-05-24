# T7 工作摘要：正式切換 v4

**狀態**：✅ 完成  
**影響檔案**：`archive/`（新增）、`README.md`、`CLAUDE.md`、`docs/T7-summary.md`

---

## 完成項目

### A. 檔案封存
- 建立 `archive/` 資料夾
- 移入：`投資組合管理.html`（v3.3.1）、`portfolio.csv`、`portfolio-backup-2026-05-24.csv`
- 根目錄保留：`index.html`、`README.md`、`CLAUDE.md`、`docs/`、`archive/`

### B. README.md 改寫
- 定位從「開發文件」改為「使用者文件」
- 移除所有 v3 技術細節（localStorage 架構、CSV 格式說明、版本歷史、技術說明章節）
- 移除未來開發待辦清單（移至 CLAUDE.md）
- 新增「存取方式」區塊：URL + Magic Link 登入說明
- 更新「功能清單」：加入自動抓價（台股/美股/匯率）、績效歷史折線圖
- 更新「資料儲存機制」：改寫為 Supabase 架構
- 更新「已知限制」：移除已解決項目，保留仍存在的

### C. CLAUDE.md 更新
- 版本描述：`投資組合管理.html` → `index.html` 為正式版，v3 移至 `archive/`
- 移除「平行開發原則」段落（已無需維護）
- T7 狀態更新為 ✅ 完成
- 重要檔案區塊更新
- 新增「未來開發方向」區塊（從 README 移過來）

---

## 背景說明

資料移轉在 T4 完成後即已執行（v3 CSV 匯入 Supabase），此後持續在 v4 維護。  
T7 的工作是完成「正式切換」的收尾動作：封存 v3、更新文件，讓 index.html 成為唯一的正式版本。
