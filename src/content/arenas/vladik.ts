// Арена Владика — кабинет музыки (уровень ArenaVladik, точка — сущность Vladik).
import { defineArena } from '../../core/arena-kit';

export default defineArena({ id: 'vladik', order: 1, name: 'Кабинет музыки', ldtk: 'ArenaVladik', spot: (L) => L.vladik });
