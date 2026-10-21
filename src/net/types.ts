// Сетевой слой: интерфейсы транспорта и часов. Модули net/ не знают про игру: транспорт (PeerJS, заглушка в тестах) и время
// подменяются, поэтому надёжный канал проверяется в Node на виртуальном времени.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Msg = Record<string, any>;

/** Соединение с одним собеседником (обёртка над DataConnection PeerJS или заглушка) */
export interface Conn {
  onData: ((d: any) => void) | null;
  onClose: (() => void) | null;
  readonly open: boolean;
  send(o: unknown): void;
  close(): void;
}
export interface Closable { close(): void }
export interface ListenHandlers { onOpen(): void; onConn(c: Conn): void; onError(e: { type?: string }): void }
export interface DialHandlers { onOpen(c: Conn): void; onError(e: { type?: string }): void }
export interface Transport {
  /** занять id у сервера-знакомителя и принимать входящие соединения */
  listen(id: string, h: ListenHandlers): Closable;
  /** позвонить по id */
  dial(id: string, h: DialHandlers): Closable;
}
/** Часы, таймеры и случайные числа — подменяются в тестах */
export interface Env {
  now(): number;
  setTimeout(f: () => void, ms: number): unknown;
  clearTimeout(t: unknown): void;
  setInterval(f: () => void, ms: number): unknown;
  clearInterval(t: unknown): void;
  rand(): number;
  /** настенные часы в мс (для сверки времени между участниками гонки) */
  wall?(): number;
}
export const defaultEnv = (): Env => ({
  now: () => performance.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t as number),
  setInterval: (f, ms) => setInterval(f, ms), clearInterval: (t) => clearInterval(t as number), rand: () => Math.random(), wall: () => Date.now(),
});

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** код комнаты: пять знаков без похожих (0/O, 1/I/L) */
export function makeCode(rand: () => number = Math.random): string { let s = ''; for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]; return s; }
/** личный ключ места в комнате: по нему игрок возвращается на то же место после обрыва или перезагрузки */
export function makeKey(rand: () => number = Math.random): string { let s = ''; for (let i = 0; i < 16; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]; return s; }
export const cleanCode = (code: string): string => String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
/** пространство имён id на сервере-знакомителе: кооп, гонка 1×1 и «Гонки Ткачей» не мешают друг другу */
export type Ns = 'coop' | 'race';
export const peerId = (code: string, ns: Ns = 'race'): string => (ns === 'coop' ? 'tropa-tkachei-' : 'tropa-race-') + cleanCode(code);
