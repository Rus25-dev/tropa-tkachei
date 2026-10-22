// Нырок (навык нити, Desolate Dive): в воздухе — камнем вниз, удар оземь волной. Падение ведёт ядро (kit/moves.ts),
// удары — kit/spells.ts; гость шлёт удары хосту сообщениями 'tool' с id 'divestrike' и 'diveland'.
import { KIT } from '../../core/balance';
import { diveBegin } from '../abilities/dive';
import { diveLand, diveLandHit, diveStrikeHit } from '../../core/kit/spells';
import { defineTool } from '../../core/tool-kit';
import { toolOwner } from '../../core/tools';

export default defineTool({
  id: 'dive', order: 4, name: 'Нырок', desc: 'В воздухе: падаете камнем и неуязвимы, пока не приземлитесь. Удар оземь даёт волну на 110 px в стороны (урон 3 и боссу, и врагам, ломает броню, сбивает снаряды). С земли бьёт сразу. Стоит 3 нити.',
  cost: KIT.DIVE.COST, cd: KIT.DIVE.CD, unlock: 'shop:100', nominalDmg: KIT.DIVE.LAND_DMG + KIT.DIVE.STRIKE,
  use: (sc, p) => {
    if (p['dv']) return false;
    if (p.onGround) { diveLand(sc, p); return true; } // с земли нырок сразу бьёт оземь
    diveBegin(sc, p); return true;
  },
  msgs: {
    divestrike: (sc, m) => diveStrikeHit(sc, toolOwner(sc, m.i), m.x, m.y),
    diveland: (sc, m) => diveLandHit(sc, toolOwner(sc, m.i), m.x, m.y),
  },
});
