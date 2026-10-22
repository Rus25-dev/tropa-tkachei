// Сигналы атак из данных. Разные семейства имеют разную огибающую и тембр;
// варианты внутри семейства различаются высотой. Регистрация не зависит от ядра боя.
import { defineSounds, type SoundDef } from '../regs';

const sounds: Record<string, SoundDef['play']> = {};
function family(names: string[], play: (s: Parameters<SoundDef['play']>[0], pitch: number) => void): void {
  names.forEach((id, i) => { sounds[id] = (s) => play(s, 1 + i * .055); });
}
family(['swing', 'slash1', 'slash2', 'slash3', 'claw', 'claw2', 'backhand', 'brush', 'flick', 'sweep', 'rend', 'spin', 'snap'], (s, p) => {
  s.hiss(.16, .12, 1800 * p, 1.2); s.tone('triangle', 680 * p, 260 * p, .14, .055);
});
family(['thrust', 'thrust1', 'thrust2', 'dash1', 'dash2', 'whoosh', 'whoosh1', 'whoosh2', 'swoop', 'plunge'], (s, p) => {
  s.hiss(.2, .13, 2700 * p, 1.4); s.tone('square', 960 * p, 360 * p, .12, .04);
});
family(['crush', 'rumble', 'rumble2', 'press', 'shove', 'stamp', 'slap', 'hurl'], (s, p) => {
  s.tone('sine', 100 * p, 45 * p, .3, .12); s.hiss(.2, .11, 320 * p, .7);
});
family(['beam', 'laser_on', 'grid_on', 'hum', 'swell', 'charge', 'glitch'], (s, p) => {
  s.tone('sawtooth', 160 * p, 720 * p, .28, .055); s.tone('sine', 480 * p, 1440 * p, .28, .04);
});
family(['seal', 'talisman', 'chime', 'ring', 'card', 'pyre', 'pyre_l', 'pyre_r'], (s, p) => {
  s.tone('sine', 880 * p, 880 * p, .24, .085); s.tone('triangle', 1320 * p, 1760 * p, .18, .04);
});
family(['hop', 'leap', 'vault', 'rise', 'wings'], (s, p) => {
  s.hiss(.18, .1, 1000 * p, .8); s.tone('triangle', 300 * p, 620 * p, .15, .06);
});
family(['dictate', 'letter', 'letter_long', 'whistle'], (s, p) => {
  s.tone('triangle', 520 * p, 780 * p, .16, .065); s.hiss(.09, .065, 2200 * p, 2);
});
family(['screech', 'screech_air', 'roar_triple', 'appear', 'vanish'], (s, p) => {
  s.hiss(.25, .12, 1600 * p, .9); s.tone('sawtooth', 340 * p, 130 * p, .25, .055);
});
sounds.tellParry = (s) => { s.tone('sine', 1320, 1320, .12, .035); };
sounds.tellDodge = (s) => { s.tone('triangle', 880, 440, .16, .045); };
sounds.tellUnblockable = (s) => { s.tone('square', 220, 220, .1, .035); s.later([110], () => s.tone('square', 220, 220, .1, .035)); };
export default defineSounds(sounds);
