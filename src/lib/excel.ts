// 教务 Excel 解析器（浏览器端，基于 SheetJS）
// 设计原则：宽容解析 —— 支持常见的正方/强智/自定义导出格式，
// 识别不出时给出列映射提示，解析器持续按你的真实文件迭代
import * as XLSX from 'xlsx';
import type { Course } from './types';

// 默认节次时刻表（可在设置中调整）
export const DEFAULT_SLOTS: Record<number, [string, string]> = {
  1: ['08:00', '08:45'], 2: ['08:55', '09:40'],
  3: ['10:00', '10:45'], 4: ['10:55', '11:40'],
  5: ['14:00', '14:45'], 6: ['14:55', '15:40'],
  7: ['16:00', '16:45'], 8: ['16:55', '17:40'],
  9: ['18:30', '19:15'], 10: ['19:25', '20:10'],
  11: ['20:20', '21:05'], 12: ['21:15', '22:00'],
};

export interface ParseResult {
  courses: Omit<Course, 'id' | 'color'>[];
  warnings: string[];
  rawRows: string[][];
  headerRow: number;
  mapping: Record<string, number | null>; // 字段 -> 列索引
}

const FIELD_KEYS = ['name', 'teacher', 'location', 'dow', 'weeks', 'section', 'time'] as const;
type FieldKey = typeof FIELD_KEYS[number];

const HEADER_HINTS: Record<FieldKey, RegExp[]> = {
  name: [/课程.*名/, /^课程$/, /课程名称/, /名称/],
  teacher: [/教师/, /老师/, /主讲/],
  location: [/地点/, /教室/, /校区/, /上课地点/],
  dow: [/星期/, /周几/, /^周$/],
  weeks: [/周次/, /上课周/, /周数/],
  section: [/节次/, /节数/, /节/],
  time: [/时间/, /时段/, /起止/],
};

// 读文件 → 所有 sheet 的二维字符串数组
export async function readExcel(file: File): Promise<{ sheetName: string; rows: string[][] }[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames.map(name => ({
    sheetName: name,
    rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, defval: '' })
      .map(r => (r as unknown[]).map(c => String(c ?? '').trim())),
  })).filter(s => s.rows.length > 0);
}

// 自动识别表头行 + 列映射
function detectHeader(rows: string[][]): { headerRow: number; mapping: Record<FieldKey, number | null> } {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    const mapping = {} as Record<FieldKey, number | null>;
    let matched = 0;
    for (const key of FIELD_KEYS) {
      const idx = row.findIndex(cell => HEADER_HINTS[key].some(re => re.test(cell)));
      mapping[key] = idx >= 0 ? idx : null;
      if (idx >= 0) matched++;
    }
    // 表头判据：课程名列 + （星期列或时间列）命中
    if (mapping.name !== null && (mapping.dow !== null || mapping.time !== null) && matched >= 2) {
      return { headerRow: i, mapping };
    }
  }
  // 兜底：默认列序 [名称, 教师, 星期, 节次, 周次, 地点]
  return {
    headerRow: 0,
    mapping: { name: 0, teacher: 1, dow: 2, section: 3, weeks: 4, location: 5, time: null },
  };
}

// 解析星期：星期一/周一/1 → 1~7（7=周日）
export function parseDow(s: string): number | null {
  const t = s.replace(/\s/g, '');
  const zh: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  const m = t.match(/周?期?([一二三四五六日天])/);
  if (m) return zh[m[1]];
  const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
  if (n >= 1 && n <= 7) return n;
  if (n === 0) return 7;
  return null;
}

// 解析周次：1-16周 / 第3-10周 / 1-16周(单) → [1,16]
export function parseWeeks(s: string): [number, number] | null {
  const m = s.match(/(\d+)\s*[-~—]\s*(\d+)/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  const single = s.match(/(\d+)/);
  if (single) { const n = parseInt(single[1], 10); return [n, n]; }
  return null;
}

// 解析节次：1-2节 / 3-4节(双) → 起止小节号
export function parseSection(s: string): [number, number] | null {
  const m = s.match(/(\d+)\s*[-~—]\s*(\d+)/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  const single = s.match(/(\d+)/);
  if (single) { const n = parseInt(single[1], 10); return [n, n]; }
  return null;
}

// 解析时刻：08:00-09:40 / 8:00~9:40
export function parseTimeRange(s: string): [string, string] | null {
  const m = s.match(/(\d{1,2}:\d{2})\s*[-~—]\s*(\d{1,2}:\d{2})/);
  if (m) return [m[1], m[2]];
  return null;
}

function padTime(t: string): string {
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

// 星期中文 → 数字（1=周一 ... 7=周日）
const ZH_DOW: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };

// 判断是否为网格型课表（行=节次、列=星期），如「学生个人课表」导出
function detectGrid(rows: string[][]): boolean {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const hits = rows[i].filter(c => /^星期?[一二三四五六日天]$/.test(c)).length;
    if (hits >= 5) return true;
  }
  return false;
}

// 解析周次模式：1-14周 / 1-8周(单) / 1,3,5,7,9,11,13,15,17周
export function parseWeekPattern(part: string): { weeks: [number, number]; weekKind?: 'all' | 'odd' | 'even' | 'list'; weekList?: number[] } | null {
  const parity = part.includes('单') ? 'odd' as const : part.includes('双') ? 'even' as const : null;
  const listMatch = part.match(/((?:\d+\s*,\s*)+\d+)\s*周/);
  if (listMatch) {
    const list = listMatch[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
    if (!list.length) return null;
    const allOdd = list.every(n => n % 2 === 1);
    const allEven = list.every(n => n % 2 === 0);
    const kind = parity || (allOdd ? 'odd' : allEven ? 'even' : 'list');
    return {
      weeks: [Math.min(...list), Math.max(...list)],
      weekKind: kind,
      weekList: kind === 'list' ? list : undefined,
    };
  }
  const range = part.match(/(\d+)\s*[-~—]\s*(\d+)\s*周/);
  if (range) {
    const a = parseInt(range[1], 10), b = parseInt(range[2], 10);
    return { weeks: [Math.min(a, b), Math.max(a, b)], weekKind: parity || 'all' };
  }
  const single = part.match(/(\d+)\s*周/);
  if (single) { const n = parseInt(single[1], 10); return { weeks: [n, n], weekKind: 'all' }; }
  return null;
}

// 网格型课表解析（华中师大「学生个人课表」等格式）
// 结构：表头行 = 星期一~星期日；左侧列 = 节次标签（含起止时刻）；
// 单元格 = 课程名\n教师;周次;地点
export function parseGridSchedule(rows: string[][]): ParseResult {
  const warnings: string[] = [];
  const courses: Omit<Course, 'id' | 'color'>[] = [];

  // 定位表头行与星期列
  let headerRow = -1;
  const colDow = new Map<number, number>();
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const found = new Map<number, number>();
    rows[i].forEach((cell, ci) => {
      const m = cell.match(/^星期?([一二三四五六日天])$/);
      if (m) found.set(ci, ZH_DOW[m[1]] % 7); // 7(周日) -> 0
    });
    if (found.size >= 5) { headerRow = i; colDow.clear(); found.forEach((v, k) => colDow.set(k, v)); break; }
  }
  if (headerRow < 0) {
    return { courses: [], warnings: ['未找到星期表头，无法按网格格式解析'], rawRows: rows, headerRow: -1, mapping: {} as never };
  }

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const label = row[0] || '';
    const tr = parseTimeRange(label);
    if (!tr) continue;
    const start = padTime(tr[0]), end = padTime(tr[1]);

    for (const [ci, dow] of colDow) {
      const cellVal = (row[ci] || '').trim();
      if (!cellVal) continue;
      const lines = cellVal.split(/\n+/).map(s => s.trim()).filter(Boolean);
      const name = lines[0];
      if (!name) continue;
      const parts = lines.slice(1).join(';').split(/[;；]/).map(s => s.trim()).filter(Boolean);

      let teacher: string | undefined, location: string | undefined;
      let wp: ReturnType<typeof parseWeekPattern> = null;
      for (const part of parts) {
        if (/周/.test(part) && !wp) {
          wp = parseWeekPattern(part);
          if (!wp) warnings.push(`第 ${r + 1} 行「${name}」的周次「${part}」无法识别`);
        } else if (/教授|讲师|副教授|教师|老师/.test(part) && !teacher) {
          teacher = part;
        } else if (!location) {
          location = part;
        }
      }
      if (!wp) {
        warnings.push(`第 ${r + 1} 行「${name}」缺少周次信息，按 1-16 周处理`);
        wp = { weeks: [1, 16], weekKind: 'all' };
      }
      courses.push({
        name, teacher, location, dow, start, end,
        weeks: wp.weeks,
        weekKind: wp.weekKind,
        weekList: wp.weekList,
      });
    }
  }

  if (courses.length === 0) warnings.push('网格解析未得到任何课程');
  return { courses, warnings, rawRows: rows, headerRow, mapping: {} as never };
}

// 主解析入口：自动识别网格型 / 行列表型
export function parseCourses(rows: string[][], slots: Record<number, [string, string]> = DEFAULT_SLOTS): ParseResult {
  if (detectGrid(rows)) return parseGridSchedule(rows);
  return parseRowsSchedule(rows, slots);
}

// 行列表型（教务系统「选课结果列表」导出：每行一门课）
function parseRowsSchedule(rows: string[][], slots: Record<number, [string, string]> = DEFAULT_SLOTS): ParseResult {
  const warnings: string[] = [];
  const courses: Omit<Course, 'id' | 'color'>[] = [];
  const { headerRow, mapping } = detectHeader(rows);

  const cell = (row: string[], key: FieldKey): string => {
    const idx = mapping[key];
    return idx === null || idx === undefined ? '' : (row[idx] ?? '');
  };

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c)) continue;
    const name = cell(row, 'name');
    if (!name) continue;

    let dow: number | null = null, start = '', end = '';
    let weeks: [number, number] | null = null;

    if (mapping.time !== null && cell(row, 'time')) {
      const tr = parseTimeRange(cell(row, 'time'));
      if (tr) { start = padTime(tr[0]); end = padTime(tr[1]); }
    }
    if (mapping.dow !== null) dow = parseDow(cell(row, 'dow'));
    if (mapping.weeks !== null) weeks = parseWeeks(cell(row, 'weeks'));

    if ((!start || !end) && mapping.section !== null) {
      const sec = parseSection(cell(row, 'section'));
      if (sec && slots[sec[0]] && slots[sec[1]]) {
        start = slots[sec[0]][0];
        end = slots[sec[1]][1];
      }
    }

    if (!dow || !start || !end || !weeks) {
      warnings.push(`第 ${i + 1} 行「${name}」解析不完整（星期=${cell(row, 'dow') || '?'} 节次/时间=${cell(row, 'section') || cell(row, 'time') || '?'} 周次=${cell(row, 'weeks') || '?'}），已跳过`);
      continue;
    }
    courses.push({
      name,
      teacher: cell(row, 'teacher') || undefined,
      location: cell(row, 'location') || undefined,
      dow: dow === 7 ? 0 : dow, // 统一 0=周日
      start, end, weeks,
    });
  }

  if (courses.length === 0) {
    warnings.push('未能从文件中解析出任何课程，请检查文件格式，或在下方手动录入');
  }
  return { courses, warnings, rawRows: rows, headerRow, mapping };
}
