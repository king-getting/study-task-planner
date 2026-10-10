// 课程表视图：按星期分组的课程列表 + Excel 导入（含预览）+ 手动添加
import { useMemo, useState } from 'react';
import { Upload, Trash2, Plus, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { WEEKDAYS } from '@/lib/date';
import { weekLabel } from '@/lib/course';
import { readExcel, parseCourses, DEFAULT_SLOTS, type ParseResult } from '@/lib/excel';
import type { AppState } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Props { state: AppState; refresh: () => Promise<void>; }

export default function CoursesView({ state, refresh }: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<number, AppState['courses']> = {};
    for (let i = 1; i <= 7; i++) g[i] = [];
    for (const c of state.courses) {
      const key = c.dow === 0 ? 7 : c.dow;
      g[key].push(c);
    }
    for (const k of Object.keys(g)) g[Number(k)].sort((a, b) => a.start.localeCompare(b.start));
    return g;
  }, [state.courses]);

  async function removeCourse(id: string) {
    if (!confirm('删除这门课程？')) return;
    await api.deleteCourse(id);
    await refresh();
  }

  async function clearAll() {
    if (!confirm('清空全部课程？此操作不可撤销。')) return;
    await api.clearCourses();
    await refresh();
    toast.success('已清空课程表');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" />导入教务 Excel</Button>
        <Button variant="outline" onClick={() => setManualOpen(true)}><Plus className="mr-1 h-4 w-4" />手动添加</Button>
        {state.courses.length > 0 && (
          <Button variant="ghost" className="text-red-500" onClick={clearAll}><Trash2 className="mr-1 h-4 w-4" />清空全部</Button>
        )}
        <span className="ml-auto text-sm text-slate-400">共 {state.courses.length} 门次</span>
      </div>

      {state.courses.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white py-16 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-slate-500">还没有课程。从教务系统导出课程表 Excel，点上方「导入」即可。</p>
          <p className="mt-1 text-xs text-slate-400">支持常见的正方/强智教务导出格式，解析失败时可以手动添加</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(grouped).map(([dowKey, list]) => {
            const dow = Number(dowKey);
            if (!list.length) return null;
            return (
              <div key={dowKey} className="rounded-xl border bg-white">
                <div className="border-b px-4 py-2.5 text-sm font-semibold text-slate-600">{WEEKDAYS[dow % 7]} · {list.length} 门</div>
                <ul className="divide-y">
                  {list.map(c => (
                    <li key={c.id} className="group flex items-start gap-3 px-4 py-3">
                      <i className="mt-1.5 h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.color || '#5b8def' }} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-slate-500">
                          {c.start} - {c.end} · {weekLabel(c)}
                          {c.location ? ` · ${c.location}` : ''}{c.teacher ? ` · ${c.teacher}` : ''}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => removeCourse(c.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={async () => { setImportOpen(false); await refresh(); }} />
      <ManualDialog open={manualOpen} onOpenChange={setManualOpen} onDone={async () => { setManualOpen(false); await refresh(); }} />
    </div>
  );
}

// ---------- Excel 导入对话框：选文件 → 预览 → 确认 ----------
function ImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => Promise<void> }) {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [sheets, setSheets] = useState<{ sheetName: string; rows: string[][] }[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [replace, setReplace] = useState(true);
  const [importing, setImporting] = useState(false);

  async function onFile(f: File) {
    try {
      const ss = await readExcel(f);
      setSheets(ss);
      setSheetIdx(0);
      setResult(parseCourses(ss[0].rows, DEFAULT_SLOTS));
    } catch (e) {
      toast.error('文件读取失败：' + (e instanceof Error ? e.message : ''));
    }
  }

  function switchSheet(i: number) {
    setSheetIdx(i);
    setResult(parseCourses(sheets[i].rows, DEFAULT_SLOTS));
  }

  async function confirm() {
    if (!result || result.courses.length === 0) return;
    setImporting(true);
    try {
      if (replace) await api.clearCourses();
      await api.addCourses(result.courses);
      toast.success(`成功导入 ${result.courses.length} 门课程`);
      setResult(null);
      await onDone();
    } finally { setImporting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) setResult(null); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>导入课程表（Excel）</DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="grid gap-3 py-4">
            <Label>选择教务系统导出的 Excel 文件（.xls / .xlsx）</Label>
            <Input type="file" accept=".xls,.xlsx" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
            <p className="text-xs text-slate-400">
              提示：通常在教务系统「课表查询 → 导出」处获得。如果解析结果不对，把文件发给我，我来适配格式。
            </p>
          </div>
        ) : (
          <div className="grid max-h-[60vh] gap-3 overflow-auto py-2">
            {sheets.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">工作表：</span>
                {sheets.map((s, i) => (
                  <Button key={i} size="sm" variant={i === sheetIdx ? 'default' : 'outline'} onClick={() => switchSheet(i)}>{s.sheetName}</Button>
                ))}
              </div>
            )}
            <p className="text-sm text-slate-600">
              解析出 <b className="text-indigo-600">{result.courses.length}</b> 门课程
              {result.warnings.length > 0 && <span className="text-amber-600">（{result.warnings.length} 条警告）</span>}
            </p>
            {result.warnings.length > 0 && (
              <div className="max-h-28 space-y-0.5 overflow-auto rounded bg-amber-50 p-2 text-xs text-amber-700">
                {result.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
              </div>
            )}
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-slate-400">
                  <th className="p-1.5">课程</th><th className="p-1.5">星期</th><th className="p-1.5">时间</th><th className="p-1.5">周次</th><th className="p-1.5">地点</th>
                </tr>
              </thead>
              <tbody>
                {result.courses.slice(0, 50).map((c, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="p-1.5 font-medium">{c.name}</td>
                    <td className="p-1.5">{WEEKDAYS[c.dow]}</td>
                    <td className="p-1.5">{c.start}-{c.end}</td>
                    <td className="p-1.5">{weekLabel(c)}</td>
                    <td className="p-1.5 text-slate-500">{c.location || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.courses.length > 50 && <p className="text-xs text-slate-400">…仅预览前 50 条，导入后完整显示</p>}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} className="accent-indigo-600" />
              导入前清空现有课程（避免重复）
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { setResult(null); onOpenChange(false); }}>取消</Button>
          {result && <Button onClick={confirm} disabled={importing || result.courses.length === 0}>{importing ? '导入中…' : `导入 ${result.courses.length} 门`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- 手动添加课程 ----------
function ManualDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [dow, setDow] = useState('1');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('09:40');
  const [weeks, setWeeks] = useState('1-16');
  const [location, setLocation] = useState('');
  const [teacher, setTeacher] = useState('');

  async function save() {
    if (!name.trim()) { toast.error('请填写课程名'); return; }
    const wm = weeks.match(/(\d+)\s*[-~—]\s*(\d+)/);
    if (!wm) { toast.error('周次格式如 1-16'); return; }
    await api.addCourses([{
      name: name.trim(), dow: dow === '7' ? 0 : parseInt(dow, 10), start, end,
      weeks: [parseInt(wm[1], 10), parseInt(wm[2], 10)],
      location: location || undefined, teacher: teacher || undefined,
    }]);
    toast.success('已添加');
    setName(''); setLocation(''); setTeacher('');
    await onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>手动添加课程</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5"><Label>课程名 *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="高等数学" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>星期</Label>
              <select value={dow} onChange={e => setDow(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
                {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{WEEKDAYS[n % 7]}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5"><Label>周次（如 1-16）</Label><Input value={weeks} onChange={e => setWeeks(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>开始</Label><Input type="time" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>结束</Label><Input type="time" value={end} onChange={e => setEnd(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>地点</Label><Input value={location} onChange={e => setLocation(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>教师</Label><Input value={teacher} onChange={e => setTeacher(e.target.value)} /></div>
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
