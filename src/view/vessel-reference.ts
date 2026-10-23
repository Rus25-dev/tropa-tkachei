import Phaser from 'phaser';
import type { Boss } from '../core/types';
import type { DState } from '../core/boss/exec';
import { bossDef } from '../core/boss/registry';
import { boxRect } from '../core/boss/exec';

interface Frame { x: number; y: number; w: number; h: number; left: number; right: number; bottom: number; top: number }
interface Clip { fps: number; frames: number[]; loop: boolean }
interface Reference { image: string; frames: Record<string, Frame>; clips: Record<string, Clip>; footY: number; unitScale: number }
const files = import.meta.glob<Reference>('./reference-assets/vessel.json', { eager: true, import: 'default' });
const ref = Object.values(files)[0];
const KEY = 'vessel-reference';

/** Необязательный локальный слой: отсутствие ассетов оставляет процедурную графику. */
export class VesselReferenceView {
  private images = new Map<Boss, Phaser.GameObjects.Image>();
  private plumes = new Map<Boss, Phaser.GameObjects.Image[]>();
  constructor(private scene: Phaser.Scene) {
    if (!ref || scene.textures.exists(KEY)) return;
    scene.textures.once('addtexture-' + KEY, (texture: Phaser.Textures.Texture) => {
      for (const [id, f] of Object.entries(ref.frames)) texture.add(id, 0, f.x, f.y, f.w, f.h);
    });
    scene.textures.addBase64(KEY, ref.image);
  }
  clear(): void {
    for (const image of this.images.values()) image.destroy(); this.images.clear();
    for (const images of this.plumes.values()) for (const image of images) image?.destroy(); this.plumes.clear();
  }
  draw(b: Boss, now: number): boolean {
    const d = b['d'] as DState | undefined;
    if (!ref || d?.id !== 'vessel' || !this.scene.textures.exists(KEY) || !this.scene.textures.get(KEY).has('74')) return false;
    const a = bossDef('vessel')!.attacks.find((x) => x.id === d.atk);
    const af = Math.max(0, d.af - 1), t = af - (a?.tell.frames ?? 0);
    const end = Math.max(-1, ...(a?.active.map((hit) => hit.to) ?? []));
    let name = 'Idle', frame = now * 60;
    if (b.state === 'dead') { name = 'Stun Land'; frame = 0; }
    else if (b.stagger > 0) { name = 'Stun Land'; frame = 0; }
    else if (b.state === 'intro') { name = 'Intro 7'; }
    else if (d.atk && ['tell', 'active', 'recover'].includes(b.state)) {
      frame = b.state === 'tell' ? af : b.state === 'recover' ? Math.max(0, t - end - 1) : Math.max(0, t);
      switch (d.atk) {
        case 'triple':
          if (b.state === 'tell') name = 'Slash1 Antic';
          else if (t <= 5) name = 'Slash1';
          else if (t < 16) { name = 'Slash1 Recover'; frame = t - 6; }
          else if (t <= 18) { name = 'Slash2'; frame = t - 16; }
          else if (t < 29) { name = 'Slash2 Recover'; frame = t - 19; }
          else if (t <= 31) { name = 'Slash3'; frame = t - 29; }
          else { name = 'Recover'; frame = t - 32; }
          break;
        case 'pillars':
          if (b.state === 'tell' && af < 12) name = 'Tele In';
          else if (b.state === 'tell') { name = 'DStab Antic'; frame = af - 12; }
          else if (t <= 0 && !b.onGround) name = 'DStab Stomp';
          else if (t < 9) name = 'DStab Land';
          else if (t < 34) { name = 'Idle'; frame = 0; }
          else { name = 'Recover'; frame = t - 34; }
          break;
        case 'lunge': name = b.state === 'tell' ? 'Dash Antic' : b.state === 'active' ? 'Dash' : 'Dash Recover'; break;
        case 'daggers': name = b.state === 'tell' ? 'SmallShot Antic' : b.state === 'active' ? 'SmallShot' : 'SmallShot Recover'; break;
        case 'guard': name = b.state === 'tell' ? 'Counter Antic' : b.state === 'active' ? 'Counter Ready' : 'Counter End'; break;
        case 'cut3': name = b.state === 'tell' ? 'Counter Slash Antic' : b.state === 'active' ? 'Slash3' : 'Recover'; break;
        case 'focus': name = b.state === 'tell' ? 'Focus Antic' : b.state === 'active' ? 'Focus Burst' : 'Recover'; break;
        case 'tendrils':
          name = b.state === 'recover' ? 'SmallShot Recover' : af < 16 ? 'SmallShot Antic' : 'SmallShot';
          if (b.state === 'tell' && af >= 16) frame = af - 16;
          break;
        case 'backstep': name = b.state === 'tell' ? 'Evade Antic' : b.state === 'active' ? 'Evade' : 'Evade Recover'; break;
        case 'hop': name = 'Jump'; break;
      }
    }
    const clip = ref.clips[name] ?? ref.clips['Idle']!;
    const n = Math.floor(Math.max(0, frame) * clip.fps / 60);
    const id = clip.frames[clip.loop ? n % clip.frames.length : Math.min(clip.frames.length - 1, n)]!;
    const f = ref.frames[String(id)]!;
    let image = this.images.get(b);
    if (!image) { image = this.scene.add.image(0, 0, KEY, String(id)).setOrigin(0, 0).setDepth(4.1); this.images.set(b, image); }
    const scale = ref.unitScale;
    image.setFrame(String(id)).setFlipX(b.face < 0).setDisplaySize((f.right - f.left) * scale, (f.top - f.bottom) * scale);
    image.setPosition(b.x + b.w / 2 + (b.face < 0 ? -f.right : f.left) * scale, b.y + b.h - (f.top - ref.footY) * scale);
    image.setAlpha(b.state === 'dead' ? Math.max(0, b.t / (bossDef('vessel')!.deathFrames / 60)) : 1);
    if (b.flash > 0) image.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else image.clearTint();
    const plumes = this.plumes.get(b) ?? [];
    this.plumes.set(b, plumes);
    for (const plume of plumes) plume?.setVisible(false);
    if (d.atk === 'pillars' && b.stagger <= 0 && ['active', 'recover'].includes(b.state)) {
      const peak = ref.frames['55']!;
      for (const [i, hit] of (a?.active ?? []).entries()) {
        if (hit.previewFrom === undefined || t < hit.previewFrom || t >= 79) continue;
        const burst = t >= 34, clip = ref.clips[burst ? 'Plume Burst' : 'Plume Antic']!;
        const n = Math.floor((burst ? t - 34 : t - hit.previewFrom) * clip.fps / 60);
        const id = clip.frames[burst ? Math.min(n, clip.frames.length - 1) : n % clip.frames.length]!;
        const f = ref.frames[String(id)]!, r = boxRect(b, d.dir, hit.hit, d.lock);
        const sx = r.w / (peak.right - peak.left), sy = r.h / (peak.top - peak.bottom);
        const plume = plumes[i] ?? (plumes[i] = this.scene.add.image(0, 0, KEY).setOrigin(0).setDepth(4.2));
        plume.setVisible(true).setFrame(String(id));
        plume.setDisplaySize((f.right - f.left) * sx, (f.top - f.bottom) * sy);
        plume.setPosition(r.x + r.w / 2 + (f.left - (peak.left + peak.right) / 2) * sx, r.y + r.h - (f.top - peak.bottom) * sy);
      }
    }
    return true;
  }
}
