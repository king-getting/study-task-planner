// 日历视图：周视图（主）+ 月视图（宏观）
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, today, parseD, dstr, toMin, toHM, WEEKDAYS } from '@/lib/date';
import { TASK_TYPE_COLOR, type AppState, type Course } from '@/lib/types';
import { coursesOnDate } from '@/lib/course';
import { Button } from '@/components/ui/button';

interface Props { state: AppState; refresh: () => Promise<void>; }

function mondayOf(date: string): string {
  const d = parseD(date);
  const dow = d.getDay() || 7; // 周一=1 ... 周日=7
  return dstr(new Date(d.getTime() - (dow - 1) * 86400000));
}

export default function CalendarView({ state }: Props) {
  const [anchor, setAnchor] = useState(today());
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const weekStart = mondayOf(anchor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const tdy = today();

  const coursesOfDay = (date: string): Course[] =>
    coursesOnDate(state.courses, state.events, state.holidays, state.settings.semesterStart, date);

  const dayInfo = useMemo(() => weekDays.map(d => ({
    date: d,
    courses: coursesOfDay(d),
    blocks: state.blocks.filter(b => b.date === d && b.status === 'planned'),
    deadlines: state.tasks.filter(t => t.deadline === d && t.status !== 'done'),
    exams: state.exams.filter(e => e.date === d),
    busy: state.events.find(e => e.date === d && (e.type === 'busy' || e.type === 'holiday')),
    adjust: state.events.find(e => e.date === d && e.type === 'adjust'),
    holiday: state.holidays.find(h => h.date === d),
  })), [weekStart, state.courses, state.blocks, state.tasks, state.events, state.holidays, state.exams]);

  const { dayStart, dayEnd } = state.settings;
  const startMin = Math.floor(toMin(dayStart) / 60) * 60;
  const endMin = Math.ceil(toMin(dayEnd) / 60) * 60;
  const pxPerMin = 52 / 60; // 每小时 52px

  if (mode === 'month') {
    return <MonthView state={state} anchor={anchor} setAnchor={setAnchor} setMode={setMode} />;
  }

  return (
    <div className="rounded-xl border bg-white">
      {/* 工具栏 */}
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setAnchor(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setAnchor(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(tdy)}>本周</Button>
          <span className="ml-2 text-sm font-medium text-slate-600">
            {weekStart.slice(0, 7).replace('-', '年')}月 · 第 {weekNoOf(state.settings.semesterStart, weekStart)} 教学周
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMode('month')}>月视图</Button>
        </div>
      </div>

      {/* 周网格 */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[900px]" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
          {/* 表头 */}
          <div />
          {dayInfo.map(d => (
            <div key={d.date} className={`border-l p-2 text-center ${d.date === tdy ? 'bg-indigo-50' : ''} ${d.holiday && !d.adjust ? 'bg-amber-50/60' : ''}`}>
              <div className="text-xs text-slate-400">{WEEKDAYS[parseD(d.date).getDay()]}</div>
              <div className={`text-lg font-bold ${d.date === tdy ? 'text-indigo-600' : ''}`}>{d.date.slice(8)}</div>
              {d.holiday && !d.adjust && <div className="text-[10px] text-amber-600">🎈{d.holiday.name}·停课</div>}
              {d.adjust && <div className="text-[10px] font-medium text-indigo-600">🔁调休·上{d.adjust.copyDate ? d.adjust.copyDate.slice(5) : '?'}的课</div>}
            </div>
          ))}

          {/* 时间轴 + 7 天列 */}
          <div>
            {Array.from({ length: (endMin - startMin) / 60 }, (_, i) => (
              <div key={i} className="text-right pr-1 text-[10px] text-slate-400" style={{ height: 52 }}>
                {toHM(startMin + i * 60)}
              </div>
            ))}
          </div>

          {dayInfo.map(d => (
            <div key={d.date} className={`relative border-l ${d.date === tdy ? 'bg-indigo-50/40' : ''}`}
              style={{ height: ((endMin - startMin) / 60) * 52 }}>
              {/* 小时线 */}
              {Array.from({ length: (endMin - startMin) / 60 - 1 }, (_, i) => (
                <div key={i} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: (i + 1) * 52 }} />
              ))}

              {/* 整天忙碌 */}
              {d.busy && (
                <div className="absolute inset-x-1 rounded bg-slate-200/70 p-2 text-xs text-slate-500"
                  style={{ top: 0, height: ((endMin - startMin) / 60) * 52 }}>
                  🚫 {d.busy.name}
                </div>
              )}

              {/* 课程 */}
              {!d.busy && d.courses.map(c => (
                <div key={c.id} className="absolute inset-x-1 overflow-hidden rounded-md p-1.5 text-white"
                  style={{
                    top: (toMin(c.start) - startMin) * pxPerMin,
                    height: Math.max(22, (toMin(c.end) - toMin(c.start)) * pxPerMin),
                    backgroundColor: c.color || '#5b8def',
                  }}
                  title={`${c.name} ${c.start}-${c.end}`}>
                  <div className="truncate text-xs font-medium">{c.name}</div>
                  <div className="truncate text-[10px] opacity-90">{c.start}-{c.end}{c.location ? ` · ${c.location}` : ''}</div>
                </div>
              ))}

              {/* 午休 */}
              {!d.busy && state.settings.napStart && state.settings.napEnd && (
                <div className="absolute inset-x-1 overflow-hidden rounded-md border border-dashed border-slate-200 bg-slate-50 p-1"
                  style={{
                    top: (toMin(state.settings.napStart) - startMin) * pxPerMin,
                    height: Math.max(18, (toMin(state.settings.napEnd) - toMin(state.settings.napStart)) * pxPerMin),
                  }}
                  title="午休">
                  <div className="text-center text-[10px] text-slate-400">😴 午休</div>
                </div>
              )}

              {/* 考试 */}
              {!d.busy && d.exams.map(ex => (
                <div key={ex.id} className="absolute inset-x-1 overflow-hidden rounded-md bg-red-500 p-1.5 text-white shadow-sm"
                  style={{
                    top: (toMin(ex.start) - startMin) * pxPerMin,
                    height: Math.max(24, (toMin(ex.end) - toMin(ex.start)) * pxPerMin),
                  }}
                  title={`${ex.courseName} 考试 ${ex.start}-${ex.end}`}>
                  <div className="truncate text-xs font-bold">📝 {ex.courseName}</div>
                  <div className="truncate text-[10px] opacity-90">{ex.start}-{ex.end}{ex.location ? ` · ${ex.location}` : ''}</div>
                </div>
              ))}

              {/* 任务块 */}
              {!d.busy && d.blocks.map(b => {
                const task = state.tasks.find(t => t.id === b.taskId);
                if (!task) return null;
                return (
                  <div key={b.id} className="absolute inset-x-1 overflow-hidden rounded-md border bg-white/95 p-1.5"
                    style={{
                      top: (toMin(b.start) - startMin) * pxPerMin,
                      height: Math.max(20, (toMin(b.end) - toMin(b.start)) * pxPerMin),
                      borderColor: TASK_TYPE_COLOR[task.type] || '#94a3b8',
                    }}
                    title={`${task.title} ${b.start}-${b.end}`}>
                    <div className="truncate text-xs font-medium" style={{ color: TASK_TYPE_COLOR[task.type] }}>{task.title}</div>
                  </div>
                );
              })}

              {/* 截止日标记 */}
              {d.deadlines.length > 0 && (
                <div className="absolute bottom-1 left-1 right-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">
                  ⏰ {d.deadlines.length} 个截止：{d.deadlines.slice(0, 2).map(t => t.title).join('、')}{d.deadlines.length > 2 ? '…' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap items-center gap-4 border-t p-3 text-xs text-slate-500">
        <span className="font-medium">图例：</span>
        {(['homework', 'exam', 'competition', 'cert', 'project'] as const).map(k => (
          <span key={k} className="flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: TASK_TYPE_COLOR[k] }} />
            {{ homework: '课程作业', exam: '考试复习', competition: '竞赛', cert: '考级考证', project: '项目' }[k]}
          </span>
        ))}
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm bg-red-200" />截止日</span>
      </div>
    </div>
  );
}

function weekNoOf(semesterStart: string, date: string): number {
  return Math.floor((parseD(date).getTime() - parseD(semesterStart).getTime()) / 86400000 / 7) + 1;
}

// ---------- 月视图 ----------
function MonthView({ state, anchor, setAnchor, setMode }: {
  state: AppState; anchor: string; setAnchor: (s: string) => void; setMode: (m: 'week' | 'month') => void;
}) {
  const d = parseD(anchor);
  const year = d.getFullYear(), month = d.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = new Date(first.getTime() - ((first.getDay() || 7) - 1) * 86400000);
  const tdy = today();

  const cells = Array.from({ length: 42 }, (_, i) => dstr(new Date(gridStart.getTime() + i * 86400000)));

  const infoOf = (date: string) => {
    const courses = coursesOnDate(state.courses, state.events, state.holidays, state.settings.semesterStart, date).length;
    const blocks = state.blocks.filter(b => b.date === date && b.status === 'planned').reduce((s, b) => s + b.minutes, 0);
    const deadlines = state.tasks.filter(t => t.deadline === date && t.status !== 'done');
    const holiday = state.holidays.find(h => h.date === date);
    const busy = state.events.find(e => e.date === date && (e.type === 'busy' || e.type === 'holiday'));
    const adjust = state.events.find(e => e.date === date && e.type === 'adjust');
    const exams = state.exams.filter(e => e.date === date);
    return { courses, blocks, deadlines, holiday, busy, adjust, exams };
  };

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setAnchor(dstr(new Date(year, month - 1, 1)))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setAnchor(dstr(new Date(year, month + 1, 1)))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(tdy)}>今天</Button>
          <span className="ml-2 text-base font-bold">{year} 年 {month + 1} 月</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMode('week')}>回到周视图</Button>
      </div>

      <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-slate-400">
        {WEEKDAYS.slice(1).concat('周日').map((w, i) => <div key={i} className="p-2">{w}</div>)}
      </div>

      <div className="grid grid-cols-7">
        {cells.map(date => {
          const info = infoOf(date);
          const inMonth = parseD(date).getMonth() === month;
          return (
            <button key={date} onClick={() => { setAnchor(date); setMode('week'); }}
              className={`min-h-20 border-b border-r p-1.5 text-left align-top transition-colors hover:bg-indigo-50 ${!inMonth ? 'bg-slate-50/60 text-slate-300' : ''} ${date === tdy ? 'bg-indigo-50' : ''}`}>
              <div className={`text-xs font-bold ${date === tdy ? 'text-indigo-600' : ''}`}>{parseD(date).getDate()}</div>
              <div className="mt-0.5 space-y-0.5 text-[10px] leading-tight">
                {info.holiday && <div className="text-amber-600">🎈{info.holiday.name}</div>}
                {info.busy && <div className="text-slate-400">🚫{info.busy.name}</div>}
                {info.adjust && <div className="text-indigo-600">🔁上{info.adjust.copyDate ? info.adjust.copyDate.slice(5) : '?'}的课</div>}
                {info.exams.length > 0 && <div className="font-medium text-red-600">📝{info.exams.map(e => e.courseName).slice(0, 1).join('')}{info.exams.length > 1 ? ` 等${info.exams.length}场` : ''} 考试</div>}
                {info.courses > 0 && <div className="text-slate-500">{info.courses} 节课</div>}
                {info.blocks > 0 && <div className="text-indigo-600">📖{Math.round(info.blocks / 60 * 10) / 10}h 任务</div>}
                {info.deadlines.length > 0 && <div className="font-medium text-red-600">⏰{info.deadlines.map(t => t.title).slice(0, 1).join('')}{info.deadlines.length > 1 ? ` 等${info.deadlines.length}项` : ''} 截止</div>}
              </div>
            </button>
          );
        })}
      </div>
      <p className="p-3 text-xs text-slate-400">💡 点击任意日期跳转到该周视图</p>
    </div>
  );
}
