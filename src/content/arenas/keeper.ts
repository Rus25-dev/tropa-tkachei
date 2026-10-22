// Геометрия дуэльного зала: свободный пол без платформ для стояния вне досягаемости.
import { defineArena } from '../../core/arena-kit';

export default defineArena({ id: 'keeper', order: 4, name: 'Зал Неразрывной Клятвы', ldtk: 'ArenaKeeper', spot: (L) => L.boss });
