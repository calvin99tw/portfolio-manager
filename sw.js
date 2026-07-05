// Service Worker — T13 看板推播（dashboard.json 契約 v1 階段③）
// 職責：接收 Web Push 顯示通知、點擊聚焦/開啟 App。不做資源快取（App 依賴線上資料）。

self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); }
  catch (_) { d = { title: "投資組合看板", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "投資組合看板", {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: d.tag || "portfolio-scan",   // 同 tag 覆蓋，避免重複掃描堆疊
    data: d,
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  }));
});
