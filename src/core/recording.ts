// Запись партии сессии в журнал (для .ttrec и фаззера). Session сам пишет журнал только в забеге спидрана; здесь то же самое
// для обычных партий (бой, глава, коридор), в том числе для двух игроков.
// Правило разбиения: каждая сцена обычной партии — отдельная запись. Новая сцена (коридор → арена, «Дальше», «Заново») создаётся из сохранения
// главы на тот момент, а в журнале ввода сохранения нет, поэтому снимок сохранения (progress) кладётся рядом с записью и подаётся при воспроизведении.
// Забег спидрана (сохранение не читается) остаётся одним журналом из нескольких отрезков.
// Модуль не знает ни о DOM, ни о файлах: готовые записи отдаёт в onRotate.
import type { Progress } from './campaign';
import type { Journal } from './journal';
import { Recorder, type Session } from './session';

export interface RecordedRun { journal: Journal; progress: Progress | null }
export interface SessionRecorderOpts {
  ver: string;
  easy: boolean;
  /** вызывается, когда запись закончилась (сцена сменилась, «Заново»): состояние мира в этот момент ещё старое */
  onRotate?: (run: RecordedRun) => void;
}

const snap = (p: Progress | null): Progress | null => (p ? (JSON.parse(JSON.stringify(p)) as Progress) : null);

export class SessionRecorder {
  rec: Recorder;
  /** снимок сохранения, из которого создана первая сцена текущего журнала */
  progress: Progress | null;
  /** завершённые записи */
  readonly done: RecordedRun[] = [];
  private scenes = 1;

  constructor(private ses: Session, private o: SessionRecorderOpts) {
    // в забеге спидрана Session уже ведёт журнал сам (и сам начал первый отрезок)
    const own = !!ses.rec;
    this.rec = ses.rec ?? this.fresh();
    this.progress = ses.sr ? null : snap(ses.cfg.progress);
    if (!own) { ses.rec = this.rec; this.rec.begin(ses.world); }
    (ses.on['scene'] ??= []).push(() => this.onScene());
    const retry = ses.retry.bind(ses), after = ses.afterTicks.bind(ses);
    ses.retry = () => { if (!ses.sr) this.rotate(); retry(); };
    // новая сцена создаётся внутри afterTicks: запись надо сменить до этого, иначе сцена попадёт в старый журнал
    ses.afterTicks = () => { if (ses.world.next && !ses.sr) this.rotate(); after(); };
  }

  private fresh(): Recorder {
    return Recorder.start({ cat: null, seed: this.ses.world.seed, ver: this.o.ver, easy: this.o.easy, mem: true });
  }
  private rotate(): void {
    const run = { journal: this.rec.J, progress: this.progress };
    this.done.push(run); this.o.onRotate?.(run);
    this.rec = this.fresh(); this.ses.rec = this.rec; this.scenes = 0;
  }
  private onScene(): void {
    this.scenes++;
    if (this.rec.J.segs.length < this.scenes) this.rec.begin(this.ses.world); // два игрока: Session сам отрезок не начинает
    if (this.rec.J.segs.length === 1) { this.rec.J.seed = this.ses.world.seed >>> 0; this.progress = this.ses.sr ? null : snap(this.ses.cfg.progress); }
  }

  /** Текущий (незавершённый) журнал */
  get journal(): Journal { return this.rec.J; }
  /** сколько тиков записано в текущем журнале */
  ticks(): number { return this.rec.J.segs.reduce((s, g) => s + g.n, 0); }
}
