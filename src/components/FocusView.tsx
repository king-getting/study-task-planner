// 专注视图：番茄钟计时 + 专注记录统计（设计为可长时间摆放的沉浸界面）
import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Check, X, Timer, Flame, CalendarCheck, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { today, toMin, fmtMin } from '@/lib/date';
import type { AppState } from '@/lib/types';
import { Button } from '@/components/ui/button';
import FocusHistory from '@/components/FocusHistory';

interface Props {
  state: AppState;
  refresh: () => Promise<void>;
  presetBlockId?: string | null;
}

const DURATIONS = [15, 25, 45, 60, 90];
const LS_KEY = 'focus-run';

interface RunState {
  blockId: string | null;
  title: string;
  durationMin: number;
  bankedMs: number;      // 暂停时累计的已专注时间
  resumedAt: number;     // 最近一次恢复计时的时刻
  phase: 'running' | 'paused';
  runId: string;         // 会话唯一标识：断线/刷新后重试不会重复保存
}

// 完成结果：保存状态对使用者全程可见，不会无声无息地消失
interface DoneState {
  minutes: number;
  saved: 'pending' | 'ok' | 'fail';
}

function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as RunState) : null;
  } catch {
    return null;
  }
}

// 提示音：两声柔和的"叮"
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = i === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.6);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.7);
    });
  } catch { /* 无音频环境时静默 */ }
}

export default function FocusView({ state, refresh, presetBlockId }: Props) {
  const [run, setRun] = useState<RunState | null>(() => loadRun());
  const [done, setDone] = useState<DoneState | null>(null);
  const [selBlockId, setSelBlockId] = useState<string>('');
  const [customTitle, setCustomTitle] = useState('');
  const [duration, setDuration] = useState(25);
  const [, setTick] = useState(0);

  const now = Date.now();
  const taskMap = useMemo(() => new Map(state.tasks.map(t => [t.id, t])), [state.tasks]);

  // 今日可选任务块
  const todayBlocks = useMemo(() => {
    return state.blocks
      .filter(b => b.date === today() && b.status === 'planned')
      .sort((a, b) => toMin(a.start) - toMin(b.start));
  }, [state.blocks]);

  // 所有进行中的任务（今天没排块时也能选，只记录时长）
  const activeTasks = useMemo(() => state.tasks.filter(t => t.status !== 'done'), [state.tasks]);

  // 预选（从今日页"专注"按钮跳入）
  useEffect(() => {
    if (presetBlockId && !run) {
      const b = todayBlocks.find(x => x.id === presetBlockId);
      if (b) {
        const t = taskMap.get(b.taskId);
        setSelBlockId(b.id);
        setDuration(Math.min(90, Math.max(15, Math.round(b.minutes / 15) * 15)));
        if (t) toast.info(`已为「${t.title.slice(0, 16)}」准备好专注`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetBlockId]);

  // 计时心跳
  useEffect(() => {
    if (!run || run.phase !== 'running') return;
    const timer = setInterval(() => setTick(x => x + 1), 500);
    return () => clearInterval(timer);
  }, [run]);

  // 持久化，刷新页面不丢
  useEffect(() => {
    if (run) localStorage.setItem(LS_KEY, JSON.stringify(run));
    else localStorage.removeItem(LS_KEY);
  }, [run]);

  // 已专注毫秒数
  const focusedMs = run ? run.bankedMs + (run.phase === 'running' ? now - run.resumedAt : 0) : 0;
  const totalMs = (run?.durationMin ?? duration) * 60000;
  const remainMs = Math.max(0, totalMs - focusedMs);

  // 自然到时自动进入"完成保存"流程
  const finishedRef = useRef(false);
  useEffect(() => {
    if (run && run.phase === 'running' && remainMs <= 0 && !finishedRef.current) {
      finishedRef.current = true;
      finishSession();
    }
    if (!run) finishedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainMs, run]);

  const CUSTOM = '__custom__';

  function start() {
    let blockId: string | null = null;
    let title = '自由专注';
    if (selBlockId === CUSTOM) {
      title = customTitle.trim() || '自定义专注';
    } else if (selBlockId.startsWith('task:')) {
      const t = taskMap.get(selBlockId.slice(5));
      title = t ? t.title : '自定义专注';
      // 该任务今天有已排块则抵扣，没有则只记录
      const blk = todayBlocks.find(b => b.taskId === selBlockId.slice(5));
      blockId = blk ? blk.id : null;
    } else if (selBlockId) {
      const block = todayBlocks.find(b => b.id === selBlockId);
      const t = block ? taskMap.get(block.taskId) : undefined;
      blockId = block ? block.id : null;
      title = t ? t.title : '自由专注';
    }
    setRun({
      blockId,
      title,
      durationMin: duration,
      bankedMs: 0,
      resumedAt: Date.now(),
      phase: 'running',
      runId: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `r${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
    });
  }

  // 结束并保存：保存状态全程可见；失败可重试，绝不无声丢失
  async function finishSession() {
    if (!run || done) return;
    const minutes = Math.floor(focusedMs / 60000);
    if (minutes < 1) {
      toast.error('不足 1 分钟，不计入专注');
      setRun(null);
      return;
    }
    setDone({ minutes, saved: 'pending' });
    try {
      await api.addFocus({ blockId: run.blockId ?? undefined, minutes, status: 'completed', title: run.title, runId: run.runId });
      setDone({ minutes, saved: 'ok' });
      await refresh();
      chime();
    } catch {
      setDone({ minutes, saved: 'fail' });
    }
  }

  // 关闭完成面板：ok 必须点"完成"确认；fail 可放弃保存
  function closeSplash(confirmSave: boolean) {
    if (confirmSave && done?.saved !== 'ok') return;
    if (done?.saved === 'ok') toast.success(`专注 ${done.minutes} 分钟已保存 🎉`);
    setRun(null);
    setDone(null);
  }

  // 重试保存（失败后）
  async function retrySave(minutes: number) {
    if (!run) { setDone(null); return; }
    setDone({ minutes, saved: 'pending' });
    try {
      await api.addFocus({ blockId: run.blockId ?? undefined, minutes, status: 'completed', title: run.title, runId: run.runId });
      setDone({ minutes, saved: 'ok' });
      await refresh();
      chime();
    } catch {
      setDone({ minutes, saved: 'fail' });
    }
  }

  function pauseToggle() {
    if (!run || done) return;
    if (run.phase === 'running') {
      setRun({ ...run, bankedMs: run.bankedMs + Date.now() - run.resumedAt, phase: 'paused' });
    } else {
      setRun({ ...run, resumedAt: Date.now(), phase: 'running' });
    }
  }

  async function giveUp() {
    if (!run || done) return;
    const minutes = Math.floor(focusedMs / 60000);
    const title = run.title;
    const runId = run.runId;
    setRun(null); // 先清本地状态：即使后续保存失败/页面刷新，也不会被当成已完成重复提交
    if (minutes >= 1) {
      await api.addFocus({ minutes, status: 'abandoned', title, runId }).catch(() => {});
      await refresh();
    }
    toast('已放弃，本次不计入任务进度', { icon: '💨' });
  }

  // ---------- 统计 ----------
  const sessions = state.focusSessions || [];
  const doneSessions = sessions.filter(s => s.status === 'completed');
  const todayMin = doneSessions.filter(s => s.date === today()).reduce((s, x) => s + x.minutes, 0);
  const weekMin = doneSessions.filter(s => s.date >= today().slice(0, 8) + '01').reduce((s, x) => s + x.minutes, 0);
  const days = new Set(doneSessions.map(s => s.date));
  let streak = 0;
  for (let d = today(); days.has(d); d = new Date(new Date(d).getTime() - 86400000).toISOString().slice(0, 10)) streak++;
  const todayDist = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of doneSessions.filter(x => x.date === today())) {
      m.set(s.title, (m.get(s.title) || 0) + s.minutes);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 渲染 ----------
  const R = 120;
  const CIRC = 2 * Math.PI * R;
  const progress = run ? Math.min(1, focusedMs / totalMs) : 0;
  const mm = String(Math.floor(remainMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* 计时器主卡 */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative flex flex-col items-center">
          {/* 任务选择 */}
          {!run && (
            <div className="mb-5 flex w-full flex-col items-center gap-2">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <select
                  value={selBlockId}
                  onChange={e => setSelBlockId(e.target.value)}
                  className="max-w-64 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none backdrop-blur focus:border-indigo-400 [&_option]:text-slate-800 [&_optgroup]:text-slate-400"
                >
                  <option value="">🧘 自由专注（不关联任务）</option>
                  {todayBlocks.length > 0 && (
                    <optgroup label="今天的任务（完成可抵扣）">
                      {todayBlocks.map(b => {
                        const t = taskMap.get(b.taskId);
                        return (
                          <option key={b.id} value={b.id}>
                            {t?.title}（{b.start}-{b.end}）
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                  {activeTasks.length > 0 && (
                    <optgroup label="进行中的任务（只记录时长）">
                      {activeTasks.map(t => (
                        <option key={t.id} value={`task:${t.id}`}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value={CUSTOM}>✏️ 自定义任务名…</option>
                </select>
                <div className="flex gap-1.5">
                  {DURATIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                        duration === d ? 'bg-indigo-500 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                      }`}
                    >
                      {d}分
                    </button>
                  ))}
                </div>
              </div>
              {selBlockId === CUSTOM && (
                <input
                  autoFocus
                  value={customTitle}
                  onChange={e => setCustomTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && start()}
                  placeholder="输入这次专注做什么，例如：复变函数作业"
                  className="w-full max-w-80 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none backdrop-blur focus:border-indigo-400"
                />
              )}
            </div>
          )}
          {run && (
            <div className="mb-3 text-center">
              <div className="text-xs uppercase tracking-widest text-indigo-300">
                {run.phase === 'running' ? '专注中' : '已暂停'}
              </div>
              <div className="mt-1 max-w-96 truncate text-sm text-slate-300">{run.title}</div>
            </div>
          )}

          {/* 圆环 */}
          <div className="relative">
            <svg width="280" height="280" viewBox="0 0 280 280">
              <circle cx="140" cy="140" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
              <circle
                cx="140"
                cy="140"
                r={R}
                fill="none"
                stroke="url(#fg)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - progress)}
                transform="rotate(-90 140 140)"
                style={{ transition: 'stroke-dashoffset 0.5s linear', filter: 'drop-shadow(0 0 10px rgba(129,140,248,0.6))' }}
              />
              <defs>
                <linearGradient id="fg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-6xl font-bold tabular-nums tracking-tight">
                {run ? `${mm}:${ss}` : `${String(duration).padStart(2, '0')}:00`}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                {run ? `已专注 ${fmtMin(Math.floor(focusedMs / 60000))}` : '准备开始'}
              </div>
            </div>
          </div>

          {/* 控制按钮 / 完成结果面板 */}
          {done ? (
            <div className="mt-6 flex flex-col items-center gap-2 text-center">
              {done.saved === 'pending' && (
                <>
                  <div className="text-2xl font-bold">💾 正在保存…</div>
                  <p className="text-sm text-slate-400">专注 {done.minutes} 分钟，请稍候</p>
                </>
              )}
              {done.saved === 'ok' && (
                <>
                  <div className="text-3xl font-bold">🎉 专注 {done.minutes} 分钟</div>
                  <p className="text-sm text-emerald-300">
                    已保存到专注记录{run?.blockId ? '，对应任务已抵扣' : ''}
                  </p>
                  <Button size="lg" onClick={() => closeSplash(true)} className="mt-1 bg-emerald-500 px-10 text-white hover:bg-emerald-400">
                    <Check className="mr-2 h-5 w-5" />完成
                  </Button>
                </>
              )}
              {done.saved === 'fail' && (
                <>
                  <div className="text-2xl font-bold">⚠️ 保存失败</div>
                  <p className="max-w-72 text-sm text-red-300">
                    电脑上的黑窗口可能不是最新版本，或网络断开。本次专注 {done.minutes} 分钟还没丢，可以重试。
                  </p>
                  <div className="mt-1 flex gap-2">
                    <Button size="lg" onClick={() => void retrySave(done.minutes)} className="bg-indigo-500 px-6 text-white hover:bg-indigo-400">
                      重试保存
                    </Button>
                    <Button size="lg" variant="ghost" onClick={() => closeSplash(false)} className="px-4 text-slate-400 hover:bg-white/10 hover:text-white">
                      放弃保存
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-3">
              {!run ? (
                <Button size="lg" onClick={start} className="bg-indigo-500 px-10 text-white hover:bg-indigo-400">
                  <Play className="mr-2 h-5 w-5" />开始专注
                </Button>
              ) : (
                <>
                  <Button size="lg" variant="outline" onClick={pauseToggle} className="border-white/20 bg-white/10 px-6 text-white hover:bg-white/20 hover:text-white">
                    {run.phase === 'running' ? <><Pause className="mr-2 h-5 w-5" />暂停</> : <><Play className="mr-2 h-5 w-5" />继续</>}
                  </Button>
                  <Button size="lg" onClick={() => void finishSession()} className="bg-emerald-500 px-6 text-white hover:bg-emerald-400">
                    <Check className="mr-2 h-5 w-5" />完成
                  </Button>
                  <Button size="lg" variant="ghost" onClick={() => void giveUp()} className="px-4 text-slate-400 hover:bg-white/10 hover:text-white">
                    <X className="mr-1 h-5 w-5" />放弃
                  </Button>
                </>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">选"今天的任务"完成可抵扣；自定义/自由专注只记录时长；暂停不计时；放弃不计入进度</p>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Timer, label: '今日专注', value: fmtMin(todayMin), color: 'text-indigo-600' },
          { icon: CalendarCheck, label: '本月专注', value: fmtMin(weekMin), color: 'text-emerald-600' },
          { icon: Flame, label: '连续天数', value: `${streak} 天`, color: 'text-orange-500' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border bg-white p-4 text-center">
            <s.icon className={`mx-auto mb-1 h-5 w-5 ${s.color}`} />
            <div className="text-xl font-bold tabular-nums">{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 今日分布 */}
      <div className="rounded-2xl border bg-white p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-indigo-500" />今日专注分布</h3>
        {todayDist.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">今天还没有专注记录</p>
        ) : (
          <ul className="space-y-2">
            {todayDist.map(([title, min]) => (
              <li key={title}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span className="max-w-40 truncate">{title}</span>
                  <span className="text-slate-400">{fmtMin(min)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400" style={{ width: `${(min / Math.max(1, todayDist[0][1])) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 专注历史记录（按天分组） */}
      <FocusHistory sessions={sessions} />
    </div>
  );
}
