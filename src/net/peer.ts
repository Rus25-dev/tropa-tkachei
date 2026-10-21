// Транспорт PeerJS/WebRTC для надёжного канала (хаб и клиент). Публичный сервер-знакомитель PeerJS; iceServers берутся из data/net.json.
// Для проверки на своём сервере: ?peer=хост:порт (локальный peerjs-server без шифрования).
import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import netCfg from '../data/net.json';
import type { Closable, Conn, DialHandlers, ListenHandlers, Transport } from './types';

export function peerOptions(search = typeof location === 'undefined' ? '' : location.search): PeerOptions {
  const h = new URLSearchParams(search).get('peer');
  const ice = (netCfg as { iceServers?: RTCIceServer[] }).iceServers ?? [];
  if (h) { const [host, port] = h.split(':'); return { host, port: Number(port) || 9000, path: '/', secure: false, debug: 1, config: { iceServers: [] } }; }
  return ice.length ? { debug: 1, config: { iceServers: ice } } : { debug: 1 };
}

function wrap(c: DataConnection): Conn {
  const w: Conn = {
    onData: null, onClose: null,
    get open() { return c.open; },
    send: (o) => { if (c.open) c.send(o); },
    close: () => { try { c.close(); } catch { /* уже закрыто */ } },
  };
  c.on('data', (d) => { w.onData?.(d); });
  c.on('close', () => { w.onClose?.(); });
  c.on('error', () => undefined);
  return w;
}

export const peerTransport: Transport = {
  listen(id: string, h: ListenHandlers): Closable {
    const peer = new Peer(id, peerOptions());
    peer.on('open', () => h.onOpen());
    peer.on('connection', (c) => h.onConn(wrap(c)));
    peer.on('error', (e) => h.onError({ type: (e as { type?: string }).type }));
    peer.on('disconnected', () => { if (!peer.destroyed) try { peer.reconnect(); } catch { /* сервер недоступен */ } });
    return { close() { try { peer.destroy(); } catch { /* уже закрыто */ } } };
  },
  dial(id: string, h: DialHandlers): Closable {
    const peer = new Peer(peerOptions());
    let done = false;
    peer.on('open', () => {
      const c = peer.connect(id, { reliable: true });
      c.on('open', () => { done = true; h.onOpen(wrap(c)); });
      c.on('error', (e) => { if (!done) h.onError({ type: (e as { type?: string }).type }); });
      c.on('close', () => { if (!done) h.onError({ type: 'closed' }); });
    });
    peer.on('error', (e) => { if (!done) h.onError({ type: (e as { type?: string }).type }); });
    return { close() { try { peer.destroy(); } catch { /* уже закрыто */ } } };
  },
};

/** понятный текст для ошибки соединения */
export function errText(e: { type?: string } | null | undefined): string {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'Комната не найдена. Проверьте код: хост должен держать окно открытым.';
  if (t === 'no-lib' || t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Нет связи с сервером комнат. Проверьте интернет.';
  if (t === 'browser-incompatible') return 'Этот браузер не поддерживает WebRTC. Подойдут Chrome, Edge, Firefox, Яндекс Браузер.';
  return 'Ошибка соединения: ' + (t || 'неизвестная') + '. Попробуйте ещё раз.';
}
