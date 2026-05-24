# T7 規格：正式切換 v4

**狀態**：📋 規格確認，待實作  
**影響範圍**：檔案搬移、`README.md` 改寫、`CLAUDE.md` 更新

---

## 背景

資料移轉在 T4 完成後即已執行（v3 CSV 匯入 Supabase，此後持續在 v4 維護）。  
T7 的工作是完成「正式切換」的收尾動作：封存 v3、更新文件。

---

## A. 檔案搬移

建立 `archive/` 資料夾，將以下檔案移入：

| 檔案 | 說明 |
|------|------|
| `投資組合管理.html` | v3.3.1 正式版，純 HTML + localStorage |
| `portfolio.csv` | v3 的主資料檔（localStorage 架構的 DB） |
| `portfolio-backup-2026-05-24.csv` | v3 備份匯出 |

移完後根目錄應只剩：`index.html`、`README.md`、`CLAUDE.md`、`docs/`、`archive/`。

---

## B. README.md 改寫

### 定位說明

**README.md 是使用者文件**，放在 GitHub 公開 repo 上，面向任何看到這個專案的人。  
內容應聚焦在「這個工具是什麼、怎麼用、功能有哪些、公式怎麼算」，不應包含技術實作細節。

**CLAUDE.md 是開發者/Claude 指引**，架構決策、Supabase 設定、任務清單、踩坑記錄索引等技術內容全部留在 CLAUDE.md。

因此改寫原則：
- 移除所有技術實作細節（Supabase schema、Worker URL、localStorage 機制等）
- 移除未來開發待辦清單（移至 CLAUDE.md）
- 移除版本歷史（開發者才需要，考慮移至 CLAUDE.md 或直接刪除）
- 保留計算公式（使用者理解工具運作有幫助）
- 保留功能說明、設定項目、已知限制

整份 README 目前描述的是 v3（localStorage + CSV），需改寫為 v4。

### 新 README 結構

```
# 投資組合管理工具

## 專案概述          ← 改為 v4：Supabase + GitHub Pages
## 存取方式          ← 新增：URL + Magic Link 登入說明
## 核心設計理念      ← 保留（雙資金池、原幣別呈現、主題與顏色語意）
## 功能清單          ← 更新（加入自動抓價、績效歷史折線圖）
## 計算公式          ← 完整保留，內容不變
## 設定項目          ← 保留，內容大致不變
## 資料儲存機制      ← 改寫為 Supabase 架構（移除 CSV/localStorage 說明）
## 已知限制          ← 更新（移除已解決的限制，保留仍存在的）
```

### 各區塊改寫重點

**專案概述**：描述改為「Supabase 雲端儲存 + GitHub Pages 托管，登入即可跨裝置使用」。

**存取方式**（新增區塊）：
- URL：`https://calvin99tw.github.io/portfolio-manager/`
- 登入：輸入 Email → 收 Magic Link → 點擊連結 → 自動登入，session 預設一週

**功能清單**：在現有功能基礎上補充：
- 台股股價自動抓取（TWSE，收盤後更新）
- 美股股價自動抓取（Yahoo Finance）
- 匯率自動更新（CBC 中央銀行）
- 績效歷史折線圖（📈 績效 Tab，1M / 3M / 6M / YTD / 1Y / ALL）

**資料儲存機制**：改寫為：
- 主資料儲存於 Supabase（PostgreSQL），登入後即時同步
- localStorage 為快取層（加速頁面載入、支援短暫離線）
- CSV 匯出仍可用作本機備份（Settings → 本地備份）
- 離線時頂部顯示警告，復線後自動同步

**已知限制**：移除已解決的項目，保留仍存在的：
- 盤中股價不會自動輪詢（手動點 ↻ 更新）
- 池間轉移與池總額變動歷史暫不記錄

---

## C. CLAUDE.md 更新

### 版本描述

```markdown
# 改前
目前版本：`投資組合管理.html`（v3.3.1，純 HTML + localStorage，持續可用）
開發中版本：`index.html`（v4，Supabase + GitHub Pages）

# 改後
正式版本：`index.html`（v4，Supabase + GitHub Pages）
封存版本：`archive/投資組合管理.html`（v3.3.1，純 HTML + localStorage）
```

### 移除「平行開發原則」段落

整段移除：
> 平行開發原則：`投資組合管理.html` 完全不動，`index.html` 為 v4 新檔，T7 完成後才正式取代。

### 新增「未來開發方向」區塊

從 README 移過來，放在「開發任務清單」之後：

```markdown
## 未來開發方向

| 優先度 | 功能 | 說明 |
|--------|------|------|
| 中 | 池間資金轉移 | 從台股池轉到美股池（含匯率），有歷史紀錄 |
| 中 | 池總額變動歷史 | 記錄何時注資/提領 |
| 中 | 目標配置與偏離警示 | 設定每個標的的目標佔比 |
| 低 | 備注欄位 | 每筆買入可加投資理由 |
| 低 | 稅後報酬計算 | 區分股息與資本利得稅率 |
```

### T7 狀態更新

```markdown
| T7 | 資料移轉 + 正式切換 | ✅ 完成 | v3 封存至 archive/，README 改寫為 v4，詳見 docs/T7-summary.md |
```

### 重要檔案區塊更新

```markdown
# 改前
- `投資組合管理.html` — 目前正式版本（v3.3.1），不可修改

# 改後
- `archive/投資組合管理.html` — v3.3.1 封存版，僅供參考
```

---

## 完成條件

- [ ] `archive/` 資料夾建立，三個檔案移入
- [ ] `README.md` 改寫完成，內容描述 v4
- [ ] `CLAUDE.md` 版本描述、平行開發原則、未來開發方向、T7 狀態全部更新
- [ ] `git add . && git commit -m "T7: 正式切換 v4，封存 v3" && git push`
