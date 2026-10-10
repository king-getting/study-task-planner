// 后端 API 服务：Express + JSON 文件存储
// 端口 7100（可用环境变量 PORT 覆盖），前端通过 /api 代理访问
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { load, save, uid, DATA_FILE } = require('./store.cjs');
const scheduler = require('./scheduler.cjs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, message: msg });

// ---------- 整体状态 ----------
app.get('/api/state', (req, res) => ok(res, load()));

// ---------- 任务 CRUD ----------
app.post('/api/tasks', (req, res) => {
  const s = load();
  const t = { id: uid('task'), status: 'todo', progress: 0, priority: 3, splittable: true, extra: {}, ...req.body };
  s.tasks.push(t);
  if (s.settings.autoRegenerate) scheduler.run(s);
  save();
  ok(res, t);
});

app.put('/api/tasks/:id', (req, res) => {
  const s = load();
  const i = s.tasks.findIndex(t => t.id === req.params.id);
  if (i < 0) return fail(res, '任务不存在', 404);
  s.tasks[i] = { ...s.tasks[i], ...req.body, id: s.tasks[i].id };
  if (s.settings.autoRegenerate) scheduler.run(s);
  save();
  ok(res, s.tasks[i]);
});

app.delete('/api/tasks/:id', (req, res) => {
  const s = load();
  s.tasks = s.tasks.filter(t => t.id !== req.params.id);
  s.blocks = s.blocks.filter(b => b.taskId !== req.params.id);
  save();
  ok(res, { deleted: req.params.id });
});

// ---------- 课程 CRUD + 批量导入 ----------
app.post('/api/courses', (req, res) => {
  const s = load();
  const list = Array.isArray(req.body) ? req.body : [req.body];
  const created = list.map(c => ({ id: uid('crs'), color: autoColor(s.courses.length), ...c }));
  s.courses.push(...created);
  if (s.settings.autoRegenerate) scheduler.run(s);
  save();
  ok(res, created);
});

app.delete('/api/courses/:id', (req, res) => {
  const s = load();
  s.courses = s.courses.filter(c => c.id !== req.params.id);
  save();
  ok(res, { deleted: req.params.id });
});

app.delete('/api/courses', (req, res) => {
  const s = load();
  const n = s.courses.length;
  s.courses = [];
  save();
  ok(res, { cleared: n });
});

// ---------- 手动排程 ----------
app.post('/api/schedule/run', (req, res) => {
  const s = load();
  const result = scheduler.run(s);
  ok(res, result);
});

// ---------- 时间块勾选回写 ----------
app.patch('/api/blocks/:id', (req, res) => {
  const s = load();
  const b = s.blocks.find(x => x.id === req.params.id);
  if (!b) return fail(res, '时间块不存在', 404);
  Object.assign(b, req.body, { id: b.id });
  // 若任务的所有块都完成，任务标记 done
  const task = s.tasks.find(t => t.id === b.taskId);
  if (task) {
    const rest = s.blocks.filter(x => x.taskId === task.id && x.status === 'planned');
    if (rest.length === 0 && s.blocks.some(x => x.taskId === task.id && x.status === 'done')) {
      task.status = 'done';
      task.progress = 1;
    }
  }
  if (s.settings.autoRegenerate) scheduler.run(s);
  save();
  ok(res, b);
});

// ---------- 期末考试 ----------
app.post('/api/exams', (req, res) => {
  const s = load();
  const e = { id: uid('exam'), location: undefined, notes: undefined, ...req.body };
  s.exams.push(e);
  if (s.settings.autoRegenerate) scheduler.run(s);
  save();
  ok(res, e);
});

app.put('/api/exams/:id', (req, res) => {
  const s = load();
  const i = s.exams.findIndex(e => e.id === req.params.id);
  if (i < 0) return fail(res, '考试不存在', 404);
  s.exams[i] = { ...s.exams[i], ...req.body, id: s.exams[i].id };
  if (s.settings.autoRegenerate) scheduler.run(s);
  save();
  ok(res, s.exams[i]);
});

app.delete('/api/exams/:id', (req, res) => {
  const s = load();
  s.exams = s.exams.filter(e => e.id !== req.params.id);
  if (s.settings.autoRegenerate) scheduler.run(s);
  save();
  ok(res, { deleted: req.params.id });
});

// ---------- 专注记录 ----------
// 删除某条专注记录
app.delete('/api/focus/:id', (req, res) => {
  const s = load();
  s.focusSessions = s.focusSessions.filter(x => x.id !== req.params.id);
  save();
  ok(res, { deleted: req.params.id });
});

// 完成专注：记录会话（先落盘再排程，保证记录绝不丢失），runId 用于断线重试去重
app.post('/api/focus', (req, res) => {
  const s = load();
  const { blockId, minutes, status, title, runId } = req.body;
  if (runId) {
    const dup = s.focusSessions.find(x => x.runId === runId);
    if (dup) return ok(res, dup); // 重复提交：直接返回已保存的会话
  }
  const now = new Date();
  const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const session = {
    id: uid('focus'),
    runId: runId || undefined,
    date: now.toISOString().slice(0, 10),
    blockId: blockId || undefined,
    title: title || '自由专注',
    start: hm(new Date(now.getTime() - (minutes || 0) * 60000)),
    end: hm(now),
    minutes: Math.max(0, Math.round(minutes || 0)),
    status: status === 'abandoned' ? 'abandoned' : 'completed',
  };
  s.focusSessions.push(session);
  save(); // 记录先落盘：即使后续排程出错，专注记录也已保存
  try {
    if (session.status === 'completed' && blockId) {
      const b = s.blocks.find(x => x.id === blockId);
      if (b && b.status !== 'done') {
        const credited = Math.min(session.minutes, b.minutes);
        b.minutes = credited;
        b.status = 'done';
        b.locked = false;
        session.taskId = b.taskId;
        const task = s.tasks.find(t => t.id === b.taskId);
        if (task) {
          const doneMin = s.blocks
            .filter(x => x.taskId === task.id && x.status === 'done')
            .reduce((sum, x) => sum + x.minutes, 0);
          task.progress = Math.min(1, Math.round((doneMin / task.estimatedMin) * 1000) / 1000);
          if (task.progress >= 1) task.status = 'done';
        }
      }
    }
    if (s.settings.autoRegenerate) scheduler.run(s);
    save();
  } catch (e) {
    console.error('专注抵扣/排程出错（记录已保存）:', e);
  }
  ok(res, session);
});

// ---------- 学习目标（学习引擎的原料） ----------
app.post('/api/goals', (req, res) => {
  const s = load();
  const g = { id: uid('goal'), createdAt: new Date().toISOString(), ...req.body };
  s.goals.push(g);
  save();
  ok(res, g);
});

app.put('/api/goals/:id', (req, res) => {
  const s = load();
  const i = s.goals.findIndex(g => g.id === req.params.id);
  if (i < 0) return fail(res, '目标不存在', 404);
  s.goals[i] = { ...s.goals[i], ...req.body, id: s.goals[i].id };
  save();
  ok(res, s.goals[i]);
});

app.delete('/api/goals/:id', (req, res) => {
  const s = load();
  s.goals = s.goals.filter(g => g.id !== req.params.id);
  save();
  ok(res, { deleted: req.params.id });
});

// ---------- 校历特殊日 ----------
app.post('/api/events', (req, res) => {
  const s = load();
  const e = { id: uid('evt'), type: 'busy', ...req.body };
  s.events.push(e);
  if (s.settings.autoRegenerate) scheduler.run(s);
  save();
  ok(res, e);
});

app.delete('/api/events/:id', (req, res) => {
  const s = load();
  s.events = s.events.filter(e => e.id !== req.params.id);
  if (s.settings.autoRegenerate) scheduler.run(s);
  save();
  ok(res, { deleted: req.params.id });
});

// ---------- 节假日核对修改 ----------
app.put('/api/holidays', (req, res) => {
  const s = load();
  s.holidays = req.body;
  if (s.settings.autoRegenerate) scheduler.run(s);
  save();
  ok(res, s.holidays);
});

// ---------- 设置 ----------
app.put('/api/settings', (req, res) => {
  const s = load();
  s.settings = { ...s.settings, ...req.body };
  if (s.settings.autoRegenerate) scheduler.run(s);
  save();
  ok(res, s.settings);
});

// ---------- 数据备份/恢复 ----------
app.post('/api/backup/restore', (req, res) => {
  const file = req.body.file;
  if (!/^data-\d{4}-\d{2}-\d{2}\.json$/.test(file)) return fail(res, '非法备份文件名');
  const p = path.join(__dirname, 'backups', file);
  if (!fs.existsSync(p)) return fail(res, '备份不存在', 404);
  fs.copyFileSync(p, DATA_FILE);
  ok(res, { restored: file });
});

function autoColor(i) {
  const palette = ['#5b8def', '#e2725b', '#3aa17e', '#c77dff', '#e0a458', '#4cc9f0', '#f25c7a', '#8ac926'];
  return palette[i % palette.length];
}

// ---------- 托管前端静态页面（单进程模式：一个端口同时提供 API 和网页） ----------
const DIST = path.join(__dirname, '..', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

const PORT = process.env.PORT || 7100;
app.listen(PORT, () => {
  console.log(`[server] App started: http://localhost:${PORT}`);
  const os = require('os');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`[server] Tablet/Phone (same Wi-Fi): http://${iface.address}:${PORT}`);
      }
    }
  }
  console.log('[server] Keep this window open while using the app.');
});
