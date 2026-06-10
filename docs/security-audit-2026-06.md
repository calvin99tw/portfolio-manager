# 安全測試報告（2026-06）

**範圍**：整個 app 用到的所有服務 — 本身 code repo、前端、Cloudflare Worker、Supabase、外部相依 CDN。
**方法**：靜態檢查 + 對線上服務的實際黑箱測試（公開 anon key 打 REST API、偽造 Origin、注入測試）。

---

## 一、實測通過的防線（無須改善）

| 項目 | 測試方式 | 結果 |
|------|---------|------|
| Supabase RLS 讀取 | 用公開 anon key 直打 REST API 讀 6 張表（buys/sells/dividends/pools/snapshots/pool_flows） | ✅ 全部回 `[]`，讀不到他人資料 |
| Supabase RLS 寫入 | 匿名 INSERT pool_flows | ✅ 被拒：`42501 new row violates row-level security policy` |
| Supabase 帳號註冊 | 匿名 `/auth/v1/signup` | ✅ `signup_disabled`，攻擊者無法自行建帳號 |
| Supabase OTP 速率 | Dashboard 設定檢查 | ✅ Email 2 封/h，token verification 30 次/5min |
| Worker Origin 白名單 | 偽造 `Origin: https://evil.com` | ✅ 403 |
| Worker 合法來源 | `Origin: https://calvin99tw.github.io` | ✅ 200 |
| CDN SRI | 抓線上版 HTML 檢查 script tag | ✅ supabase-js 2.106.1、chart.js 4.5.1 皆有 sha384 + 版本釘定 |
| Git 歷史 | 全歷史掃 CSV / secret / key / pem | ✅ 財務資料從未進版控（`.gitignore` 設 `*.csv`） |
| HTTPS | GitHub Pages response header | ✅ 有 HSTS（`strict-transport-security`） |

---

## 二、發現並修復的問題

### #1（中）登出未清除 localStorage 財務快取 — 已修
- **問題**：`signOut()` 只呼叫 `sb.auth.signOut()`，但 `STORAGE_KEY`（含完整持倉、損益、資金流水）留在 localStorage。共用電腦上登出後，下一個使用者開 DevTools 即可看到全部財務資料。
- **修法**：`signOut()` 加 `localStorage.removeItem(STORAGE_KEY)`。
- **位置**：[index.html](../index.html) `signOut()`。

### #2（中）自由文字欄位未跳脫即進 innerHTML（XSS） — 已修
- **問題**：`name`/`ticker`/`note` 等欄位直接以 `${...}` 插入 innerHTML，全檔無跳脫函式。雖然 RLS 擋住外部寫入，但「載入備份」功能可匯入被動過手腳的 CSV（例如 name 欄藏 `<img src=x onerror=...>`），觸發 XSS。Supabase session token 存於 localStorage，XSS 一旦觸發可被竊取、完整接管帳號。
- **修法**：新增兩個 helper：
  - `esc(s)` — 跳脫 `& < > " '`，用於所有進 innerHTML 的自由文字。
  - `escJs(s)` — 跳脫 JS 字面值（`\ ' " <`），用於插入 `onclick` 等 inline JS 的字串（再過一層 `esc`）。
  - 共 12 處渲染點包上 `esc()`：持倉表 name/ticker、股息表 name/ticker/note、賣出歷史 name/ticker、資金明細 note、配置 bar/legend 的 name、alerts 的 name、以及 group/batch row 的 `onclick` ticker。
- **驗證**：在 preview 注入惡意 `name`/`ticker`/`note` 後呼叫 `render()`，`window.__pwned` 始終為 `false`；惡意字串以純文字呈現（`&lt;img...`）；正常標的（台積電/2330）渲染與點選功能不受影響；惡意 ticker 經 onclick 往返後值仍等於原始字串且不執行注入碼。
- **位置**：[index.html](../index.html) `esc`/`escJs` 定義處及各渲染函式。

---

## 三、已知殘留風險（暫不處理，記錄備查）

### #3（低）Worker Origin 驗證擋不住非瀏覽器客戶端
Origin header 由瀏覽器強制，但 `curl -H "Origin: ..."` 可偽造。白名單能擋「他站透過使用者瀏覽器盜用」，擋不住有心人直接寫腳本耗 Workers 免費額度（10 萬次/天）。
**未來改法**：Cloudflare 免費方案含 1 條 rate limiting 規則，可對 worker 網域設每 IP 限速。被濫用時再處理。

### #4（低）無 Content-Security-Policy
GitHub Pages 無法自訂 response header，只能用 `<meta http-equiv>`。但本 app 是單一大型 inline script 架構，meta CSP 要嘛放行 `unsafe-inline`（保護有限），要嘛用 script hash（每次改版要重算），CP 值低。主要價值會在 `connect-src` 白名單（限制 XSS 觸發後資料外送目的地）。架構若未來模組化再評估。

---

## 四、給後續開發的提醒

- **任何新的 innerHTML 渲染點**：只要插入使用者可控的自由文字（name/ticker/note/未來的備註欄），一律包 `esc()`；若插入 `onclick` 等 inline JS，先 `escJs()` 再 `esc()`。
- **新資料表**：務必 `user_id` + RLS policy + GRANT（見 CLAUDE.md 資安規範），否則公開 anon key 可直接讀寫。
- **session token 存於 localStorage**：因此 XSS = 帳號接管，跳脫不可省。
