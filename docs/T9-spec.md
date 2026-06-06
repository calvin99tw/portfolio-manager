# T9 規格：v4.1 資金池重構

**版本**：v4.1  
**狀態**：📋 待實作  
**影響範圍**：`index.html`、Supabase（新增 `pool_flows` 表、修改 `snapshots` 表）

---

## 背景與動機

原本的 `pools.poolTWD / poolUSD` 是靜態設定值（使用者手動輸入的「資金預算上限」），無法反映真實的資金進出歷史，導致：
- 無法得知累計實際投入了多少本金
- 閒置現金是反推計算，缺乏直覺
- 真實報酬率的分母不準確

v4.1 引入 `pool_flows` 資料表，記錄每一筆入金／出金，所有資金數字改為公式推導，不再仰賴靜態設定值。

---

## 核心公式（所有計算的依據）

```
投入本金     = Σ pool_flows.入金 - Σ pool_flows.出金  （依 currency 分別計算）

可用餘額     = 投入本金 + 已實現損益 + 已收股息 - 已投入成本
             ← 可用來對照實際交割戶餘額；不符代表有漏記的流水

總資產       = 持股市值 + 可用餘額

累計報酬     = 未實現損益 + 已實現損益 + 已收股息

累計報酬率   = 累計報酬 / 投入本金
```

> **注意**：已投入成本 = 目前持倉的買入總成本（含手續費）；持股市值 = 各標的現價 × 股數。這兩者均已存在於現有邏輯中，不需變更。

---

## 一、Supabase 變更

### 1-A 新增 `pool_flows` 資料表

```sql
create table pool_flows (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  currency    text not null check (currency in ('TWD', 'USD')),
  type        text not null check (type in ('入金', '出金')),
  amount      numeric not null check (amount > 0),
  date        date not null,
  note        text,
  created_at  timestamptz default now()
);

alter table pool_flows enable row level security;

create policy "pool_flows: own rows" on pool_flows
  for all using (auth.uid() = user_id);
```

### 1-B 修改 `snapshots` 資料表

新增兩欄，記錄快照當下的投入本金（供未來績效圖表使用）：

```sql
alter table snapshots add column twd_net_deposit numeric;
alter table snapshots add column usd_net_deposit numeric;
```

舊的 `twd_cost / usd_cost` **保留不動**，避免破壞現有績效圖表。

### 1-C `pools` 資料表

- `poolTWD` / `poolUSD`：廢棄，不再讀寫（欄位保留，不刪除）
- `usdRate`：繼續使用，無變更

---

## 二、Migration（一次性，App 初始化時執行）

**觸發條件**：`pool_flows` 中該 user 的記錄數為 0

**執行邏輯**：

```javascript
// 取得現有 pools 資料
const { poolTWD, poolUSD } = pools;
const today = new Date().toISOString().slice(0, 10);

// 各幣別分別取最早的買入日期
const twdBuys = buys.filter(b => b.currency === 'TWD');
const usdBuys = buys.filter(b => b.currency === 'USD');
const twdDate = twdBuys.length > 0 ? twdBuys.map(b => b.buyDate).sort()[0] : today;
const usdDate = usdBuys.length > 0 ? usdBuys.map(b => b.buyDate).sort()[0] : today;

// 插入初始入金記錄（amount > 0 才插入）
const rows = [];
if (poolTWD > 0) rows.push({ currency: 'TWD', type: '入金', amount: poolTWD, date: twdDate, note: '初始資金（v4.1 移轉）' });
if (poolUSD > 0) rows.push({ currency: 'USD', type: '入金', amount: poolUSD, date: usdDate, note: '初始資金（v4.1 移轉）' });
if (rows.length > 0) await supabase.from('pool_flows').insert(rows);
```

> **說明**：`poolTWD` 即為正確的初始投入本金。驗證：`可用餘額 = poolTWD + 已實現損益 + 已收股息 - 已投入成本` 應等於原本的閒置現金，數字一致代表移轉正確。

---

## 三、UI 變更

### 3-A Pool Card 重構

每張 pool card 改為三個語意區塊：

---

#### 區塊①：Header

```
台股池 · TWD                    NT$ 378,761   ← 總資產（持股市值 + 可用餘額）
```

總資產放右上角，是整張 card 最核心的數字。

---

#### 區塊②：配置 Bar

保留現有的持股配置 bar（依**市值比例**顯示各標的），改為以**總資產**為分母計算百分比（原本是以池總額為分母）。

- 各標的顏色延續現有 `alloc-bar` 設計
- 最後一段為「可用餘額」（灰色）
- Legend 格式：`● 台積電 XX%（NT$ XXX,XXX）`
- 百分比 = 該標的市值 / 總資產
- 可用餘額百分比 = 可用餘額 / 總資產

---

#### 區塊③：資金現況（3 欄）

| 投入本金 | 持股市值 | 可用餘額 |
|---------|---------|---------|
| NT$ XXX,XXX | NT$ XXX,XXX | NT$ XXX,XXX |
| X 筆 | 已投入成本 XXX,XXX | 可加碼 / 新標的 |

- 投入本金 sub：顯示 pool_flows 的筆數（例如「3 筆」），方便使用者確認記錄是否完整
- 持股市值 sub：「已投入成本 XXX,XXX」，讓使用者知道市值和成本的關係

---

#### 區塊④：報酬（2 欄 grid）

```
未實現損益     +XXX,XXX    已實現損益     +XXX,XXX
已收股息            XXX
─────────────────────────────────────────────
累計報酬                        +NT$ XXX,XXX  +XX.X%
```

- 累計報酬橫跨兩欄，字體較大
- 百分比 = 累計報酬 / 投入本金

---

---

### 3-B 入金／出金 Modal

#### 觸發位置

移至 holdings tab 的頂部工具列，與「分池檢視 / 合併 TWD」切換按鈕**同一列**，靠右對齊：

```
[分池檢視 / 合併 TWD]                              [入金 / 出金]
```

button 樣式用現有的 `btn btn-action`。

#### Modal 內容

```
標題：資金流水

[入金]  [出金]          ← toggle，預設選「入金」

幣別                    ← select：台股池 (TWD) / 美股池 (USD)
金額 (TWD / USD)        ← number input
日期                    ← date input，預設今日
備注（選填）            ← text input

[確認]
```

#### 儲存邏輯

- 寫入 `pool_flows` 表
- 寫入後重新計算該幣別的 `投入本金`、`可用餘額`，更新 UI（不需重新從 Supabase 載入所有資料）

---

### 3-C 用語全站統一

以下詞彙在 `index.html` 中全部替換：

| 舊用語 | 新用語 |
|--------|--------|
| 池總額 | 投入本金 |
| 閒置現金 | 可用餘額 |
| 真實總報酬 | 累計報酬 |
| 持倉天數 | 投資天數 |
| 已投入 XX% 使用 | 移除此行（改由 bar 呈現） |

其他用語維持不變：未實現損益、已實現損益、已收股息、入金、出金。

**年化報酬率**：pool card 上不再顯示（已移除進階區塊）。個別持倉欄位（holdings table）的年化報酬率保留，不需變動。

---

## 四、snapshots 快照更新

`saveSnapshot()` 函數新增寫入 `twd_net_deposit` 和 `usd_net_deposit`：

```javascript
twd_net_deposit: calcNetDeposit('TWD'),   // Σ pool_flows(TWD入金) - Σ pool_flows(TWD出金)
usd_net_deposit: calcNetDeposit('USD'),
```

現有的 `twd_cost` / `usd_cost` 繼續寫入，不影響現有績效圖表。

---

## 五、實作順序建議

1. Supabase：建立 `pool_flows` 表、修改 `snapshots` 表
2. JS：新增 `pool_flows` 的 load / save / calcNetDeposit 函式
3. Migration：App 初始化時檢查並執行
4. UI：Pool Card 重構（bar + 三區塊）
5. UI：入金／出金 Modal + toolbar 按鈕
6. 用語替換
7. snapshots 更新邏輯
8. 驗證：`可用餘額` 是否與移轉前的 `閒置現金` 一致

---

## 六、驗證方法

移轉完成後，開啟 app 確認：

- `可用餘額(TWD)` = 移轉前的 `閒置現金(TWD)`（數字應完全相同）
- `可用餘額(USD)` = 移轉前的 `閒置現金(USD)`
- 累計報酬數字 = 未實現損益 + 已實現損益 + 已收股息（人工加總比對）
- pool_flows 表中有且僅有 2 筆初始記錄（TWD + USD）

---

## 注意事項

- **可用餘額不可手動覆蓋**：永遠從公式計算。若使用者發現與交割戶不符，代表有漏記的入金或出金。
- **USD pool**：邏輯完全相同，金額以 USD 記錄，不換算 TWD。
- **amount 欄位**：pool_flows.amount 恆為正數，type 欄位區分入金／出金方向。
- **歷史快照的 twd_net_deposit**：移轉前的舊快照該欄為 null，績效圖表忽略 null 即可。
