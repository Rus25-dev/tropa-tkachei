// Арена Миши — старая типография (уровень ArenaMisha, точка — сущность Misha; ящики «ДЫМ» — сущности Crate).
import { defineArena } from '../../core/arena-kit';

export default defineArena({ id: 'misha', order: 0, name: 'Старая типография', ldtk: 'ArenaMisha', spot: (L) => L.misha });
