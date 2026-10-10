// 课程周次规则 + 某日课程计算（含节假日停课 / 调休上课规则）
import type { Course, CalEvent, Holiday } from './types';
import { dayOfWeek, diffDays } from './date';

export function courseActiveOnWeek(c: Course, weekNo: number): boolean {
  if (weekNo < c.weeks[0] || weekNo > c.weeks[1]) return false;
  const kind = c.weekKind || 'all';
  if (kind === 'all') return true;
  if (kind === 'odd') return weekNo % 2 === 1;
  if (kind === 'even') return weekNo % 2 === 0;
  return (c.weekList || []).includes(weekNo);
}

// 某日期对应第几教学周（semesterStart 为第 1 周周一）
export function weekOfDate(semesterStart: string, date: string): number {
  return Math.floor(diffDays(semesterStart, date) / 7) + 1;
}

/**
 * 计算某天实际上有哪些课。规则：
 * - busy / holiday 事件（运动会、临时放假）→ 当天停课
 * - adjust 事件（调休）→ 当天上 copyDate 那天的课（不再连锁套调休）
 * - 法定节假日 → 停课（除非有 adjust 事件）
 * - 其余按正常星期 + 周次规则
 */
export function coursesOnDate(
  courses: Course[], events: CalEvent[], holidays: Holiday[],
  semesterStart: string, date: string,
): Course[] {
  const evs = events.filter(e => e.date === date);
  if (evs.some(e => e.type === 'busy' || e.type === 'holiday')) return [];
  const adjust = evs.find(e => e.type === 'adjust');
  // 调休：上 copyDate 的课。源日期按"它本来应该有的课"计算——
  // 即使源日期本身是节假日/有活动（被停了课），学校通知"补X日的课"指的也是它原本的课表
  const sourceDate = adjust?.copyDate && adjust.copyDate !== date ? adjust.copyDate : null;
  const effDate = sourceDate || date;
  if (!sourceDate && holidays.some(h => h.date === date)) return [];
  const dow = dayOfWeek(effDate);
  const weekNo = weekOfDate(semesterStart, effDate);
  return courses
    .filter(c => c.dow === dow && courseActiveOnWeek(c, weekNo))
    .sort((a, b) => a.start.localeCompare(b.start));
}

// 周次描述文本：1-17周 / 1-17周·单周 / 第9,11,13,15周
export function weekLabel(c: Pick<Course, 'weeks' | 'weekKind' | 'weekList'>): string {
  const range = c.weeks[0] === c.weeks[1] ? `第 ${c.weeks[0]} 周` : `${c.weeks[0]}-${c.weeks[1]}周`;
  const kind = c.weekKind || 'all';
  if (kind === 'odd') return `${range}·单周`;
  if (kind === 'even') return `${range}·双周`;
  if (kind === 'list') return `第${(c.weekList || []).join(',')}周`;
  return range;
}
