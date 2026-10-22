// HUD на холсте (legacy/src/game.js UIScene): катушка нити и бутоны здоровья, имена, бусины, полоса босса, подсказки (тосты), название области,
// вид сверху «Пропустите!» и красная рамка на последнем бутоне. Меню, пауза, лавка и экран победы — HTML (src/ui).
import Phaser from 'phaser';
import { P, clamp } from '../../core/balance';
import { VH } from '../../core/constants';
import { tdGeo } from '../../core/misha';
import type { World } from '../../core/world';
import { INK, MASK, type G } from '../draw/common';
import { TOOLS } from '../../core/loadout';
import { currentFit, fitCamera, type Fit } from '../fit';
import { ABILS } from '../../core/kit/abilities';
import { kitHud } from '../../core/kit/moves';

const FONT = '"Fira Sans", sans-serif', DISPLAY = '"Cormorant SC", Georgia, serif';
interface UiEvent { k: string; [key: string]: unknown }

export class HudScene extends Phaser.Scene {
  private hud!: G; private tdG!: G;
  private names: Phaser.GameObjects.Text[] = [];
  private beadTxt!: Phaser.GameObjects.Text; private area!: Phaser.GameObjects.Text; private areaSub!: Phaser.GameObjects.Text;
  private toastTxt!: Phaser.GameObjects.Text; private bossName!: Phaser.GameObjects.Text; private vignette!: Phaser.GameObjects.Image;
  private tdTags: Phaser.GameObjects.Text[] = []; private tdSay!: Phaser.GameObjects.Text; private tdInfo!: Phaser.GameObjects.Text; private tdTitle!: Phaser.GameObjects.Text;
  private tdLayer!: Phaser.GameObjects.Container;
  private bossOn = false; private bossFrac = 1; private bossShown = 1;
  private toastQ: { msg: string; hold?: number }[] = []; private toastBusy = false; private toastCur = '';
  private t = 0;
  private fit: Fit = currentFit();
  private worldKey = -1;
  constructor() { super('hud'); }

  create(): void {
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setVisible(false);
    this.hud = this.add.graphics();
    this.beadTxt = this.add.text(42, VH - 34, '0', { fontFamily: FONT, fontSize: '18px', color: '#ffe3a3' });
    this.area = this.add.text(0, 92, '', { fontFamily: DISPLAY, fontSize: '40px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5).setAlpha(0).setShadow(0, 0, '#000', 12, false, true);
    this.areaSub = this.add.text(0, 128, '', { fontFamily: FONT, fontSize: '13px', color: '#8fb8a8' }).setOrigin(0.5).setAlpha(0);
    this.toastTxt = this.add.text(0, VH - 92, '', { fontFamily: FONT, fontSize: '16px', color: '#e8e2cf', backgroundColor: 'rgba(6,14,12,0.8)', padding: { x: 14, y: 8 } }).setOrigin(0.5).setAlpha(0);
    this.bossName = this.add.text(0, VH - 58, '', { fontFamily: DISPLAY, fontSize: '22px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5).setAlpha(0);
    // «вид сверху» для фазы Миши
    this.tdG = this.add.graphics();
    this.tdTags = [0, 1].map(() => this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#f4efe0' }).setOrigin(0.5).setVisible(false));
    this.tdSay = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '17px', fontStyle: '700', color: '#1a1410', backgroundColor: '#f4efe0', padding: { x: 9, y: 5 } }).setOrigin(0.5, 1).setVisible(false);
    this.tdInfo = this.add.text(0, 92, '', { fontFamily: FONT, fontSize: '14px', color: '#ffd47a' }).setOrigin(0.5);
    this.tdTitle = this.add.text(0, 66, 'ПРОПУСТИТЕ!', { fontFamily: DISPLAY, fontSize: '30px', fontStyle: '700', color: '#e8e2cf' }).setOrigin(0.5);
    this.tdLayer = this.add.container(0, 0, [this.tdG, ...this.tdTags, this.tdSay, this.tdInfo, this.tdTitle]).setVisible(false);
    this.children.sendToBack(this.tdLayer); // под всем интерфейсом: здоровье, подсказки видны поверх
    this.refit(currentFit());
    this.game.events.on('tt:fit', this.refit, this);
    this.game.events.on('tt:ui', this.onUi, this);
    this.events.once('shutdown', () => { this.game.events.off('tt:fit', this.refit, this); this.game.events.off('tt:ui', this.onUi, this); });
  }
  private refit(f: Fit): void {
    this.fit = f; fitCamera(this, f);
    const cx = f.vw / 2;
    this.vignette.setDisplaySize(f.vw, VH);
    for (const o of [this.area, this.areaSub, this.toastTxt, this.bossName, this.tdInfo, this.tdTitle]) o.setX(cx);
  }

  // ----- события интерфейса от сцены игры -----
  private onUi(e: UiEvent): void {
    switch (e.k) {
      case 'dim': { const r = this.add.rectangle(this.fit.vw / 2, VH / 2, this.fit.vw, VH, 0x050c0a, 0.34).setDepth(50); this.tweens.add({ targets: r, alpha: 0, duration: Math.max(260, (e['d'] as number) * 1.3), onComplete: () => r.destroy() }); break; }
      case 'toast': this.toast(e['m'] as string, e['hold'] as number | undefined); break;
      case 'bossBar': this.bossBar(e['show'] as boolean, e['name'] as string | undefined, e['frac'] as number | undefined); break;
      case 'area': this.areaTitle(e['name'] as string); break;
      case 'td': this.tdShow(e['on'] as boolean); break;
      case 'worldReady': this.resetFor(); break;
    }
  }
  private resetFor(): void {
    this.toastQ = []; this.toastBusy = false; this.tweens.killTweensOf(this.toastTxt); this.toastTxt.setAlpha(0);
    this.bossOn = false; this.bossName.setAlpha(0); this.tdLayer.setVisible(false);
  }
  // очередь подсказок: каждая висит, пока её можно спокойно дочитать, новые не перебивают старые
  toast(msg: string, hold?: number): void {
    if (!msg) { this.toastQ = []; this.toastBusy = false; this.tweens.killTweensOf(this.toastTxt); this.toastTxt.setAlpha(0); return; }
    if (this.toastQ.some((q) => q.msg === msg) || (this.toastBusy && this.toastCur === msg)) return;
    this.toastQ.push({ msg, hold });
    if (this.toastQ.length > 3) this.toastQ.shift();
    if (!this.toastBusy) this.nextToast();
  }
  private nextToast(): void {
    const q = this.toastQ.shift();
    if (!q) { this.toastBusy = false; this.toastCur = ''; return; }
    this.toastBusy = true; this.toastCur = q.msg;
    const ms = (q.hold || clamp(2.2 + q.msg.length * 0.05, 3, 6)) * 1000 * (this.toastQ.length ? 0.8 : 1);
    this.tweens.killTweensOf(this.toastTxt);
    this.toastTxt.setText(q.msg).setAlpha(0);
    this.tweens.add({ targets: this.toastTxt, alpha: 1, duration: 180 });
    this.tweens.add({ targets: this.toastTxt, alpha: 0, delay: ms, duration: 450, onComplete: () => this.nextToast() });
  }
  private areaTitle(name: string): void {
    const w = (this.registry.get('hud') as { world: World } | undefined)?.world;
    this.area.setText(name); this.areaSub.setText(w?.L.region || 'Мшистая Глубь');
    this.tweens.killTweensOf([this.area, this.areaSub]);
    this.area.setAlpha(0); this.areaSub.setAlpha(0);
    this.tweens.add({ targets: [this.area, this.areaSub], alpha: 1, duration: 700, yoyo: true, hold: 1800 });
  }
  private bossBar(on: boolean, name?: string, frac?: number): void {
    this.bossOn = on; if (name) this.bossName.setText(name);
    if (frac != null) this.bossFrac = frac; else if (on) this.bossFrac = 1;
    this.bossName.setAlpha(on ? 1 : 0);
  }
  private tdShow(on: boolean): void {
    this.tweens.killTweensOf(this.tdLayer);
    if (on) { this.tdLayer.setVisible(true).setAlpha(0); this.tweens.add({ targets: this.tdLayer, alpha: 1, duration: 450, delay: 450 }); }
    else this.tweens.add({ targets: this.tdLayer, alpha: 0, duration: 300, onComplete: () => this.tdLayer.setVisible(false) });
  }

  private drawTD(w: World): void {
    const td = w.td as { state: string; lane: number; mx: number; blocks: number; need: number; say: string; sayT: number } | null, g = this.tdG; g.clear();
    if (!td) { this.tdSay.setVisible(false); this.tdTags.forEach((t) => t.setVisible(false)); return; }
    const VW = this.fit.vw, G = tdGeo(), now = this.t;
    // пол и стены
    g.fillStyle(0x0b1512, 1); g.fillRect(-300, 0, VW + 600, VH);
    g.fillStyle(0x2a2620, 1); g.fillRect(G.x0, G.lanes[0]!.y0, G.x1 - G.x0, G.lanes[2]!.y1 - G.lanes[0]!.y0);
    G.lanes.forEach((ln, i) => {
      for (let x = G.x0; x < G.x1; x += 32) { g.fillStyle((x / 32 + i) % 2 ? 0x312c25 : 0x2a2620, 1); g.fillRect(x, ln.y0, 32, ln.y1 - ln.y0); }
      if (i === td.lane && (td.state === 'tele' || td.state === 'walk' || td.state === 'feint')) { g.fillStyle(0xff6a4a, td.state === 'tele' ? 0.18 + Math.sin(now * 14) * 0.08 : td.state === 'feint' ? 0.3 + Math.sin(now * 26) * 0.12 : 0.07); g.fillRect(G.x0, ln.y0, G.x1 - G.x0, ln.y1 - ln.y0); }
    });
    for (const wl of G.walls) { g.fillStyle(0x5a6a62, 1); g.fillRect(wl.x, wl.y, wl.w, wl.h); g.fillStyle(0x7f9087, 1); g.fillRect(wl.x, wl.y, wl.w, 3); }
    // старт и выход
    g.fillStyle(0x67ad62, 0.25); g.fillRect(G.x0, G.lanes[0]!.y0, 40, G.lanes[2]!.y1 - G.lanes[0]!.y0);
    g.fillStyle(0xd23a2a, 0.35 + Math.sin(now * 4) * 0.1); g.fillRect(G.x1 - 14, G.lanes[0]!.y0, 14, G.lanes[2]!.y1 - G.lanes[0]!.y0);
    // Миша сверху: рука скользит по стене коридора
    const ln = G.lanes[td.lane]!, my = (ln.y0 + ln.y1) / 2 + 10, mx = td.mx;
    const showM = td.state !== 'intro' && td.state !== 'win';
    if (showM) {
      g.lineStyle(2, 0x9aa39f, 0.5); for (let k = 0; k < 6; k++) { const sx = mx - 20 - k * 14; if (sx > G.x0) g.lineBetween(sx, ln.y0 + 2, sx - 8, ln.y0 + 6); }
      g.lineStyle(7, 0x4f5b78, 1); g.lineBetween(mx + 6, my - 10, mx + 14, ln.y0 + 4);
      g.fillStyle(0x7c86a0, 1); g.fillCircle(mx + 14, ln.y0 + 5, 5);
      g.fillStyle(0xe08a2c, 1); g.fillRoundedRect(mx - 34, my - 14, 18, 28, 5);
      g.fillStyle(0x4f5b78, 1); g.fillCircle(mx, my, 20);
      g.fillStyle(0xc8463c, 1); g.fillCircle(mx + 2, my, 11); g.fillRect(mx - 14, my - 4, 8, 8);
      if (td.state === 'blocked') { g.fillStyle(0xffe3a3, 0.9); for (let k = 0; k < 4; k++) g.fillCircle(mx + Math.cos(now * 6 + k * 1.6) * 26, my + Math.sin(now * 6 + k * 1.6) * 26, 2.5); }
    }
    // игроки сверху
    w.players.forEach((p, i) => {
      const tx = p['tdx'] as number | undefined, ty = p['tdy'] as number;
      if (tx == null) return;
      g.fillStyle(0x000000, 0.35); g.fillEllipse(tx + 2, ty + 4, 26, 18);
      g.fillStyle(p.pal.cloak, 1); g.fillCircle(tx, ty, 12);
      g.fillStyle(MASK, 1); g.fillCircle(tx + p.face * 3, ty - 1, 6.5);
      g.lineStyle(1.6, MASK, 1); g.lineBetween(tx - 3, ty - 6, tx - 9, ty - 14); g.lineBetween(tx + 3, ty - 6, tx + 6, ty - 15);
      this.tdTags[i]!.setText(p.pal.tag).setPosition(tx, ty + 20).setVisible(true);
    });
    const say = td.sayT > 0 && td.say && showM;
    this.tdSay.setVisible(!!say); if (say) this.tdSay.setText(td.say).setPosition(clamp(mx, 140, VW - 140), ln.y0 - 20);
    this.tdInfo.setText(`Не пропусти Мишу! Встань у него на пути в подсвеченном коридоре.   Остановлено: ${td.blocks} из ${td.need}`);
  }

  override update(_time: number, delta: number): void {
    this.t += delta / 1000;
    const h = this.registry.get('hud') as { world: World } | undefined;
    const g = this.hud; g.clear();
    const gs = h?.world;
    this.vignette.setVisible(!!gs);
    if (!gs) { this.names.forEach((n) => n.setVisible(false)); this.beadTxt.setVisible(false); return; }
    if (this.worldKey !== gs.seed + gs.players.length * 1e10) { this.worldKey = gs.seed + gs.players.length * 1e10; this.names.forEach((n) => n.destroy()); this.names = []; }
    const VW = this.fit.vw;
    if (gs.td && this.tdLayer.visible) this.drawTD(gs);
    while (this.names.length < gs.players.length) {
      const i = this.names.length, p = gs.players[i]!;
      this.names.push(this.add.text(i === 0 ? 72 : VW - 72, 20, p.pal.name, { fontFamily: DISPLAY, fontSize: '20px', color: p.pal.hex, fontStyle: '700' }).setOrigin(i === 0 ? 0 : 1, 0));
    }
    gs.players.forEach((p, i) => {
      const left = i === 0, sx = left ? 40 : VW - 40, dir = left ? 1 : -1;
      // катушка нити
      const full = p.silk >= gs.silkMax;
      g.fillStyle(0x0b1714, 0.85); g.fillCircle(sx, 38, 22);
      g.lineStyle(2, 0x3c5a50, 1); g.strokeCircle(sx, 38, 22);
      if (p.silk > 0) {
        g.fillStyle(p.pal.cloak, full ? 0.9 + Math.sin(this.t * 6) * 0.1 : 0.85);
        g.beginPath(); g.moveTo(sx, 38); g.arc(sx, 38, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.silk / gs.silkMax), false); g.closePath(); g.fillPath();
      }
      g.fillStyle(MASK, 1); g.fillEllipse(sx, 38, 13, 12); g.fillStyle(INK, 1); g.fillEllipse(sx + 1, 39, 2.4, 4.5); g.fillEllipse(sx + 4, 39, 2.4, 4.5);
      if (full) { g.lineStyle(2, p.pal.accent, 0.5 + Math.sin(this.t * 6) * 0.4); g.strokeCircle(sx, 38, 26); }
      // бутоны здоровья
      for (let k = 0; k < p.maxHp; k++) {
        const hx = sx + dir * (40 + k * 20), hy = 54;
        if (k < p.hp) { g.fillStyle(MASK, 1); g.fillEllipse(hx, hy, 12, 16); g.fillStyle(p.pal.cloak, 1); g.fillTriangle(hx - 4, hy - 6, hx + 4, hy - 6, hx, hy - 11); }
        else { g.lineStyle(1.5, 0x4a5a52, 1); g.strokeEllipse(hx, hy, 12, 16); }
      }
      const nm = this.names[i]!; nm.setVisible(true).setText(p.downed ? `${p.pal.name} · в коконе` : p.pal.name);
      // дымовухи
      if (gs.L.crates) for (let k = 0; k < 3; k++) {
        const bx = sx + dir * (40 + k * 18), by = 78;
        if (k < p.bombs) { g.fillStyle(0x3a3f45, 1); g.fillCircle(bx, by, 6); g.fillStyle(0xffd47a, 1); g.fillCircle(bx + 3, by - 7, 2); }
        else { g.lineStyle(1.5, 0x4a5a52, 1); g.strokeCircle(bx, by, 6); }
      }
      this.drawToolBadge(g, gs, p, sx, i);
      this.drawKitIcons(g, gs, p, i);
    });
    // последний бутон — края экрана пульсируют красным
    const me = gs.players[0];
    if (me && !me.downed && me.hp === 1 && !gs.won) {
      const a = 0.18 + Math.sin(this.t * 5) * 0.1;
      for (let i = 0; i < 6; i++) { g.lineStyle(14 - i * 2, 0xd23a2a, a * (1 - i / 6)); g.strokeRect(i * 7, i * 7, VW - i * 14, VH - i * 14); }
    }
    // бусины
    g.fillStyle(0xffd47a, 0.25); g.fillCircle(26, VH - 24, 10); g.fillStyle(0xffe3a3, 1); g.fillCircle(26, VH - 24, 5);
    this.beadTxt.setVisible(true).setText(String(gs.beads));
    // полоса босса
    if (this.bossOn) {
      this.bossShown += (this.bossFrac - this.bossShown) * Math.min(1, delta / 120);
      const w = 420, x = VW / 2 - w / 2, y = VH - 36;
      g.fillStyle(0x0b1714, 0.9); g.fillRect(x - 3, y - 3, w + 6, 14);
      g.fillStyle(0x6b2a22, 1); g.fillRect(x, y, w * this.bossShown, 8);
      g.fillStyle(0xff9a3c, 1); g.fillRect(x, y, w * this.bossFrac, 8);
      g.fillStyle(0xf4efe0, 0.85); g.fillRect(x + w / 2 - 1, y - 4, 2, 16);
    }
    void P;
  }

  /** значки приёмов набора игрока (теневой рывок, вспышка, кристальный рывок): готовность, откат и заряд */
  private drawKitIcons(g: G, gs: World, p: World['players'][number], i: number): void {
    if (p.remote) return;
    const list = kitHud(gs, p); if (!list.length) return;
    const dir = i === 0 ? 1 : -1, x0 = (i === 0 ? 40 : this.fit.vw - 40) + dir * (p['toolId'] ? 36 : 0), cy = 94, R = 10;
    list.forEach((ic, k) => {
      const cx = x0 + dir * k * 27, col = ABILS[ic.id].col;
      g.fillStyle(0x0b1714, 0.85); g.fillCircle(cx, cy, R + 2);
      const c = ic.ready || ic.active ? col : 0x6f8f83, a = ic.ready ? 1 : 0.8;
      g.lineStyle(2, c, a); g.fillStyle(c, a);
      if (ic.id === 'shadow') { g.strokeCircle(cx, cy, 6); g.fillStyle(0x140a2a, 1); g.fillCircle(cx + 1, cy, 4); g.lineStyle(1.5, c, 0.8); g.lineBetween(cx - 9, cy - 3, cx - 5, cy - 3); g.lineBetween(cx - 10, cy + 2, cx - 6, cy + 2); }
      else if (ic.id === 'flash') { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]] as const) g.lineBetween(cx + dx * 2.5, cy + dy * 2.5, cx + dx * 8, cy + dy * 8); g.fillCircle(cx, cy, 2); }
      else { g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 5, cy - 2); g.lineTo(cx + 3, cy + 7); g.lineTo(cx - 3, cy + 7); g.lineTo(cx - 5, cy - 2); g.closePath(); g.strokePath(); g.fillStyle(c, 0.35); g.fillTriangle(cx, cy - 8, cx + 5, cy - 2, cx - 5, cy - 2); }
      // откат (убывающий тёмный сектор) или заряд (растущая дуга)
      if (ic.id === 'crystal' && ic.active && !ic.ready) { g.lineStyle(2.5, 0xffffff, 0.9); g.beginPath(); g.arc(cx, cy, R + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ic.frac, false); g.strokePath(); }
      else if (ic.frac > 0 && !ic.ready) { g.fillStyle(0x000000, 0.6); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ic.frac, false); g.closePath(); g.fillPath(); }
      else if (ic.ready) { g.lineStyle(1.5, col, 0.9); g.strokeCircle(cx, cy, R + 2); }
    });
  }

  /** значок инструмента под катушкой нити (tools.js) */
  private drawToolBadge(g: G, gs: World, p: World['players'][number], sx: number, i: number): void {
    const toolId = p['toolId'] as string | undefined; if (!toolId) return;
    const T_ = TOOLS[toolId]; if (!T_) return;
    const cost = T_.cost, cdMax = T_.cd;
    const cx = i === 0 ? 40 : this.fit.vw - 40, cy = 94, R = 13, can = p.silk >= cost, cd = Math.max(0, (p['toolCd'] as number) || 0), frac = cdMax ? Math.min(1, cd / cdMax) : 0;
    void sx;
    g.fillStyle(0x0b1714, 0.85); g.fillCircle(cx, cy, R + 2);
    const col = frac > 0 ? 0x6f8f83 : can ? 0xf4efe0 : 0x8a4a42;
    g.lineStyle(2, col, 1); g.fillStyle(col, 1);
    if (toolId === 'throwneedle') { g.lineBetween(cx - 7, cy + 7, cx + 7, cy - 7); g.fillTriangle(cx + 8, cy - 8, cx + 3, cy - 6, cx + 6, cy - 3); g.lineStyle(1, col, 0.6); g.lineBetween(cx - 7, cy + 7, cx - 11, cy + 11); }
    else if (toolId === 'trap') { g.fillRect(cx - 8, cy + 3, 16, 3); for (let k = 0; k < 4; k++) g.fillTriangle(cx - 8 + k * 4, cy + 3, cx - 4 + k * 4, cy + 3, cx - 6 + k * 4, cy - 5); }
    else if (toolId === 'threadbomb') { g.strokeCircle(cx, cy + 2, 6); g.lineBetween(cx + 3, cy - 3, cx + 6, cy - 8); g.fillCircle(cx + 7, cy - 9, 1.6); }
    else if (toolId === 'hook') { g.beginPath(); g.moveTo(cx - 8, cy + 8); g.lineTo(cx - 1, cy - 4); g.strokePath(); g.beginPath(); g.arc(cx + 3, cy - 5, 5, Math.PI * 0.9, Math.PI * 2.2, false); g.strokePath(); }
    else if (toolId === 'spirit') { g.fillCircle(cx + 3, cy, 4); g.lineStyle(2, col, 0.7); g.lineBetween(cx - 8, cy - 3, cx - 2, cy - 1); g.lineBetween(cx - 8, cy + 3, cx - 2, cy + 1); }
    else if (toolId === 'dive') { g.lineBetween(cx, cy - 8, cx, cy + 3); g.fillTriangle(cx - 6, cy + 1, cx + 6, cy + 1, cx, cy + 9); }
    else if (toolId === 'wraith') { g.lineBetween(cx, cy + 8, cx, cy - 7); g.lineStyle(1.5, col, 0.8); g.lineBetween(cx - 5, cy + 7, cx - 3, cy - 4); g.lineBetween(cx + 5, cy + 7, cx + 3, cy - 4); g.fillTriangle(cx - 4, cy - 5, cx + 4, cy - 5, cx, cy - 10); }
    else g.fillCircle(cx, cy, 4);
    // перезарядка: тёмный сектор убывает по часовой, снаружи — дуга готовности
    if (frac > 0) {
      g.fillStyle(0x000000, 0.62); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false); g.closePath(); g.fillPath();
      g.lineStyle(2, p.pal.accent, 0.9); g.beginPath(); g.arc(cx, cy, R + 2, -Math.PI / 2 + Math.PI * 2 * frac, Math.PI * 1.5, false); g.strokePath();
    } else { g.lineStyle(2, can ? p.pal.accent : 0x8a4a42, can ? 0.9 : 0.7); g.strokeCircle(cx, cy, R + 2); }
    // стоимость: точки нити
    for (let k = 0; k < cost; k++) { const dx = cx + (k - (cost - 1) / 2) * 8, filled = p.silk > k; g.fillStyle(filled ? p.pal.cloak : 0x2b3b35, 1); g.fillCircle(dx, cy + R + 8, 2.8); }
    void gs;
  }
}
