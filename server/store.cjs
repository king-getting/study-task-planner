// 数据存储层：JSON 文件持久化 + 原子写入 + 每日自动备份
const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const defaultState = {
  settings: {
    semesterStart: '2026-09-07',   // 第 1 周周一
    dayStart: '07:00',
    dayEnd: '23:00',
    napStart: '12:50',            // 每日午休起点
    napEnd: '13:40',              // 每日午休终点
    dailyCapacityMin: 240,          // 每天最多安排多少分钟任务
    blockMaxMin: 90,                // 单个子任务块最长多少分钟
    minGapMin: 45,                  // 碎片时间阈值：小于此长度的空档不排任务
    taskStart: '08:00',             // 任务最早开始时间（之前留作晨间 routine）
    autoRegenerate: true,           // 有变动时自动重排
  },
  courses: [],
  tasks: [],
  blocks: [],       // 排程产出的时间块 {id, taskId, date, start, end, minutes, status: planned|done|skipped}
  events: [],       // 校历特殊日 {id, date, type: busy|holiday|exam|adjust, name, copyDate}
  exams: [],        // 期末考试 {id, courseId, courseName, date, start, end, location, notes}
  focusSessions: [], // 专注记录 {id, date, taskId, blockId, title, start, end, minutes, status}
  goals: [],        // 学习目标（学习引擎用，第一版预留）
  holidays: [       // 法定节假日，可在设置里核对修改
    { date: '2026-01-01', name: '元旦' },
    { date: '2026-02-16', 'name': '春节' },
    { date: '2026-02-17', name: '春节' },
    { date: '2026-02-18', name: '春节' },
    { date: '2026-02-19', name: '春节' },
    { date: '2026-02-20', name: '春节' },
    { date: '2026-02-21', name: '春节' },
    { date: '2026-02-22', name: '春节' },
    { date: '2026-04-04', name: '清明节' },
    { date: '2026-04-05', name: '清明节' },
    { date: '2026-04-06', name: '清明节' },
    { date: '2026-05-01', name: '劳动节' },
    { date: '2026-05-02', name: '劳动节' },
    { date: '2026-05-03', name: '劳动节' },
    { date: '2026-05-04', name: '劳动节' },
    { date: '2026-05-05', name: '劳动节' },
    { date: '2026-06-19', name: '端午节' },
    { date: '2026-06-20', name: '端午节' },
    { date: '2026-06-21', name: '端午节' },
    { date: '2026-10-01', name: '国庆节' },
    { date: '2026-10-02', name: '国庆节' },
    { date: '2026-10-03', name: '国庆节' },
    { date: '2026-10-04', name: '国庆节' },
    { date: '2026-10-05', name: '国庆节' },
    { date: '2026-10-06', name: '国庆节' },
    { date: '2026-10-07', name: '国庆节' },
  ],
};

let state = null;

function load() {
  if (state) return state;
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      state = { ...defaultState, ...raw, settings: { ...defaultState.settings, ...(raw.settings || {}) } };
      return state;
    } catch (e) {
      console.error('data.json 解析失败，使用默认状态', e);
    }
  }
  state = JSON.parse(JSON.stringify(defaultState));
  save();
  return state;
}

function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_FILE);
  backup();
}

function backup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const backupFile = path.join(BACKUP_DIR, `data-${today}.json`);
    if (!fs.existsSync(backupFile)) fs.copyFileSync(DATA_FILE, backupFile);
  } catch (e) { /* 备份失败不影响主流程 */ }
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

module.exports = { load, save, uid, DATA_FILE };
