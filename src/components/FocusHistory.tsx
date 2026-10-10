// 专注历史记录：按天分组、每日小计、可展开查看全部
import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, History } from 'lucide-react';
import type { FocusSession } from '@/lib/types';
import { today, fmtMin } from '@/lib/date';

const WEEK = '日一二三四五六';

function dayLabel(date: string): string {
  if (date === today()) return '今天';
  const y = new Date(new Date(today()).getTime() - 86400000).toISOString().slice(0, 10);
  if (date === y) return '昨天';
  const d = new Date(date + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`;
}

export default function FocusHistory({ sessions }: { sessions: FocusSession[] }) {
  const [expanded, setExpanded] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, FocusSession[]>();
    const sorted = [...sessions].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    for (const s of sorted) {
      const list = m.get(s.date) || [];
      list.push(s);
      m.set(s.date, list);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])); // 新的天在前
  }, [sessions]);

  const visible = expanded ? groups : groups.slice(0, 3);
  const hasMore = groups.length > 3;

  return (
    <div className="rounded-2xl border bg-white p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <History className="h-4 w-4 text-indigo-500" />
        专注记录
        <span className="text-xs font-normal text-slate-400">共 {sessions.length} 条</span>
      </h3>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">还没有专注记录，开始第一段专注吧</p>
      ) : (
        <div className="space-y-4">
          {visible.map(([date, list]) => {
            const total = list.filter(s => s.status === 'completed').reduce((s, x) => s + x.minutes, 0);
            return (
              <div key={date}>
                <div className="mb-1.5 flex items-baseline justify-between border-b border-slate-100 pb-1">
                  <span className="text-sm font-semibold text-slate-700">📅 {dayLabel(date)}</span>
                  <span className="text-xs tabular-nums text-slate-400">当日专注 {fmtMin(total)}</span>
                </div>
                <ul className="space-y-1.5">
                  {list.map(s => (
                    <li key={s.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                      {s.status === 'completed'
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        : <XCircle className="h-4 w-4 shrink-0 text-slate-300" />}
                      <span className="w-24 shrink-0 font-mono text-sm tabular-nums text-slate-500">
                        {s.start} - {s.end}
                      </span>
                      <span className={`min-w-0 flex-1 break-all text-sm ${s.status === 'completed' ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                        {s.title}
                      </span>
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600 ring-1 ring-slate-200">
                        {s.minutes} 分钟
                      </span>
                      {s.status === 'abandoned' && (
                        <span className="shrink-0 text-xs text-slate-400">已放弃</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {hasMore && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-sm text-indigo-600 hover:bg-indigo-50"
            >
              {expanded
                ? <><ChevronUp className="h-4 w-4" />收起，只显示最近 3 天</>
                : <><ChevronDown className="h-4 w-4" />展开更早的 {groups.length - 3} 天记录</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
