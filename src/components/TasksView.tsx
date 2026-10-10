// 任务视图：看板（待办/进行中/完成）+ 任务编辑对话框
import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Play, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { today, diffDays } from '@/lib/date';
import { TASK_TYPE_LABEL, TASK_TYPE_COLOR, type AppState, type Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import TaskDialog from '@/components/TaskDialog';

interface Props { state: AppState; refresh: () => Promise<void>; goToday: () => void; }

const COLUMNS: { key: Task['status']; label: string; icon: typeof Play; color: string }[] = [
  { key: 'todo', label: '待办', icon: AlertTriangle, color: 'bg-slate-100 text-slate-600' },
  { key: 'doing', label: '进行中', icon: Play, color: 'bg-blue-100 text-blue-600' },
  { key: 'done', label: '已完成', icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-600' },
];

export default function TasksView({ state, refresh, goToday }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [scheduleWarnings, setScheduleWarnings] = useState<string[]>([]);
  const [scheduling, setScheduling] = useState(false);

  const taskMap = useMemo(() => new Map(state.tasks.map(t => [t.id, t])), [state.tasks]);

  function openAdd() { setEditing(null); setDialogOpen(true); }
  function openEdit(t: Task) { setEditing(t); setDialogOpen(true); }

  async function setStatus(t: Task, status: Task['status']) {
    await api.updateTask(t.id, { status, progress: status === 'done' ? 1 : t.progress });
    await refresh();
  }

  async function remove(t: Task) {
    if (!confirm(`删除任务「${t.title}」？其所有排程块将一并删除。`)) return;
    await api.deleteTask(t.id);
    await refresh();
    toast.success('已删除');
  }

  async function reschedule() {
    setScheduling(true);
    try {
      const r = await api.runSchedule();
      setScheduleWarnings(r.warnings);
      await refresh();
      toast.success(`已重新排程，生成 ${r.plannedBlocks} 个任务块`);
    } finally { setScheduling(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openAdd}><Plus className="mr-1 h-4 w-4" />新建任务</Button>
        <Button variant="outline" onClick={reschedule} disabled={scheduling}>
          <RefreshCw className={`mr-1 h-4 w-4 ${scheduling ? 'animate-spin' : ''}`} />重新排程
        </Button>
        <Button variant="outline" onClick={goToday}>查看今日计划 →</Button>
        <span className="ml-auto text-sm text-slate-400">共 {state.tasks.length} 个任务</span>
      </div>

      {scheduleWarnings.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {scheduleWarnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map(col => {
          const tasks = state.tasks
            .filter(t => t.status === col.key)
            .sort((a, b) => a.deadline.localeCompare(b.deadline));
          return (
            <div key={col.key} className="rounded-xl border bg-white">
              <div className={`flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold ${col.color}`}>
                <col.icon className="h-4 w-4" />{col.label}<span className="ml-auto text-xs opacity-70">{tasks.length}</span>
              </div>
              <div className="space-y-2 p-3">
                {tasks.length === 0 && <p className="py-6 text-center text-xs text-slate-300">暂无任务</p>}
                {tasks.map(t => {
                  const color = TASK_TYPE_COLOR[t.type];
                  const urgent = t.status !== 'done' && t.deadline <= today();
                  const soon = t.status !== 'done' && !urgent && t.deadline <= today().slice(0, 8) + String(new Date(new Date().setDate(new Date().getDate() + 3))).slice(8);
                  const doneMin = state.blocks.filter(b => b.taskId === t.id && b.status === 'done').reduce((s, b) => s + b.minutes, 0);
                  const plannedMin = state.blocks.filter(b => b.taskId === t.id && b.status === 'planned').reduce((s, b) => s + b.minutes, 0);
                  const pct = Math.min(100, Math.round(((doneMin + plannedMin * (t.progress || 0)) / t.estimatedMin) * 100));
                  const daysLeft = Math.max(1, diffDays(today(), t.deadline));
                  const dailyMin = Math.round(t.estimatedMin / daysLeft);
                  return (
                    <div key={t.id} className="group rounded-lg border p-3 hover:shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium leading-snug">{t.title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                            <Badge variant="secondary" style={{ color, backgroundColor: color + '18' }}>{TASK_TYPE_LABEL[t.type]}</Badge>
                            <span className={`${urgent ? 'font-bold text-red-600' : soon ? 'text-amber-600' : 'text-slate-400'}`}>
                              {urgent ? '🚨' : '⏰'} 截止 {t.deadline.slice(5)}
                            </span>
                            <span className="font-medium text-indigo-600">📅 每天约 {dailyMin} 分钟</span>
                            {t.priority === 1 && <Badge className="bg-red-100 text-red-700 hover:bg-red-100">高优先</Badge>}
                            {t.pref && t.pref !== 'any' && <span className="text-slate-400">{{ morning: '🌅早上', afternoon: '🌤下午', evening: '🌙晚上' }[t.pref]}</span>}
                            {t.startDate && t.startDate > today() && <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">⏳ {parseInt(t.startDate.slice(5, 7), 10)}月{parseInt(t.startDate.slice(8), 10)}日开始</Badge>}
                          </div>
                          {t.notes && <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-slate-400">{t.notes}</p>}
                        </div>
                        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => remove(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={pct} className="h-1.5" />
                        <span className="w-16 shrink-0 text-right text-[10px] text-slate-400">已排 {pct}%</span>
                      </div>
                      <div className="mt-2 flex gap-1">
                        {t.status === 'todo' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus(t, 'doing')}><Play className="mr-1 h-3 w-3" />开始</Button>}
                        {t.status !== 'done' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus(t, 'done')}><CheckCircle2 className="mr-1 h-3 w-3" />完成</Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">💡 「已排 %」= 已完成块 + 已计划块占预计总量的比例（由排程器自动维护）</p>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        state={state}
        editing={editing}
        taskMap={taskMap}
        onSaved={async () => { await refresh(); setDialogOpen(false); }}
      />
    </div>
  );
}
