# Study Task Planner（学业任务规划助手）

面向大学生的**任务记录 · 课表关联 · 均衡排程 · 专注计时**一体化本地 Web 应用。
把课程表、考试、竞赛、四六级目标倒排成每天可执行的时间块，配合番茄钟记录真实专注时间并自动抵扣任务进度。

## 功能总览

| 模块 | 说明 |
|---|---|
| 📋 今日 | 今日课程时间线 + 今日任务清单（勾选完成 / 跳过 / 调整时间并锁定） |
| 🍅 专注 | 番茄钟计时（15/25/45/60/90 分钟），完成按实际分钟数抵扣任务，历史记录按天分组 |
| 📅 日历 | 月/周视图：课程（含单双周）、调休补课、法定节假日、考试、任务块同屏呈现 |
| ✅ 任务 | 任务管理：截止日、优先级、时段偏好（早/中/晚）、生效日期，自动均衡排程 |
| 📝 考试 | 期末考试列表 + 日历标注 |
| 🎓 课程表 | 课表导入（Excel 网格格式）+ 手动维护 |
| ⚙️ 设置 | 作息时间（起床/睡觉/午休）、每日容量上限、碎片时间阈值、开学日期、节假日表 |

## 排程引擎设计（自研，无第三方依赖）

核心思路：**把每个任务的剩余工作量按"每天一剂"均衡分配到截止日前的可用空档**。

- **忙碌区间计算**：课程（含单双周 / 指定周列表）、午休、考试、节假日、调休（指定"补哪一天的课"，源日期按原始课表计算）、已完成时间块
- **均衡分配**：每天目标 = 剩余分钟 ÷ 剩余天数，块长不超过单块上限
- **抗跑步机**：完成的任务块占用当天时间，空档不回填新任务；今天已完成的剂量不重复排
- **现在之后**：每天只从当前时刻往后排，不假装能回到过去
- **手动锁定**：调整过时间的块可锁定（🔒），自动重排时保留
- **专注抵扣**：番茄钟完成多少分钟，任务块抵扣多少，剩余自动重排到后续日子
- 特殊日：节假日容量放宽 1.5 倍；调休日按源日期课表上课

## 技术栈

- **前端**：React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui + React Router
- **后端**：Node.js + Express（`server/`，CommonJS，`.cjs`），数据存于本地 JSON 文件（原子写入 + 每日备份）
- **排程**：`server/scheduler.cjs` 纯函数实现，前后端同一套数据结构（`src/lib/types.ts`）

## 目录结构

```
├── index.html / vite.config.ts / tailwind.config.js   # 前端工程配置
├── src/
│   ├── pages/Home.tsx          # 主界面外壳（顶部导航 + 视图切换）
│   ├── components/             # 今日 / 专注 / 日历 / 任务 / 考试 / 课程表 / 设置
│   ├── lib/                    # API 封装、类型定义、日期工具、课表解析
│   └── components/ui/          # shadcn/ui 组件（见下方说明）
├── server/
│   ├── index.cjs               # Express API（任务/课程/考试/调休/专注/设置）
│   ├── scheduler.cjs           # 排程引擎（忙碌区间、空档、均衡分配）
│   ├── store.cjs               # JSON 持久化（原子写入 + 备份 + 默认状态）
│   └── data.json               # 本地数据（首次启动自动生成；不上传仓库）
└── start.bat                   # Windows 一键启动（构建产物 + API 同端口托管）
```

> `src/components/ui/` 为 shadcn/ui 脚手架生成的通用组件，请按 `components.json` 用
> `npx shadcn@latest add <component>` 重新生成所需组件（accordion、alert-dialog、avatar、badge、button、calendar、checkbox、dialog、input、label、select、sonner、table、tabs、textarea、tooltip 等）。

## 运行

```bash
npm install
npm run build          # 构建前端到 dist/
node server/index.cjs  # 启动：托管 dist + API，默认 http://localhost:7100
```

开发模式：`npm run dev`（Vite 热更新，/api 代理到 7100）+ `node server/index.cjs`（API）。

数据文件为 `server/data.json`，首次启动自动创建（结构见 `server/data.example.json`）；删除后重启即恢复默认。
局域网内手机/平板访问：启动日志会打印本机局域网地址。

## 隐私说明

本仓库不含任何真实个人数据。`server/data.json`、课表 Excel、备份目录均已通过 `.gitignore` 排除，
请勿将真实数据文件提交到公开仓库。

## License

MIT
