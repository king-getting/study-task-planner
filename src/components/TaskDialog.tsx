// 任务编辑对话框：新建 / 修改
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { addDays, today } from '@/lib/date';
import { TASK_TYPE_LABEL, type AppState, type Task, type TaskType, type TimePref } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  state: AppState;
  editing: Task | null;
  taskMap: Map<string, Task>;
  onSaved: () => Promise<void>;
}

export default function TaskDialog({ open, onOpenChange, state, editing, onSaved }: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('homework');
  const [courseId, setCourseId] = useState<string>('none');
  const [deadline, setDeadline] = useState(addDays(today(), 7));
  const [startDate, setStartDate] = useState(today());
  const [hours, setHours] = useState('2');
  const [priority, setPriority] = useState<string>('3');
  const [splittable, setSplittable] = useState(true);
  const [pref, setPref] = useState<TimePref>('any');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setTitle(editing.title);
        setType(editing.type);
        setCourseId(editing.courseId || 'none');
        setDeadline(editing.deadline);
        setStartDate(editing.startDate || today());
        setHours(String(Math.round((editing.estimatedMin / 60) * 10) / 10));
        setPriority(String(editing.priority));
        setSplittable(editing.splittable);
        setPref(editing.pref || 'any');
        setNotes(editing.notes || '');
      } else {
        setTitle(''); setType('homework'); setCourseId('none');
        setDeadline(addDays(today(), 7)); setStartDate(today()); setHours('2'); setPriority('3'); setSplittable(true); setPref('any'); setNotes('');
      }
    }
  }, [open, editing]);

  async function save() {
    if (!title.trim()) { toast.error('请填写任务标题'); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(), type,
        courseId: courseId === 'none' ? undefined : courseId,
        deadline, startDate, estimatedMin: Math.round(parseFloat(hours || '0') * 60),
        priority: parseInt(priority, 10) as 1 | 2 | 3,
        splittable, pref, notes: notes || undefined,
      };
      if (editing) {
        await api.updateTask(editing.id, payload);
        toast.success('已保存并重新排程');
      } else {
        await api.addTask(payload);
        toast.success('已添加，AI 已自动排入计划');
      }
      await onSaved();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑任务' : '新建任务'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>任务内容 *</Label>
            <Input placeholder="例如：高数竞赛 - 积分中值定理专项 20 题" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>类型</Label>
              <Select value={type} onValueChange={v => setType(v as TaskType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TASK_TYPE_LABEL) as TaskType[]).map(k => (
                    <SelectItem key={k} value={k}>{TASK_TYPE_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>关联课程</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联</SelectItem>
                  {state.courses.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label>开始日期</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>截止日</Label>
              <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>预计用时（小时）</Label>
              <Input type="number" min="0.5" step="0.5" value={hours} onChange={e => setHours(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>优先级</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">🔴 高</SelectItem>
                  <SelectItem value="2">🟡 中</SelectItem>
                  <SelectItem value="3">🟢 低</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="split" checked={splittable} onCheckedChange={v => setSplittable(!!v)} />
              <Label htmlFor="split" className="cursor-pointer">可拆分为多天完成</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label>时段偏好</Label>
              <Select value={pref} onValueChange={v => setPref(v as TimePref)}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">任何时间</SelectItem>
                  <SelectItem value="morning">🌅 早上</SelectItem>
                  <SelectItem value="afternoon">🌤 下午</SelectItem>
                  <SelectItem value="evening">🌙 晚上</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>备注（可选）</Label>
            <Textarea rows={2} placeholder="要求、资料链接、注意事项…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save} disabled={saving}>{saving ? '保存中…' : '保存并排程'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
