# T13 規格：看板推播（dashboard.json 契約 v1 階段③）

**版本**：v4.2.x
**狀態**：📋 實作中（時程壓縮：infra 全部於 7/7 前完成）
**影響範圍**：`infra/worker.js`、`infra/wrangler.toml`、`index.html`、`manifest.json`、`sw.js`、icons、Supabase（新表 `push_subscriptions`）
**上游契約**：`../股票分析/dashboard_json_契約_v1.md` 附錄 D（2026-07-05 設計凍結）

---

## 一、背景與時程改議

原計畫：階段②看板頁跑一至兩週雙軌比對後再動工階段③。
改議（2026-07-05，與 Cowork 定案）：**所有階段③ infra 壓在 7/7 前實作完成**——Worker cron、
VAPID、Supabase subscriptions、manifest/SW/訂閱 UI、價格判定函式，理由是這些最吃模型能力，
趁 Fable 窗口做完。但**上線與交棒不搶時間**：

1. 催化劑推播**立即上線**（零判定風險，兼作管線實測）
2. 價格推播（貼線/跨線）藏於 **feature flag**（`PRICE_PUSH_ENABLED=false`）
3. 7/7 後雙軌比對一至兩週（App 判定 vs Claude 每日距離掃描）——不吃模型能力
4. 驗證通過 → 撥開 flag → Claude 例行掃描交棒（v3.2 B4）

---

## 二、架構（契約附錄 D）

```
Cloudflare Worker（cron）
  ├─ 30 6 * * 1-5  台股收盤掃描（14:30 台北）
  └─ 0 21 * * 1-5  美股收盤掃描（05:00 台北，夏令收盤後 1hr）
       │
       ├─ 讀 Supabase dashboard（service_role，全使用者）
       ├─ 讀 push_subscriptions
       ├─ Yahoo EOD 取價（僅 flag 開啟時；.TW↔.TWO 後綴容錯）
       ├─ 契約第 3 節判定：催化劑（date==today，market 時區）＋
       │   貼線 |dist|≤nearLinePct ＋ 跨線（direction 越過）
       └─ Web Push：RFC 8291 aes128gcm 加密 + RFC 8292 VAPID ES256
           （WebCrypto 全自建，零 npm 相依）；404/410 自動清失效訂閱

App（GitHub Pages PWA）
  ├─ manifest.json + icons（180/192/512）
  ├─ sw.js：push → showNotification；click → focus/openWindow；不做資源快取
  └─ 設定頁「推播通知」：啟用/停用/測試；訂閱存 push_subscriptions
```

### 通知策略
- **每 cron 每使用者合併為一則通知**（≤10 行 + 溢出計數），對應「10 行掃描表」語意，避免轟炸
- 文案帶 `generatedAt` 日期（「依 MM/DD 看板」），cron 時使用者可能尚未匯入當日 JSON（契約時序註記）
- 同 tag（`scan-{market}-{date}`）覆蓋，重複掃描不堆疊

### Supabase：push_subscriptions

```sql
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
-- RLS 四 policy（auth.uid() = user_id）+ GRANT anon, authenticated
-- Worker 以 service_role 讀全表（繞過 RLS，server-side only）
```

### Worker 環境
- vars：`SUPABASE_URL`、`VAPID_PUBLIC_KEY`、`VAPID_SUBJECT`、`PRICE_PUSH_ENABLED`
- secrets：`SUPABASE_SERVICE_KEY`（legacy service_role JWT，新式 sb_secret 非 JWT 不相容
  Bearer header）、`VAPID_PRIVATE_JWK`（產生時直接 pipe 進 secret，不留檔）

### 新路由（Origin 白名單內）
- `POST /push/test`：對 body 的 subscription 發測試通知（管線驗證）
- `GET /push/scan?market=TW|US`：手動觸發掃描（測試/補掃）

---

## 三、iOS 限制

iOS 16.4+ 才支援 Web Push，且**必須「加入主畫面」後從主畫面圖示開啟**才能訂閱。
App 端偵測 iOS 非 standalone 時顯示導引文字。訂閱依裝置獨立，每裝置各啟用一次。

## 四、費用

全免費：Worker free plan 支援 cron（用 2/5 個）、Web Push 為開放標準（VAPID 自產、
push service 由瀏覽器廠商免費提供、iOS **不需** Apple Developer Program）、
Supabase/Pages 沿用現有 free tier。

## 五、驗證

1. `wrangler secret list` 確認兩 secret 名稱正確
2. `GET /push/scan?market=TW|US` 回 `{users:1, sent:N}`（service key 讀取正常）
3. 桌機 Chrome：啟用推播 → 測試通知送達
4. iPhone：加入主畫面 → 啟用 → 測試通知送達
5. 自然驗證：7/8 05:00 SPCX 納入 Nasdaq-100（美股催化劑）、7/10 14:30 台股 6 月營收 ×3
6. 價格推播：flag 開啟前不發送；雙軌比對通過後改 `PRICE_PUSH_ENABLED="true"` 重新部署

---

*T13 spec｜2026-07-05*
