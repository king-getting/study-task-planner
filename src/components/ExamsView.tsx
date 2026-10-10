// 考试视图：期末考总览（倒计时列表）+ 添加/删除
import { useMemo, useState } from 'react';
import { Plus, Trash2, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { addDays, today, fmtDate, diffDays } from '@/lib/date';
import type { AppState, Exam } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Props { state: AppState; refresh: () => Promise<void>; }

export default function ExamsView({ state, refresh }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const tdy = today();

  const exams = useMemo(
    () => [...state.exams].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)),
    [state.exams],
  );

  const upcoming = exams.filter(e => e.date >= tdy);
  const past = exams.filter(e => e.date < tdy);

  async function remove(ex: Exam) {
    if (!confirm(`删除「${ex.courseName}」的考试记录？`)) return;
    await api.deleteExam(ex.id);
    await refresh();
    toast.success('已删除');
  }

  function countdown(ex: Exam): { text: string; cls: string } {
    const n = diffDays(tdy, ex.date);
    if (n === 0) return { text: '今天考！', cls: 'bg-red-100 text-red-700' };
    if (n === 1) return { text: '明天考', cls: 'bg-red-100 text-red-700' };
    if (n <= 7) return { text: `还有 ${n} 天`, cls: 'bg-amber-100 text-amber-700' };
    return { text: `还有 ${n} 天`, cls: 'bg-slate-100 text-slate-500' };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-1 h-4 w-4" />添加考试</Button>
        <span className="ml-auto text-sm text-slate-400">共 {exams.length} 场 · 未考 {upcoming.length} 场</span>
      </div>

      {exams.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white py-16 text-center">
          <PencilLine className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-slate-500">还没有考试记录</p>
          <p className="mt-1 text-xs text-slate-400">把期末考试安排录进来，日历会标注，排程会自动避开考试时间</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs text-slate-400">
                <th className="px-4 py-2.5">课程</th>
                <th className="px-4 py-2.5">日期</th>
                <th className="px-4 py-2.5">时间</th>
                <th className="px-4 py-2.5">地点</th>
                <th className="px-4 py-2.5">倒计时</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {upcoming.map(ex => (
                <tr key={ex.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium">{ex.courseName}</td>
                  <td className="px-4 py-3">{fmtDate(ex.date)}</td>
                  <td className="px-4 py-3">{ex.start} - {ex.end}</td>
                  <td className="px-4 py-3 text-slate-500">{ex.location || '-'}</td>
                  <td className="px-4 py-3"><Badge className={countdown(ex).cls}>{countdown(ex).text}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(ex)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </td>
                </tr>
              ))}
              {past.length > 0 && (
                <tr className="border-b bg-slate-50/50 text-xs text-slate-400">
                  <td colSpan={6} className="px-4 py-1.5">已结束（{past.length} 场）</td>
                </tr>
              )}
              {past.map(ex => (
                <tr key={ex.id} className="border-b border-slate-50 text-slate-400 opacity-60">
                  <td className="px-4 py-2.5">{ex.courseName}</td>
                  <td className="px-4 py-2.5">{fmtDate(ex.date)}</td>
                  <td className="px-4 py-2.5">{ex.start} - {ex.end}</td>
                  <td className="px-4 py-2.5">{ex.location || '-'}</td>
                  <td className="px-4 py-2.5">已考</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(ex)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-300" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">💡 考试时间会自动占用当天时段——排任务时不会和考试撞车；考试前系统会按"考试复习"任务类型帮你倒排复习计划（下一阶段接入学习引擎后自动完成）</p>

      <ExamDialog open={dialogOpen} onOpenChange={setDialogOpen} state={state}
        onDone={async () => { setDialogOpen(false); await refresh(); }} />
    </div>
  );
}

// ---------- 添加考试对话框 ----------
function ExamDialog({ open, onOpenChange, state, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; state: AppState; onDone: () => Promise<void>;
}) {
  const [courseId, setCourseId] = useState('none');
  const [name, setName] = useState('');
  const [date, setDate] = useState(addDays(today(), 30));
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('11:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  async function save() {
    const course = state.courses.find(c => c.id === courseId);
    const courseName = course ? course.name : name.trim();
    if (!courseName) { toast.error('请选择课程或手动填写考试名称'); return; }
    await api.addExam({
      courseId: course?.id, courseName, date, start, end,
      location: location || undefined, notes: notes || undefined,
    });
    toast.success(`已添加「${courseName}」考试`);
    setCourseId('none'); setName(''); setLocation(''); setNotes('');
    await onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>添加期末考试</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label>课程 *</Label>
            <select value={courseId} onChange={e => { setCourseId(e.target.value); const c = state.courses.find(x => x.id === e.target.value); if (c) setName(c.name); }}
              className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="none">手动填写</option>
              {state.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {courseId === 'none' && (
            <div className="grid gap-1.5">
              <Label>考试名称</Label>
              <Input placeholder="例如：大学英语四级" value={name} onChange={e => setName(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>日期</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>开始</Label>
              <Input type="time" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>结束</Label>
              <Input type="time" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>地点</Label>
            <Input placeholder="例如：8 号楼 2101" value={location} onChange={e => setLocation(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>备注</Label>
            <Input placeholder="开卷/闭卷、需带证件等" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save}>添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
