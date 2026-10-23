import { defineArena } from '../../core/arena-kit';

export default defineArena({ id: 'vessel', order: 5, name: 'Святилище Тишины', ldtk: 'ArenaKeeper', spot: (L) => L.boss });
