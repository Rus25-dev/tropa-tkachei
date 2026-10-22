// Сцена обсервера «Гонок Ткачей» (legacy/src/race-watch.js WatchScene): две равные половины 16:9-окна с картинкой обоих игроков по телеметрии —
// уровень, герои, боссы, снаряды рисуются игровой отрисовкой, камера идёт за героем своей половины. Табло и лента — HTML поверх (ui/races.tsx).
// Окно вписывается в экран: рабочая область 1920×1080 масштабируется целиком (поля по бокам — фон), поэтому на любом мониторе картинка та же.
import Phaser from 'phaser';
import { PAL, T } from '../../core/balance';
import { CHAPTERS } from '../../core/balance';
import { ARENAS, buildLevel, buildRoad } from '../../core/levels';
import { bossDef } from '../../core/boss/registry';
import { arenaLevel } from '../../core/boss/schema';
import type { Level } from '../../core/types';
import type { RaceWatch } from '../../net/racewatch';
import { drawClassroom, drawDen } from '../artRooms';
import { drawLevelChunks } from '../art';
import { drawWeaver, type G } from '../draw/common';
import { currentFit, watchBox } from '../fit';

const FONT = '"Fira Sans", sans-serif';
interface LevelPack { L: Level; key: string; chunks: { x: number; key: string }[]; W: number; H: number }
interface View { i: number; seat: number; cont: Phaser.GameObjects.Container; level: LevelPack | null; imgs: Phaser.GameObjects.Image[]; g: G; tag: Phaser.GameObjects.Text; cx: number; cy: number; hx: number | null; hy: number | null }

export class WatchScene extends Phaser.Scene {
  private watch!: RaceWatch;
  private views = new Map<number, View>();
  private cams: Phaser.Cameras.Scene2D.Camera[] = [];
  private conts: Phaser.GameObjects.Container[] = [];
  private levels = new Map<string, LevelPack>();
  private zoom = 1.55; private soloOn = false;
  constructor() { super('watch'); }

  create(): void {
    this.watch = this.registry.get('raceWatch') as RaceWatch;
    this.views.clear(); this.levels.clear();
    this.cams = [this.cameras.main, this.cameras.add(0, 0, 10, 10)];
    for (const c of this.cams) c.setBackgroundColor('#070d0c');
    this.conts = [this.add.container(0, 0), this.add.container(0, 0)];
    this.cams[0]!.ignore(this.conts[1]!); this.cams[1]!.ignore(this.conts[0]!);
    this.fitNow();
    this.game.events.on('tt:fit', this.fitNow, this);
    this.events.once('shutdown', () => {
      this.game.events.off('tt:fit', this.fitNow, this);
      for (const l of this.levels.values()) for (const c of l.chunks) if (this.textures.exists(c.key)) this.textures.remove(c.key);
      this.levels.clear(); this.views.clear();
    });
  }
  /** две камеры в левой и правой половине рабочей области 16:9 */
  private fitNow(): void {
    const f = currentFit(), b = watchBox(f.cssW, f.cssH), d = f.dpr;
    const x = Math.round(b.x * d), y = Math.round(b.y * d), w = Math.round(b.w * d), h = Math.round(b.h * d), hw = Math.floor(w / 2);
    const so = this.watch.solo, si = so ? (this.watch.S?.players || []).findIndex((p) => p.seat === so.seat) : -1;
    if (si === 0) { this.cams[0]!.setViewport(x, y, w, h); this.cams[1]!.setViewport(x + w, y, 1, h); }
    else if (si === 1) { this.cams[0]!.setViewport(x - 1, y, 1, h); this.cams[1]!.setViewport(x, y, w, h); }
    else { this.cams[0]!.setViewport(x, y, hw, h); this.cams[1]!.setViewport(x + hw, y, w - hw, h); }
    this.zoom = 1.55 * (h / 1080);
    this.cams.forEach((c) => c.setZoom(this.zoom));
  }

  private levelOf(ch: number, st: string): LevelPack | null {
    const key = `${ch}:${st}`, have = this.levels.get(key); if (have) return have;
    let L: Level;
    try {
      if (st === 'level') L = buildLevel(); else if (st === 'road') L = buildRoad(ch);
      else { const def = bossDef(CHAPTERS[ch]?.boss ?? CHAPTERS[2]!.boss); L = (ARENAS[def ? arenaLevel(def) : 'misha'] ?? ARENAS['misha']!)(); }
    } catch { return null; }
    const pre = `wv${this.levels.size}_`;
    const chunks = L.theme === 'class' ? drawClassroom(this, L) : L.theme === 'den' ? drawDen(this, L) : drawLevelChunks(this, L, pre), keys: { x: number; key: string }[] = [];
    for (const c of chunks) { const nk = `${pre}${c.key}`; if (nk !== c.key) { if (this.textures.exists(nk)) this.textures.remove(nk); this.textures.renameTexture(c.key, nk); } keys.push({ x: c.x, key: nk }); }
    const pack = { L, key, chunks: keys, W: L.W * T, H: L.H * T }; this.levels.set(key, pack);
    return pack;
  }
  private viewFor(i: number, seat: number): View {
    let v = this.views.get(seat); if (v) return v;
    const cont = this.conts[i]!;
    v = { i, seat, cont, level: null, imgs: [], g: this.add.graphics(), tag: this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: PAL[i % PAL.length]!.hex }).setOrigin(0.5),
      cx: 0, cy: 0, hx: null, hy: null };
    cont.add([v.g, v.tag]); v.g.setDepth(5); v.tag.setDepth(6);
    this.views.set(seat, v);
    return v;
  }
  private setLevel(v: View, lv: LevelPack | null): void {
    for (const im of v.imgs) im.destroy(); v.imgs = [];
    v.level = lv; if (!lv) return;
    for (const c of lv.chunks) { const im = this.add.image(c.x, 0, c.key).setOrigin(0).setDepth(1); v.cont.add(im); v.imgs.push(im); }
    this.cams[v.i]!.setBounds(0, 0, lv.W, lv.H);
    v.hx = null;
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100) / 1000, S = this.watch.S; if (!S) return;
    const so = this.watch.solo; if (so && this.watch.nowMs() > so.until) { this.watch.solo = null; this.fitNow(); this.watch.changed(); } else if (!!so !== this.soloOn) { this.soloOn = !!so; this.fitNow(); }
    const now = performance.now();
    (S.players || []).slice(0, 2).forEach((p, i) => {
      const t = this.watch.telFor(p.seat), v = this.viewFor(i, p.seat);
      if (!t) { v.g.clear(); v.tag.setVisible(false); return; }
      v.tag.setVisible(true);
      const key = `${t['ch']}:${t['st']}`;
      if (!v.level || v.level.key !== key) this.setLevel(v, this.levelOf(t['ch'], t['st']));
      if (!v.level) return;
      // положение героя: сглаживание и небольшой вынос по скорости (телеметрия ~15 Гц)
      const age = Math.min(0.25, (now - t.at) / 1000), ex = t['x'] + (t['vx'] || 0) * age, ey = t['y'] + (t['vy'] || 0) * age;
      if (v.hx == null || v.hy == null) { v.hx = ex; v.hy = ey; v.cx = ex; v.cy = ey - 60; }
      const k = Math.min(1, dt * 14), hx = (v.hx ?? ex) + (ex - (v.hx ?? ex)) * k, hy = (v.hy ?? ey) + (ey - (v.hy ?? ey)) * k; v.hx = hx; v.hy = hy;
      const cam = this.cams[v.i]!; cam.setZoom(this.zoom);
      v.cx += (hx + (t['f'] || 1) * 50 - v.cx) * Math.min(1, dt * 5); v.cy += (hy - 40 - v.cy) * Math.min(1, dt * 5);
      cam.centerOn(v.cx, v.cy);
      this.drawView(v, t, p.name, now / 1000);
    });
  }
  private drawView(v: View, t: Record<string, any>, name: string, tm: number): void { // eslint-disable-line @typescript-eslint/no-explicit-any
    const g = v.g; g.clear(); g.setAlpha(1);
    const pal = PAL[v.i % PAL.length]!, f = t['f'] || 1;
    // враги
    for (const e of t['en'] || []) {
      const [type, x, y, w, h, face] = e as [string, number, number, number, number, number], cx = x + w / 2;
      g.fillStyle(type === 'gnat' ? 0x6a5a8a : type === 'beetle' ? 0x5a6a3a : 0x3f4a3a, 1);
      if (type === 'gnat') { g.fillEllipse(cx, y + h / 2, w, h * 0.8); g.fillStyle(0xffffff, 0.4); g.fillEllipse(cx - 6, y + h / 2 - 6, 10, 5); g.fillEllipse(cx + 6, y + h / 2 - 6, 10, 5); }
      else { g.fillRoundedRect(x, y, w, h, 6); g.fillStyle(0xff9a3c, 1); g.fillCircle(cx + (face || 1) * w * 0.25, y + h * 0.35, 2.5); }
    }
    // босс
    const b = t['bs'];
    if (b && b.on) {
      const pal2 = ({ k: [0x34482f, 0x5d8a46], m: [0x4f5b78, 0xc8463c], v: [0x5a3f78, 0xe0b84a], t: [0x7a5a2a, 0xf0d070] } as Record<string, number[]>)[b.k] || [0x444444, 0xaaaaaa];
      const cx = b.x + b.w / 2, fl = b.s === 'stun';
      g.fillStyle(0x000000, 0.25); g.fillEllipse(cx, b.y + b.h, b.w * 0.9, 12);
      g.fillStyle(fl ? 0xffffff : pal2[0]!, 1); g.fillRoundedRect(b.x, b.y, b.w, b.h, 16);
      g.fillStyle(pal2[1]!, 1); g.fillRoundedRect(b.x + b.w * 0.12, b.y + b.h * 0.12, b.w * 0.76, b.h * 0.34, 12);
      const ex = cx + (b.f || 1) * b.w * 0.22; g.fillStyle(b.ph >= 2 ? 0xff5a3c : 0xffd47a, 1); g.fillCircle(ex, b.y + b.h * 0.34, 4.5); g.fillCircle(ex - (b.f || 1) * 14, b.y + b.h * 0.34, 4);
      if (/Wind|wind|warn|tell/.test(b.s || '')) { g.lineStyle(3, 0xffe3a3, 0.85); g.strokeRoundedRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6, 18); }
      g.fillStyle(0x000000, 0.7); g.fillRect(b.x, b.y - 14, b.w, 7); g.fillStyle(0xff9a3c, 1); g.fillRect(b.x + 1, b.y - 13, (b.w - 2) * Math.max(0, b.hp / b.mh), 5);
    }
    // снаряды
    for (const q of t['pr'] || []) {
      const [kind, x, y, w, h] = q as [string, number, number, number, number];
      const col = ({ spore: 0xc7f08a, wave: 0xd8c08a, rock: 0x9a8a7a, letter: 0xf4efe0, note: 0xffe3a3, clef: 0xe0b84a, bomb: 0x3a3f45, drip: 0x9fe0d8 } as Record<string, number>)[kind] ?? 0xff9a8a;
      g.fillStyle(col, 0.95); g.fillRoundedRect(x, y, Math.max(6, w), Math.max(6, h), 3);
    }
    // герой
    const x = v.hx ?? 0, y = v.hy ?? 0, cx = x + 7, fy = y + 26, run = t['g'] && Math.abs(t['vx']) > 10, ph = tm * 14;
    if (t['dn']) { g.fillStyle(pal.cloak, 0.5); g.fillEllipse(cx, fy - 10, 30, 22); }
    else {
      g.setAlpha(t['w'] ? 0.4 : 1);
      if (t['d']) { g.fillStyle(pal.accent, 0.3); g.fillEllipse(cx - f * 18, fy - 13, 26, 18); }
      drawWeaver(g, cx, fy, f, pal, { leg: run ? Math.sin(ph) * 5 : (t['g'] ? 0 : 2), bob: run ? Math.abs(Math.sin(ph)) * 1.5 : 0, sway: run ? -4 : (!t['g'] ? (t['vy'] < 0 ? -2 : 3) : 0), lift: (!t['g'] && t['vy'] > 0) ? -4 : 0 }, 1);
      if (t['a']) {
        g.lineStyle(4, 0xe8e2cf, 0.9); const r = 34; g.beginPath();
        if (t['a'] === 2) g.arc(cx, fy - 20, r, -Math.PI * 0.95, -Math.PI * 0.05); else g.arc(cx, fy - 14, r, f > 0 ? -0.9 : Math.PI - 0.9, f > 0 ? 0.9 : Math.PI + 0.9);
        g.strokePath();
      }
      g.setAlpha(1);
    }
    v.tag.setText(name).setPosition(cx, fy - 44).setAlpha(0.9);
  }
}
