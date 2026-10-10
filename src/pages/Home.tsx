// 主界面外壳：顶部导航 + 五个主视图
import { useState } from 'react';
import { CalendarDays, CheckSquare, ListTodo, GraduationCap, Settings as SettingsIcon, PencilLine, Timer } from 'lucide-react';
import { useAppState } from '@/lib/useAppState';
import TodayView from '@/components/TodayView';
import CalendarView from '@/components/CalendarView';
import TasksView from '@/components/TasksView';
import CoursesView from '@/components/CoursesView';
import SettingsView from '@/components/SettingsView';
import ExamsView from '@/components/ExamsView';
import FocusView from '@/components/FocusView';
import { Toaster } from '@/components/ui/sonner';

const TABS = [
  { key: 'today', label: '今日', icon: CheckSquare },
  { key: 'focus', label: '专注', icon: Timer },
  { key: 'calendar', label: '日历', icon: CalendarDays },
  { key: 'tasks', label: '任务', icon: ListTodo },
  { key: 'exams', label: '考试', icon: PencilLine },
  { key: 'courses', label: '课程表', icon: GraduationCap },
  { key: 'settings', label: '设置', icon: SettingsIcon },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function Home() {
  const { state, refresh, error } = useAppState();
  const [tab, setTab] = useState<TabKey>('today');
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3">
          <div className="mr-4 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-base font-bold leading-tight">学业任务规划助手</h1>
              <p className="text-xs text-slate-400">记录 · 规划 · 每日闭环</p>
            </div>
          </div>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            ⚠️ {error}（请确认后端已启动：在项目目录运行 <code className="font-mono">npm run server</code>）
          </div>
        )}
        {!state ? (
          <div className="py-20 text-center text-slate-400">加载中…</div>
        ) : (
          <>
            {tab === 'today' && <TodayView state={state} refresh={refresh} goTasks={() => setTab('tasks')} goCalendar={() => setTab('calendar')} goFocus={(bid) => { setFocusBlockId(bid); setTab('focus'); }} />}
            {tab === 'focus' && <FocusView state={state} refresh={refresh} presetBlockId={focusBlockId} />}
            {tab === 'calendar' && <CalendarView state={state} refresh={refresh} />}
            {tab === 'tasks' && <TasksView state={state} refresh={refresh} goToday={() => setTab('today')} />}
            {tab === 'exams' && <ExamsView state={state} refresh={refresh} />}
            {tab === 'courses' && <CoursesView state={state} refresh={refresh} />}
            {tab === 'settings' && <SettingsView state={state} refresh={refresh} />}
          </>
        )}
      </main>
      <Toaster position="top-center" richColors />
    </div>
  );
}
