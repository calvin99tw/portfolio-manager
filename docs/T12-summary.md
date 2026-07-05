# T12 工作摘要：看板 Tab（dashboard.json 契約 v1 階段②）

**狀態**：✅ 完成
**影響檔案**：`index.html`、Supabase（新表 `dashboard`）、`docs/T12-spec.md`、`CLAUDE.md`、`README.md`
**上游契約**：`../股票分析/dashboard_json_契約_v1.md`

---

## 完成項目

### A. Supabase
- 新表 `dashboard`（user_id PK, payload jsonb, imported_at），單列覆蓋式
- RLS 四 policy + GRANT（anon, authenticated）

### B. 匯入流程（設定頁「看板資料」）
- file picker 匯入 dashboard.json：驗 `schemaVersion` 1.x + `tickers` 非空
- 通過 → upsert Supabase + localStorage 快取；離線匯入存本機、復線 `syncLocalToSupabase` 自動補同步
- 顯示已匯入的來源報告 / 檔數 / 產出時間

### C. 看板 Tab（📋，持倉中之後）
- 取價獨立於 buys：每檔用 `yahooSymbol` 直查 Yahoo v8（涵蓋未持有 watch 標的），5 分鐘節流
- **台股後綴容錯**：`.TWO` 抓不到試 `.TW`、反之亦然（上線驗證即抓到 JSON 把愛普 6531 標成 .TWO 的實例，Yahoo 實際為 .TW；已回報決策層修正 JSON 與契約附錄 B 範例，App 容錯保留為最後防線）
- 快層計算（契約第 3 節修訂版）：
  - `distancePct = (levelPrice − price) / price × 100`，above 正、below 負
  - 貼線 |x| ≤ nearLinePct → 琥珀高亮
  - 跨線依 direction 判定；盤中（TW 09:00–13:30 台北 / US 09:30–16:00 紐約，Intl 自動處理夏令）顯示弱化文案「盤中越線，待收盤確認」
  - 量能第一階段只判張數/股數門檻（`lot` 自動 ÷1000），無量能標「待人工確認」
  - 催化劑 date == 今日 → 卡片頂部橫幅 + 列表琥珀高亮
- 呈現遵附錄 A：代碼+名稱並列、holdingType/status badge（trim_alert 琥珀、stop 高反差實心）、紅綠專用損益、持有在上 watch 在下、watch 停損欄「—（未持有）」、論點證偽優先於價格停損
- 抓不到價：「價格待更新 ⚠」，不擋其他卡片
- 空狀態導引至設定頁匯入

### D. 其他
- `clearAllData` 納入 dashboard 表；版本 v4.1.0 → v4.2.0
- 全部 JSON 自由文字進 innerHTML 一律 `esc()`（含離線 XSS 注入測試）

---

## 與 Cowork 的關鍵決議（實作前釐清）

1. **交付管道**：Supabase + 手動匯入（每週數次可承受）——public repo 不可放投資決策資料
2. **距離 % 慣例**：交易看板.html 原本兩種寫法並存（2330 卡 −7.4% vs 009819 卡 +1.3%），統一為契約公式；009819 式寫法棄用
3. 盤中弱化文案、量能只判門檻：Code 預設，Cowork 無異議
4. 階段①即日生效：正式 dashboard.json（12 檔）直接可用，無空窗

---

## 踩坑記錄

- **上游資料要實測，不能只信 schema**：JSON 與契約附錄 B 都把 6531 寫成 `.TWO`，實際 Yahoo 是 `.TW`。呈現層對上游資料錯誤要有容錯（後綴互換 fallback），但根因仍回報資料源修正——容錯是防線不是修正。
- **距離 % 顯示慣例先對齊再實作**：同一份看板 HTML 內符號慣例就不一致，若未先與決策層拍板，實作後才發現會返工。
- **取價節流 + 重繪遞迴防護**：`renderDashboardTab` → `fetchDashboardPrices`（節流 5 分鐘）→ 完成後重繪一次；第二次進入因節流不再 fetch，天然終止遞迴。

---

## 驗證（線上實測通過，2026-07-05）

- [x] 匯入正式 dashboard.json（12 檔），顯示來源/產出時間
- [x] 持有 8 檔在上、觀察 4 檔在下，代碼+名稱並列
- [x] 距離 % 抽驗：2330 加碼 −7.4% / 鎖利 +6.3%、漢唐鎖利 +27.1%
- [x] 貼線琥珀高亮：2308 加碼 2,110（+1.7%）、INTC 進場 119（−1.1%）
- [x] 量能：台股張數（29,405）/ 美股股數（122M）單位正確；無條件標「待人工確認」
- [x] watch 停損欄「—（未持有）」；ORCL trim_alert 琥珀 badge
- [x] 6531 後綴容錯取價（初次「價格待更新 ⚠」→ 修復後取得 987）
- [x] 深/淺色主題呈現正常

---

## 後續（另開任務）

- 階段③：PWA（manifest + Service Worker）+ Web Push 貼線/跨線/催化劑推播（iOS 16.4+ 需加入主畫面）；
  推播發送端需排程運算（現有 Cloudflare Worker 可承接：cron 讀 Supabase dashboard + Yahoo EOD 判定後發送）
- RVOL 量能判定（需歷史均量）
- nearLinePct App 端覆寫 UI
