// 全局类型定义（前后端共享的数据结构）
export interface Settings {
  semesterStart: string;      // 第 1 周周一
  dayStart: string;           // 每日起点 "07:00"
  dayEnd: string;             // 每日终点 "23:00"
  napStart?: string;          // 每日午休起点
  napEnd?: string;            // 每日午休终点
  dailyCapacityMin: number;   // 每天最多排多少分钟任务
  blockMaxMin: number;        // 单个子任务块最长分钟
  minGapMin: number;          // 碎片时间阈值
  taskStart?: string;         // 任务最早开始时间（如 08:00，之前留作晨间 routine）
  autoRegenerate: boolean;
}

export interface Course {
  id: string;
  name: string;
  teacher?: string;
  location?: string;
  dow: number;                // 0=周日 1=周一 ... 6=周六
  start: string;              // "08:00"
  end: string;                // "09:35"
  weeks: [number, number];    // [1, 16] 周次范围
  weekKind?: 'all' | 'odd' | 'even' | 'list';  // 默认 all；list 时用 weekList
  weekList?: number[];        // weekKind=list 时的具体周
  color?: string;
}

export type TaskType = 'homework' | 'exam' | 'competition' | 'cert' | 'project' | 'other';
export type TaskStatus = 'todo' | 'doing' | 'done';
export type TimePref = 'any' | 'morning' | 'afternoon' | 'evening';

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  courseId?: string;          // 关联课程
  deadline: string;           // YYYY-MM-DD
  startDate?: string;         // 生效日期：此日期前不排程（默认今天）
  estimatedMin: number;       // 预计总分钟
  priority: 1 | 2 | 3;        // 1 最高
  status: TaskStatus;
  progress: number;           // 0~1
  splittable: boolean;
  pref?: TimePref;            // 时段偏好：morning<12:00 afternoon<18:00 evening>=18:00
  notes?: string;
  extra?: Record<string, unknown>;
}

export interface Block {
  id: string;
  taskId: string;
  date: string;
  start: string;
  end: string;
  minutes: number;
  status: 'planned' | 'done' | 'skipped';
  locked?: boolean;           // 手动固定时间：自动重排时保留
}

export interface CalEvent {
  id: string;
  date: string;
  type: 'busy' | 'holiday' | 'exam' | 'adjust';
  name: string;
  copyDate?: string;          // type=adjust 时：补哪一天的课（YYYY-MM-DD）
}

export interface Holiday {
  date: string;
  name: string;
}

export interface Exam {
  id: string;
  courseId?: string;          // 关联课程（可选）
  courseName: string;
  date: string;               // YYYY-MM-DD
  start: string;              // "09:00"
  end: string;                // "11:00"
  location?: string;
  notes?: string;
}

export interface FocusSession {
  id: string;
  runId?: string;             // 客户端生成的会话标识，用于断线重试去重
  date: string;               // YYYY-MM-DD
  taskId?: string;            // 关联任务（可选，自由专注为空）
  blockId?: string;           // 关联时间块
  title: string;              // 任务名快照
  start: string;              // "16:58"
  end: string;
  minutes: number;            // 实际专注分钟
  status: 'completed' | 'abandoned';
}

export interface AppState {
  settings: Settings;
  courses: Course[];
  tasks: Task[];
  blocks: Block[];
  events: CalEvent[];
  exams: Exam[];
  goals: unknown[];
  holidays: Holiday[];
  focusSessions: FocusSession[];
}

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  homework: '课程作业',
  exam: '考试复习',
  competition: '竞赛',
  cert: '考级考证',
  project: '项目/实践',
  other: '其他',
};

export const TASK_TYPE_COLOR: Record<TaskType, string> = {
  homework: '#5b8def',
  exam: '#e2725b',
  competition: '#c77dff',
  cert: '#3aa17e',
  project: '#e0a458',
  other: '#94a3b8',
};
