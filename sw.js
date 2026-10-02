// Le Nid : ouverture rapide, installation et notifications.
// Le réseau passe toujours en premier, pour que chaque mise à jour publiée
// sur GitHub arrive à la prochaine ouverture.
const VERSION = "le-nid-3";
const META = "nid-meta";
const SHELL = ["./", "index.html", "config.js", "manifest.json", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== META).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});

// ---------- Notifications ----------
// Le serveur réveille le téléphone sans contenu ; on vient lire le texte des
// dernières alertes auprès du serveur, avec le jeton enregistré par l'app.
async function lire(cle) {
  const c = await caches.open(META);
  const r = await c.match(cle);
  return r ? r.json() : null;
}
async function ecrire(cle, v) {
  const c = await caches.open(META);
  await c.put(cle, new Response(JSON.stringify(v)));
}
const cleNom = n => String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_");

async function montrer() {
  const meta = await lire("/__nid/meta");
  const vu = (await lire("/__nid/vu")) || "";
  let notifs = [];
  if (meta && meta.url && meta.jeton) {
    try {
      const r = await fetch(meta.url, { method: "POST", body: JSON.stringify({ jeton: meta.jeton, action: "notifs", depuis: vu }) });
      const j = await r.json();
      if (j.ok) notifs = j.notifs || [];
    } catch (e) {}
  }
  notifs = notifs.filter(n => !meta || !n.auteur || cleNom(n.auteur) !== cleNom(meta.me)).slice(-3);
  const opts = { icon: "icon-192.png", badge: "icon-192.png" };
  if (!notifs.length) {
    // Le téléphone exige d'afficher quelque chose à chaque réveil
    return self.registration.showNotification("Le Nid", Object.assign({ body: "Du nouveau dans l'app de la famille", tag: "le-nid", data: { onglet: "fil" } }, opts));
  }
  for (const n of notifs) {
    await self.registration.showNotification(n.titre || "Le Nid",
      Object.assign({ body: n.texte || "", tag: n.id, data: { onglet: n.onglet || "fil" } }, opts));
  }
  await ecrire("/__nid/vu", notifs[notifs.length - 1].date);
}
self.addEventListener("push", e => { e.waitUntil(montrer()); });

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const onglet = (e.notification.data && e.notification.data.onglet) || "fil";
  const url = new URL("./#" + onglet, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && "focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
