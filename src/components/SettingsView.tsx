// 设置视图：排程参数 + 校历特殊日 + 节假日核对
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { addDays, today } from '@/lib/date';
import type { AppState, CalEvent } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface Props { state: AppState; refresh: () => Promise<void>; }

export default function SettingsView({ state, refresh }: Props) {
  const s = state.settings;
  const [form, setForm] = useState({ ...s });
  const [newEvent, setNewEvent] = useState({ date: today(), name: '', type: 'busy' as CalEvent['type'], copyDate: addDays(today(), 2) });

  useEffect(() => setForm({ ...s }), [s]);

  async function saveSettings() {
    await api.updateSettings({ ...form });
    await refresh();
    toast.success('设置已保存，计划已按新参数重排');
  }

  async function addEvent() {
    if (!newEvent.name.trim()) { toast.error('请填写事项名称'); return; }
    await api.addEvent({ ...newEvent, name: newEvent.name.trim() });
    setNewEvent({ date: today(), name: '', type: 'busy', copyDate: addDays(today(), 2) });
    await refresh();
    toast.success('已添加，排程已更新');
  }

  async function removeEvent(id: string) {
    await api.deleteEvent(id);
    await refresh();
  }

  const num = (v: string, fallback: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 排程参数 */}
      <div className="space-y-4">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">⚙️ 排程参数</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>学期第一周周一</Label>
              <Input type="date" value={form.semesterStart} onChange={e => setForm({ ...form, semesterStart: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>每天任务上限（分钟）</Label>
              <Input type="number" min="30" step="30" value={form.dailyCapacityMin}
                onChange={e => setForm({ ...form, dailyCapacityMin: num(e.target.value, 240) })} />
            </div>
            <div className="grid gap-1.5">
              <Label>每日起点</Label>
              <Input type="time" value={form.dayStart} onChange={e => setForm({ ...form, dayStart: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>每日终点</Label>
              <Input type="time" value={form.dayEnd} onChange={e => setForm({ ...form, dayEnd: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>任务最早开始</Label>
              <Input type="time" value={form.taskStart || '08:00'} onChange={e => setForm({ ...form, taskStart: e.target.value })} />
              <p className="text-[11px] text-slate-400">之前的时间不排任务（晨间 routine）</p>
            </div>
            <div className="grid gap-1.5">
              <Label>午休开始</Label>
              <Input type="time" value={form.napStart || ''} onChange={e => setForm({ ...form, napStart: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>午休结束</Label>
              <Input type="time" value={form.napEnd || ''} onChange={e => setForm({ ...form, napEnd: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>单块最长（分钟）</Label>
              <Input type="number" min="15" step="15" value={form.blockMaxMin}
                onChange={e => setForm({ ...form, blockMaxMin: num(e.target.value, 90) })} />
            </div>
            <div className="grid gap-1.5">
              <Label>碎片时间阈值（分钟）</Label>
              <Input type="number" min="10" step="5" value={form.minGapMin}
                onChange={e => setForm({ ...form, minGapMin: num(e.target.value, 45) })} />
              <p className="text-[11px] text-slate-400">小于此时长的空档不安排任务</p>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-indigo-600" checked={form.autoRegenerate}
              onChange={e => setForm({ ...form, autoRegenerate: e.target.checked })} />
            任何变动后自动重新排程
          </label>
          <Button className="mt-4" onClick={saveSettings}>保存并重排</Button>
        </div>

        {/* 节假日核对 */}
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-1 font-semibold">🎈 法定节假日（请核对）</h2>
          <p className="mb-3 text-xs text-slate-400">以下按 2026 年官方安排预置，如有出入请告诉我修改；节假日当天容量自动放宽</p>
          <div className="flex flex-wrap gap-1.5">
            {state.holidays.map(h => (
              <Badge key={h.date} variant="secondary">{h.date.slice(5)} {h.name}</Badge>
            ))}
          </div>
        </div>
      </div>

      {/* 校历特殊日 */}
      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-1 font-semibold">📌 校历特殊日 & 调休</h2>
        <p className="mb-3 text-xs text-slate-400">
          🚫没空/🎈放假 → 当天停课且不排任务（运动会、临时放假）；
          🔁调休上课 → 当天上你指定的某一天（源日期）的课（如：10月11日 上 10月14日 的课）；
          📝考试 → 标记考试日
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input type="date" className="w-40" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} />
          <Input className="min-w-32 flex-1" placeholder="事项名称" value={newEvent.name} onChange={e => setNewEvent({ ...newEvent, name: e.target.value })} />
          <select value={newEvent.type} onChange={e => setNewEvent({ ...newEvent, type: e.target.value as CalEvent['type'] })}
            className="rounded-md border bg-background px-3 py-2 text-sm">
            <option value="busy">🚫 没空/停课</option>
            <option value="holiday">🎈 放假/停课</option>
            <option value="adjust">🔁 调休上课</option>
            <option value="exam">📝 考试</option>
          </select>
          {newEvent.type === 'adjust' && (
            <span className="flex items-center gap-1 text-sm text-slate-500">
              上
              <Input type="date" className="w-36" value={newEvent.copyDate || addDays(newEvent.date, 2)}
                onChange={e => setNewEvent({ ...newEvent, copyDate: e.target.value })} />
              的课
            </span>
          )}
          <Button onClick={addEvent}><Plus className="mr-1 h-4 w-4" />添加</Button>
        </div>
        <ul className="space-y-1.5">
          {state.events.length === 0 && <p className="py-4 text-center text-sm text-slate-300">暂无标记</p>}
          {[...state.events].sort((a, b) => a.date.localeCompare(b.date)).map(e => (
            <li key={e.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="text-slate-400">{e.date}</span>
              <Badge variant={e.type === 'exam' ? 'destructive' : 'secondary'}>
                {{ busy: '🚫', exam: '📝', holiday: '🎈', adjust: '🔁' }[e.type]}
              </Badge>
              <span className="flex-1">{e.name}{e.type === 'adjust' && e.copyDate && <span className="text-indigo-600">（上 {e.copyDate.slice(5)} 的课）</span>}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeEvent(e.id)}>
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
