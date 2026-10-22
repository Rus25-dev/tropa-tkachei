// Арена Тимы — берлога (уровень ArenaTima, точка — сущность Tima; мебель — сущности Furniture).
import { defineArena } from '../../core/arena-kit';

export default defineArena({ id: 'tima', order: 2, name: 'Берлога Тимы', ldtk: 'ArenaTima', spot: (L) => L.tima });
