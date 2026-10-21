// Окно «Вдвоём по сети»: создать комнату (код и ссылка для напарника) или войти по коду.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CampState } from '../core/campaign';
import type { Online } from '../app/online';
import { Panel } from './kit';

export interface LobbyReq { role: 'host' | 'join'; mode: 'story' | 'bosstest'; camp?: CampState | null; boss?: string; fresh: boolean; code?: string }

export function Lobby({ online, req, crumbs, onBack }: { online: Online; req: LobbyReq; crumbs: string[]; onBack: () => void }) {
  const [, bump] = useState(0);
  const [code, setCode] = useState(req.code ?? '');
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => online.subscribe(() => bump((n) => n + 1)), [online]);
  useEffect(() => {
    if (req.role === 'host') online.hostRoom(req.mode, req.camp, req.boss, req.fresh);
    else if (req.code) online.joinRoom(req.code);
    return () => { if (!online.state.connected) online.leave(); };
  }, []);
  const st = online.state;
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(st.link ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { input.current?.focus(); }
  };
  const title = req.mode === 'bosstest' ? 'Босс-тест по сети' : 'Вдвоём по сети';
  return (
    <Panel crumbs={[...crumbs, req.role === 'host' ? 'Создать комнату' : 'Войти по коду']} onBack={() => { online.leave(); onBack(); }} digits={false} hint={{ act: 'нажать' }} label={title} cls="lobby">
      <div class="st-page lb">
        <h2 class="scr-t">{title}</h2>
        <p class="lead">Соединение идёт напрямую между браузерами (PeerJS). Один создаёт комнату, второй входит по коду или ссылке.</p>
        {req.role === 'host' ? (
          <div class="lb-hostbox">
            <span class="lbl">Код комнаты</span>
            <span class="lb-code" data-testid="lb-code">{st.code ?? '·····'}</span>
            <span class="lb-link" data-testid="lb-link">{st.link}</span>
            <div class="row"><button type="button" class="btn" id="lb-copy" onClick={copy}>{copied ? 'Скопировано' : 'Копировать ссылку'}</button></div>
          </div>
        ) : (
          <div class="lb-join">
            <span class="lbl">Код от друга</span>
            <div class="row">
              <input ref={input} id="lb-code-in" data-testid="lb-code-in" maxLength={6} autocomplete="off" spellcheck={false} placeholder="ABCDE" aria-label="Код комнаты" value={code}
                onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') online.joinRoom(code); }} />
              <button type="button" class="btn primary" id="lb-join" onClick={() => online.joinRoom(code)}>Войти</button>
            </div>
          </div>
        )}
        <div id="lb-status" role="status" class={`lb-status ${st.kind}`} data-testid="lb-status">{st.status}</div>
      </div>
    </Panel>
  );
}
