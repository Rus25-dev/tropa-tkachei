// ===== ПРОВЕРКА ОБНОВЛЕНИЙ: важно для иконки на экране «Домой» (iPhone держит старую версию в кэше и в памяти) =====
const Updater = {
  latest: null, shown: false,
  init() {
    if (location.protocol !== 'https:' && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') return;
    document.getElementById('upd-btn').addEventListener('click', () => this.reload());
    document.getElementById('upd-later').addEventListener('click', () => { document.getElementById('update').hidden = true; });
    this.check();
    // при возврате в приложение (iPhone не перезапускает его, а «будит»)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) this.check(); });
    setInterval(() => this.check(), 10 * 60 * 1000);
  },
  check() {
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((v) => {
      if (!v || !v.build || v.build === GAME_BUILD) return;
      this.latest = v; this.show();
    }).catch(() => { });
  },
  show() {
    const el = document.getElementById('update');
    document.getElementById('upd-text').textContent = `Вышла новая версия ${this.latest.version} · сборка ${this.latest.build}`;
    el.hidden = false;
  },
  reload() {
    const u = new URL(location.href);
    u.searchParams.set('v', String(this.latest ? this.latest.build : Date.now()).replace(/\s+/g, '-'));
    location.replace(u.toString());
  },
};
