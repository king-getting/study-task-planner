// 今日视图：今日课程时间线 + 今日任务清单（可勾选/可调整时间）+ 快速录入
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Circle, CheckCircle2, SkipForward, Plus, BookOpen, Pencil, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { coursesOnDate } from '@/lib/course';
import { addDays, today, fmtDate, toMin, fmtMin } from '@/lib/date';
import { TASK_TYPE_LABEL, TASK_TYPE_COLOR, type AppState, type Block, type Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Props {
  state: AppState;
  refresh: () => Promise<void>;
  goTasks: () => void;
  goCalendar: () => void;
  goFocus?: (blockId: string) => void;
}

export default function TodayView({ state, refresh, goTasks, goFocus }: Props) {
  const [date, setDate] = useState(today());
  const [quickTitle, setQuickTitle] = useState('');
  const [quickHours, setQuickHours] = useState('1');
  // 时间调整对话框状态
  const [editing, setEditing] = useState<Block | null>(null);
  const [editStart, setEditStart] = useState('08:00');
  const [editEnd, setEditEnd] = useState('09:00');
  const [editLocked, setEditLocked] = useState(true);

  const isToday = date === today();

  // 当日课程
  const coursesToday = useMemo(() => {
    const { semesterStart } = state.settings;
    return coursesOnDate(state.courses, state.events, state.holidays, semesterStart, date);
  }, [state.courses, state.events, state.holidays, state.settings.semesterStart, date]);

  // 当日时间块
  const blocksToday = useMemo(
    () => state.blocks.filter(b => b.date === date).sort((a, b) => toMin(a.start) - toMin(b.start)),
    [state.blocks, date],
  );
  const taskMap = useMemo(() => new Map(state.tasks.map(t => [t.id, t])), [state.tasks]);

  const doneMin = blocksToday.filter(b => b.status === 'done').reduce((s, b) => s + b.minutes, 0);
  const totalMin = blocksToday.reduce((s, b) => s + b.minutes, 0);

  // 过期未完成任务
  const overdue = state.tasks.filter(t => t.status !== 'done' && t.deadline < today());

  async function toggleBlock(b: Block, status: 'done' | 'skipped' | 'planned') {
    await api.patchBlock(b.id, { status });
    await refresh();
    if (status === 'done') toast.success('完成一段，继续加油！');
  }

  async function quickAdd() {
    if (!quickTitle.trim()) return;
    const t = await api.addTask({
      title: quickTitle.trim(),
      type: 'other',
      deadline: addDays(today(), 3),
      estimatedMin: Math.round(parseFloat(quickHours || '1') * 60),
    });
    await refresh();
    toast.success(`已添加「${t.title}」，已自动排入计划`);
    setQuickTitle('');
  }

  // 打开时间调整对话框
  function openEdit(b: Block) {
    setEditing(b);
    setEditStart(b.start);
    setEditEnd(b.end);
    setEditLocked(!!b.locked);
  }

  // 保存调整：先校验时间段，再查冲突（课程/午休/考试/其他任务块/没空事件），最后写回
  async function saveEdit() {
    if (!editing) return;
    const sMin = toMin(editStart);
    const eMin = toMin(editEnd);
    if (!(sMin < eMin)) {
      toast.error('结束时间要晚于开始时间');
      return;
    }
    const dur = eMin - sMin;
    if (dur < 15 || dur > 240) {
      toast.error('每段任务建议 15 ～ 240 分钟之间');
      return;
    }
    const { napStart, napEnd } = state.settings;
    // 收集当天所有"不可占用"的区间
    const busy: { label: string; s: number; e: number }[] = [];
    for (const c of coursesToday) busy.push({ label: `课程「${c.name}」`, s: toMin(c.start), e: toMin(c.end) });
    if (napStart && napEnd) busy.push({ label: '午休', s: toMin(napStart), e: toMin(napEnd) });
    for (const ex of state.exams.filter(e => e.date === date)) busy.push({ label: `考试「${ex.courseName}」`, s: toMin(ex.start), e: toMin(ex.end) });
    for (const ev of state.events.filter(e => e.date === date && e.type === 'busy')) busy.push({ label: ev.name || '没空事件', s: toMin(state.settings.dayStart), e: toMin(state.settings.dayEnd) });
    for (const b of state.blocks) {
      if (b.date === date && b.id !== editing.id && b.status === 'planned') {
        const t = taskMap.get(b.taskId);
        busy.push({ label: `任务「${t?.title ?? ''}」`, s: toMin(b.start), e: toMin(b.end) });
      }
    }
    const conflicts = busy.filter(x => sMin < x.e && x.s < eMin);
    if (conflicts.length > 0) {
      toast.error(`与 ${conflicts.map(c => c.label).join('、')} 冲突，请换个时间`);
      return;
    }
    await api.patchBlock(editing.id, { start: editStart, end: editEnd, minutes: dur, locked: editLocked });
    setEditing(null);
    await refresh();
    toast.success(editLocked ? '已固定到该时间（🔒 不会被自动重排）' : '已调整时间（未固定，自动重排可能改回）');
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* 左：今日计划 */}
      <div className="space-y-4 lg:col-span-3">
        <div className="flex items-center justify-between rounded-xl border bg-white p-4">
          <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="h-5 w-5" /></Button>
          <div className="text-center">
            <div className="text-xl font-bold">{fmtDate(date)}</div>
            {!isToday && (
              <button className="text-xs text-indigo-600 hover:underline" onClick={() => setDate(today())}>回到今天</button>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, 1))}><ChevronRight className="h-5 w-5" /></Button>
        </div>

        {/* 今日任务块 */}
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">📋 今日任务安排</h2>
            {totalMin > 0 && (
              <span className="text-sm text-slate-500">
                已完成 {fmtMin(doneMin)} / 共 {fmtMin(totalMin)}（{Math.round((doneMin / totalMin) * 100)}%）
              </span>
            )}
          </div>
          {blocksToday.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              今天没有排入任务块。
              <button className="ml-1 text-indigo-600 hover:underline" onClick={goTasks}>去任务页添加任务 →</button>
            </div>
          ) : (
            <ul className="space-y-2">
              {blocksToday.map(b => {
                const task = taskMap.get(b.taskId);
                if (!task) return null;
                const color = TASK_TYPE_COLOR[task.type] || '#94a3b8';
                return (
                  <li key={b.id} className={`flex items-center gap-3 rounded-lg border p-3 ${b.status === 'done' ? 'bg-emerald-50/60 opacity-70' : b.status === 'skipped' ? 'bg-slate-50 opacity-50' : ''}`}>
                    <button onClick={() => toggleBlock(b, b.status === 'done' ? 'planned' : 'done')} title={b.status === 'done' ? '取消完成' : '标记完成'}>
                      {b.status === 'done'
                        ? <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                        : <Circle className="h-6 w-6 text-slate-300 hover:text-indigo-500" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={`font-medium ${b.status === 'done' ? 'line-through' : ''}`}>
                        {task.title}
                        <Badge className="ml-2" style={{ backgroundColor: color }}>{TASK_TYPE_LABEL[task.type]}</Badge>
                        {!!b.locked && <span className="ml-1 text-xs" title="已手动固定时间">🔒</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {b.start} - {b.end} · {b.minutes} 分钟
                        {task.deadline === date && <span className="ml-2 font-medium text-red-500">今日截止</span>}
                      </div>
                    </div>
                    {b.status !== 'done' && (
                      <div className="flex shrink-0 items-center">
                        {b.status === 'planned' && goFocus && (
                          <Button variant="ghost" size="sm" onClick={() => goFocus(b.id)} title="开始专注计时">
                            <Timer className="mr-1 h-4 w-4" />专注
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openEdit(b)} title="调整时间">
                          <Pencil className="mr-1 h-4 w-4" />调整
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleBlock(b, b.status === 'skipped' ? 'planned' : 'skipped')}>
                          <SkipForward className="mr-1 h-4 w-4" />{b.status === 'skipped' ? '恢复' : '跳过'}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 快速录入 */}
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">⚡ 快速记一个任务</h2>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-48 flex-1" placeholder="例如：周五交高数作业" value={quickTitle} onChange={e => setQuickTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && quickAdd()} />
            <Input className="w-20" type="number" min="0.5" step="0.5" value={quickHours} onChange={e => setQuickHours(e.target.value)} title="预计小时" />
            <span className="self-center text-sm text-slate-400">小时</span>
            <Button onClick={quickAdd}><Plus className="mr-1 h-4 w-4" />添加</Button>
          </div>
          <p className="mt-2 text-xs text-slate-400">添加后自动均衡排程；详细设置（截止日、优先级等）请到任务页编辑。</p>
        </div>
      </div>

      {/* 右：今日课程 + 预警 */}
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">🕘 今日课程</h2>
          {coursesToday.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">今天没有课 🎉</p>
          ) : (
            <ul className="space-y-2">
              {coursesToday.map(c => (
                <li key={c.id} className="flex items-start gap-3 rounded-lg border-l-4 bg-slate-50 p-3" style={{ borderLeftColor: c.color || '#5b8def' }}>
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.start} - {c.end}{c.location ? ` · ${c.location}` : ''}{c.teacher ? ` · ${c.teacher}` : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(() => {
          const upcomingExams = state.exams
            .filter(e => e.date >= date)
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 3);
          if (!upcomingExams.length) return null;
          return (
            <div className="rounded-xl border border-red-200 bg-white p-4">
              <h2 className="mb-2 font-semibold text-red-700">📝 近期考试</h2>
              <ul className="space-y-1.5 text-sm">
                {upcomingExams.map(ex => (
                  <li key={ex.id} className="flex items-center justify-between gap-2">
                    <span className="font-medium">{ex.courseName}</span>
                    <span className="text-xs text-slate-500">{ex.date.slice(5)} {ex.start}{ex.location ? ` · ${ex.location}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {overdue.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <h2 className="mb-2 font-semibold text-red-700">🚨 已过期未完成（{overdue.length}）</h2>
            <ul className="space-y-1 text-sm">
              {overdue.map(t => (
                <li key={t.id} className="flex items-center justify-between">
                  <span>{t.title}</span>
                  <Badge variant="destructive">截止 {t.deadline.slice(5)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 调整任务时间对话框 */}
      <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>调整任务时间</DialogTitle>
          </DialogHeader>
          {editing && (() => {
            const task = taskMap.get(editing.taskId);
            return (
              <div className="space-y-4">
                <div className="text-sm font-medium">{task?.title ?? '任务'}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-start">开始时间</Label>
                    <Input id="edit-start" type="time" value={editStart} onChange={e => setEditStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-end">结束时间</Label>
                    <Input id="edit-end" type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={editLocked} onCheckedChange={v => setEditLocked(v === true)} />
                  固定此时间（🔒 之后自动重排不会改动它）
                </label>
                {!editLocked && (
                  <p className="text-xs text-amber-600">不固定的话，下次自动排程可能把时间改回去。</p>
                )}
                <p className="text-xs text-slate-400">会避开当天的课程、午休、考试和其他任务块；调整时长建议在 15～240 分钟之间。</p>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={saveEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { Task };
