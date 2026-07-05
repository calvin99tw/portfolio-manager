# T13 工作摘要：看板推播（契約 v1 階段③）

**狀態**：✅ infra 完成、催化劑推播已上線；價格推播藏於 flag 待雙軌驗證
**影響檔案**：`infra/worker.js`、`infra/wrangler.toml`、`index.html`、`manifest.json`、`sw.js`、
`icon-{180,192,512}.png`、Supabase（`push_subscriptions` 表）

---

## 完成項目

### A. Worker（已部署，cron 已掛）
- `scheduled` handler：`30 6 * * 1-5`（台股 14:30 台北）、`0 21 * * 1-5`（美股 05:00 台北）
- 掃描流程：service_role 讀全使用者 dashboard + subscriptions → （flag 開時）Yahoo EOD →
  契約第 3 節判定（催化劑/貼線/跨線）→ 合併為每使用者一則通知發送
- **Web Push 全自建零相依**：RFC 8291（ECDH P-256 + HKDF + AES-128-GCM aes128gcm）+
  RFC 8292 VAPID（ES256 JWT，WebCrypto ECDSA 輸出即 r||s 可直接當 JWS 簽章）
- 404/410 回應自動刪除失效訂閱
- 新路由 `POST /push/test`、`GET /push/scan?market=`（Origin 白名單保護）
- Yahoo 取價含 `.TW↔.TWO` 後綴容錯（與 App 端一致）
- `PRICE_PUSH_ENABLED="false"`：催化劑推播先行，價格推播待撥開

### B. App（PWA + 訂閱管理）
- `manifest.json`（standalone）、`sw.js`（push 顯示/點擊聚焦，同 tag 覆蓋防堆疊，不做資源快取）
- icons 以原生 Python 手寫 PNG chunk 生成（無 PIL 環境）：深底 + 紫紅長條圖
- head：manifest link、apple-touch-icon、apple-mobile-web-app meta
- 設定頁「推播通知」卡片：啟用（權限請求 → subscribe → upsert Supabase）/停用
  （unsubscribe + 刪列）/發送測試通知；iOS 非 standalone 顯示加入主畫面導引

### C. Supabase
- `push_subscriptions`（endpoint 唯一鍵）+ RLS 四 policy + GRANT
- Worker 用 **legacy service_role JWT**（新版 Dashboard 的 `sb_secret_` 非 JWT，
  與 `Authorization: Bearer` 不相容——選 key 時要進「Legacy anon, service_role」分頁）

### D. Secrets 處理（敏感資料不經對話）
- `VAPID_PRIVATE_JWK`：產生時寫暫存檔 → pipe 進 `wrangler secret put` → 即刪，全程不印出
- `SUPABASE_SERVICE_KEY`：使用者本人在自己的 Terminal 執行 secret put，不貼給 Claude

---

## 驗證結果（2026-07-06 凌晨）

- [x] `wrangler secret list`：兩 secret 名稱正確
- [x] `GET /push/scan?market=TW|US` → `{users:1, sent:0}`（service key 讀取正常，尚無訂閱）
- [x] 桌機 Chrome：啟用推播 → 測試通知送達（含自訂 icon），端到端加密/簽章/遞送全通
- [ ] iPhone：加入主畫面 → 啟用 →測試（使用者後續自行完成）
- [ ] 自然驗證：7/8 05:00 SPCX 納入 Nasdaq-100、7/10 14:30 台股 6 月營收 ×3
- [ ] 雙軌比對（7/7 後一至兩週）→ 通過後 `PRICE_PUSH_ENABLED="true"` 重新部署

---

## 踩坑記錄

- **Supabase 新版金鑰頁的陷阱**：新式 `sb_secret_` key 不是 JWT，放進
  `Authorization: Bearer` 會過不了 PostgREST 驗證；Worker 直打 REST 要用
  Legacy 分頁的 `service_role`（`eyJ...`）。
- **WebCrypto 做 Web Push 完全可行**：不需要 web-push npm 套件。關鍵細節：
  aes128gcm 的 plaintext 要補 `0x02` 結尾分隔符（最後一筆 record）；
  keyInfo = `"WebPush: info\0" + ua_public + as_public`；
  VAPID JWT 的 ECDSA 簽章 WebCrypto 原生輸出就是 r||s 格式，直接 base64url 即為 JWS。
- **cron 與時區**：cron 表達式是 UTC。台股 14:30 台北 = `30 6`；美股收盤 16:00 ET
  夏令 = 20:00 UTC，排 `0 21` 留 1hr 緩衝（冬令時 = 收盤當下，可接受）。
  「今日」判定用 `Intl.DateTimeFormat(en-CA, {timeZone})` 取市場當地日期。
- **每 cron 合併一則通知**：逐 level 發送會轟炸；合併 + 同 tag 覆蓋是對的粒度。
- **無 PIL 也能生 PNG**：struct + zlib 手寫 IHDR/IDAT/IEND chunk，
  純色塊圖示（長條圖）幾百 bytes 搞定。

---

## 後續

- 雙軌比對通過後：`infra/wrangler.toml` 改 `PRICE_PUSH_ENABLED="true"` →
  `cd infra && npx wrangler deploy`（一行開關）
- RVOL 量能判定（二階段）、nearLinePct App 端覆寫 UI（未排program）
- Claude 例行掃描交棒（v3.2 B4）於價格推播上線後執行
