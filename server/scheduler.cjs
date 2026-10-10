// 排程引擎：把任务剩余工作量均衡分配到截止日前的可用空档
// 策略：按截止日+优先级排序 -> 每天容量上限 -> 空档优先填补 -> 块长不超过 blockMaxMin

const { save } = require('./store.cjs');

// ---------- 日期工具 ----------
function dstr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function parseD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); }
function dayOfWeek(s) { return parseD(s).getDay(); } // 0=周日
function diffDays(a, b) { return Math.round((parseD(b) - parseD(a)) / 86400000); }
function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function toHM(min) { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }

// ---------- 每日忙碌区间 ----------
// 返回 [{start, end, kind: course|block|busy, label}]
// 规则：busy/holiday 事件整天停课停排；adjust 事件按指定星期上课；法定节假日停课
function busyIntervals(state, date) {
  const out = [];
  const dow = dayOfWeek(date);

  // 校历 busy / holiday 整天封锁（运动会、临时放假等）
  const ev = state.events.find(e => e.date === date && (e.type === 'busy' || e.type === 'holiday'));
  if (ev) return [{ start: 0, end: 1440, kind: 'busy', label: ev.name }];

  // 调休：上 copyDate 的课。源日期按"本来应该有的课"计算——
  // 即使源日期本身是节假日被停课，学校通知"补X日的课"指的也是它原本的课表
  const adjust = state.events.find(e => e.date === date && e.type === 'adjust');
  const sourceDate = adjust && adjust.copyDate && adjust.copyDate !== date ? adjust.copyDate : null;
  const effDate = sourceDate || date;
  const skipCourses = !sourceDate && state.holidays.some(h => h.date === date);
  const effectiveDow = dayOfWeek(effDate);

  // 课程
  const semStart = state.settings.semesterStart;
  const weekNo = Math.floor(diffDays(semStart, effDate) / 7) + 1;
  if (!skipCourses) {
    for (const c of state.courses) {
      if (!c.weeks) continue;
      if (weekNo >= c.weeks[0] && weekNo <= c.weeks[1] && weekPatternMatch(c, weekNo)) {
        if (c.dow === effectiveDow) {
          out.push({ start: toMin(c.start), end: toMin(c.end), kind: 'course', label: c.name });
        }
      }
    }
  }
  // 每日午休
  if (state.settings.napStart && state.settings.napEnd) {
    out.push({ start: toMin(state.settings.napStart), end: toMin(state.settings.napEnd), kind: 'nap', label: '午休' });
  }

  // 考试占用
  for (const ex of state.exams || []) {
    if (ex.date === date) {
      out.push({ start: toMin(ex.start), end: toMin(ex.end), kind: 'exam', label: ex.courseName });
    }
  }

  // 已排/已完成的时间块：done 也占用当天时间——完成后的空档不再回填新任务；
  // skipped 不占用（工作量还在剩余里，会被重新安排到别的空档）
  for (const b of state.blocks) {
    if (b.date === date && b.status !== 'skipped') {
      out.push({ start: toMin(b.start), end: toMin(b.end), kind: 'block', label: b.taskId });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// 空闲缝隙（可排任务的空档）
function freeGaps(state, date, extraBlocks = []) {
  const s = state.settings;
  const dayStart = toMin(s.dayStart), dayEnd = toMin(s.dayEnd);
  const busy = busyIntervals(state, date).concat(extraBlocks.map(b => ({ start: toMin(b.start), end: toMin(b.end), kind: 'block' })));
  busy.sort((a, b) => a.start - b.start);
  const gaps = [];
  let cur = dayStart;
  for (const b of busy) {
    if (b.start > cur && b.start - cur >= s.minGapMin) gaps.push({ start: cur, end: b.start });
    cur = Math.max(cur, b.end);
  }
  if (dayEnd > cur && dayEnd - cur >= s.minGapMin) gaps.push({ start: cur, end: dayEnd });
  return gaps;
}

// 某日剩余可排分钟数
function dayCapacity(state, date, extraBlocks = []) {
  const s = state.settings;
  const holiday = state.holidays.some(h => h.date === date);
  // 节假日放宽到 1.5 倍容量（没有课）
  const cap = holiday ? Math.round(s.dailyCapacityMin * 1.5) : s.dailyCapacityMin;
  const used = extraBlocks.reduce((sum, b) => sum + (toMin(b.end) - toMin(b.start)), 0);
  return Math.max(0, cap - used);
}

// ---------- 主排程 ----------
function run(state, opts = {}) {
  const today = opts.today || dstr(new Date());
  const warnings = [];

  // 1. 清掉今天之后的 planned 块（重新排），保留历史 done/skipped 和手动锁定的块
  state.blocks = state.blocks.filter(b => b.status !== 'planned' || b.date < today || b.locked);

  // 2. 计算每个任务的剩余分钟数
  const tasks = state.tasks
    .filter(t => t.status !== 'done')
    .map(t => {
      const doneMin = state.blocks
        .filter(b => b.taskId === t.id && b.status === 'done')
        .reduce((s, b) => s + b.minutes, 0);
      const progress = t.progress || 0;
      const remaining = Math.max(0, Math.round(t.estimatedMin * (1 - progress)) - doneMin);
      return { ...t, remaining };
    })
    .filter(t => t.remaining > 0 && t.deadline >= today)
    .sort((a, b) => (a.deadline - b.deadline) || ((a.priority || 3) - (b.priority || 3)));

  const dropped = state.tasks.filter(t => t.status !== 'done' && t.deadline < today && (t.estimatedMin > 0));
  if (dropped.length) warnings.push(`有 ${dropped.length} 个任务已过截止日仍未完成：${dropped.map(t => t.title).join('、')}`);

  // 今天已完成的各任务分钟数（已完成剂量不再重复排）
  const doneToday = {};
  for (const b of state.blocks) {
    if (b.date === today && b.status === 'done') doneToday[b.taskId] = (doneToday[b.taskId] || 0) + b.minutes;
  }
  // 当前时刻：今天只剩"现在之后"的时间可排
  const nowHM = toHM(new Date().getHours() * 60 + new Date().getMinutes() + 10);
  const todayBusy = [{ start: '00:00', end: nowHM }];

  // 3. 逐任务分配（从开始日期起）
  for (const task of tasks) {
    const start = task.startDate && task.startDate > today ? task.startDate : today;
    const days = [];
    for (let d = start; d <= task.deadline; d = addDays(d, 1)) days.push(d);

    // 每天的可用量（今天只算现在之后的空档）
    const avail = days.map(d => {
      const extra = d === today ? todayBusy : [];
      return Math.min(dayCapacity(state, d), totalFreeMin(state, d, extra));
    });
    let totalAvail = avail.reduce((a, b) => a + b, 0);

    if (totalAvail < task.remaining) {
      warnings.push(`「${task.title}」剩余约 ${task.remaining} 分钟，但到截止日只剩约 ${totalAvail} 分钟空档，已尽量排满，建议调整截止日或拆减范围`);
    }

    // 均衡目标：每天 remaining/nDays，但受每天可用量限制
    let left = Math.min(task.remaining, totalAvail || task.remaining);
    const perDay = task.remaining / days.length;

    for (let i = 0; i < days.length && left > 0; i++) {
      const d = days[i];
      let want = Math.min(perDay, avail[i], left);
      if (i === days.length - 1) want = Math.min(avail[i], left); // 最后一天收尾
      // 今天已完成的剂量从目标里扣掉，不重复排
      if (d === today) want = Math.max(0, want - (doneToday[task.id] || 0));
      want = Math.round(want);
      if (want <= 0) continue;

      const created = fillDay(state, d, task, want, d === today ? todayBusy : []);
      left -= created;
    }
  }

  save();
  return { warnings, plannedBlocks: state.blocks.filter(b => b.status === 'planned' && b.date >= today).length };
}

function totalFreeMin(state, date, extraBusy = []) {
  return freeGaps(state, date, extraBusy).reduce((s, g) => s + (g.end - g.start), 0);
}

// 按任务时段偏好筛选/排序空档：morning<12:00 afternoon<18:00 evening>=18:00
function gapsForPref(gaps, pref) {
  const MORNING_END = 12 * 60, AFTERNOON_END = 18 * 60;
  let win;
  if (pref === 'morning') win = g => g.start < MORNING_END;
  else if (pref === 'afternoon') win = g => g.start >= MORNING_END && g.start < AFTERNOON_END;
  else if (pref === 'evening') win = g => g.start >= AFTERNOON_END;
  else return gaps;
  const inWin = gaps.filter(win);
  return inWin.length ? inWin : gaps; // 偏好窗口没空位则退化为全部空档
}

// 在某天缝隙里填 want 分钟，切成不超过 blockMaxMin 的块
// 尊重任务时段偏好 + 全局任务最早开始时间
function fillDay(state, date, task, want, extraBusy = []) {
  const s = state.settings;
  const taskStart = s.taskStart ? toMin(s.taskStart) : 0;
  let gaps = freeGaps(state, date, extraBusy)
    .map(g => ({ start: Math.max(g.start, taskStart), end: g.end }))
    .filter(g => g.end - g.start >= s.minGapMin);
  gaps = gapsForPref(gaps, task.pref);
  let left = want, created = 0;
  const newBlocks = [];

  for (const g of gaps) {
    if (left <= 0) break;
    // 优先从空档头部开始
    let room = g.end - g.start;
    while (room >= s.minGapMin && left > 0) {
      const len = Math.min(room, left, s.blockMaxMin);
      const startMin = g.start + (g.end - g.start - room);
      newBlocks.push({
        id: require('./store.cjs').uid('blk'),
        taskId: task.id,
        date,
        start: toHM(startMin),
        end: toHM(startMin + len),
        minutes: len,
        status: 'planned',
      });
      room -= len; left -= len; created += len;
    }
  }
  state.blocks.push(...newBlocks);
  return created;
}

function weekPatternMatch(c, weekNo) {
  const kind = c.weekKind || 'all';
  if (kind === 'all') return true;
  if (kind === 'odd') return weekNo % 2 === 1;
  if (kind === 'even') return weekNo % 2 === 0;
  return (c.weekList || []).includes(weekNo);
}

module.exports = { run, freeGaps, busyIntervals, dstr, addDays, diffDays, dayOfWeek, toMin, toHM };
