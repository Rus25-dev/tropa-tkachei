// Общие правила отмены действий; приёмы содержимого подключаются через moveReg.
import type { Player } from './types';
import type { World } from './world';
import { moveReg } from './plugin/regs';

export type PlayerAction = 'attack' | 'parry' | 'heal' | 'burst';
export type PlayerActionState = 'downed' | 'hurt' | 'heal' | 'execute' | 'move' | 'dash' | 'attack' | 'ready';
export function actionState(p: Player): PlayerActionState {
  if (p.downed) return 'downed';
  if (p.hurtT > 0) return 'hurt';
  if (p['healCh'] > 0) return 'heal';
  if (p['execT'] > 0) return 'execute';
  if (p['hk'] || p['ledge'] || moveReg.list().some((m) => m.busy?.(p))) return 'move';
  if (p.dashT > 0) return 'dash';
  return p.atkT > 0 ? 'attack' : 'ready';
}
export function canStartAction(p: Player, action: PlayerAction): boolean {
  const state = actionState(p);
  if (p.sit || !['ready', 'attack'].includes(state)) return false;
  return action !== 'attack' || p.atkCd <= 0;
}
/** Отмена от урона/смерти/возрождения: ни один модуль не продолжает старое действие. */
export function cancelPlayerActions(sc: World, p: Player): void {
  for (const m of moveReg.list()) if (m.busy?.(p) || m.active?.(p)) m.cancel?.(sc, p, { holding: !!p.inp?.dash });
  if (p['chgSnd']) sc.emit('chargeSnd', { i: p.i, on: false });
  p.atkT = 0; p.atkHits = null; p['sw'] = null; p['chg'] = 0; p['chgSnd'] = null;
  p['chgLock'] = !!p.inp?.atk; p['hk'] = null; p['ledge'] = null; p['gliding'] = false;
  p['parryT'] = 0; p['counterT'] = 0; p['counterHit'] = false; p['healCh'] = 0; p.healT = 0; p['kgF'] = 0;
}

export function resetPlayerActions(sc: World, p: Player): void {
  cancelPlayerActions(sc, p);
  for (const key of ['parryCd', 'atkBuf', 'dashBuf', 'comboT', 'combo', 'execT', 'chgWait', 'silkAcc', 'counterFx']) p[key] = 0;
  p['chgLock'] = false; p.atkCd = 0; p.dashCd = 0; p.jumpBuf = 0;
  p.raw = {}; p.pend = {}; p.carry = {}; p.inp = {}; p.prev = {};
}
