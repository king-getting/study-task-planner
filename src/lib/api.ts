// 前端 API 封装
import type { AppState } from './types';

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.message || '请求失败');
  return json.data as T;
}

export const api = {
  getState: () => req<AppState>('/api/state'),
  addTask: (task: Partial<import('./types').Task>) =>
    req<import('./types').Task>('/api/tasks', { method: 'POST', body: JSON.stringify(task) }),
  updateTask: (id: string, patch: Partial<import('./types').Task>) =>
    req<import('./types').Task>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteTask: (id: string) => req(`/api/tasks/${id}`, { method: 'DELETE' }),
  addCourses: (courses: Partial<import('./types').Course>[]) =>
    req<import('./types').Course[]>('/api/courses', { method: 'POST', body: JSON.stringify(courses) }),
  deleteCourse: (id: string) => req(`/api/courses/${id}`, { method: 'DELETE' }),
  clearCourses: () => req('/api/courses', { method: 'DELETE' }),
  runSchedule: () => req<{ warnings: string[]; plannedBlocks: number }>('/api/schedule/run', { method: 'POST' }),
  patchBlock: (id: string, patch: Record<string, unknown>) =>
    req<import('./types').Block>(`/api/blocks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  addEvent: (evt: Partial<import('./types').CalEvent>) =>
    req<import('./types').CalEvent>('/api/events', { method: 'POST', body: JSON.stringify(evt) }),
  deleteEvent: (id: string) => req(`/api/events/${id}`, { method: 'DELETE' }),
  addExam: (exam: Partial<import('./types').Exam>) =>
    req<import('./types').Exam>('/api/exams', { method: 'POST', body: JSON.stringify(exam) }),
  updateExam: (id: string, patch: Partial<import('./types').Exam>) =>
    req<import('./types').Exam>(`/api/exams/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteExam: (id: string) => req(`/api/exams/${id}`, { method: 'DELETE' }),
  updateHolidays: (holidays: import('./types').Holiday[]) =>
    req('/api/holidays', { method: 'PUT', body: JSON.stringify(holidays) }),
  updateSettings: (patch: Partial<import('./types').Settings>) =>
    req<import('./types').Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  addFocus: (payload: { blockId?: string; minutes: number; status: 'completed' | 'abandoned'; title?: string; runId?: string }) =>
    req<import('./types').FocusSession>('/api/focus', { method: 'POST', body: JSON.stringify(payload) }),
};
