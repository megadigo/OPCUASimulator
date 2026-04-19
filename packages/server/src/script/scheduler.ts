/**
 * Scheduler utility — thin wrapper used by the executor for interval management.
 * Exposed here as a separate module for potential future use (e.g., cron-style scheduling).
 */

export interface ScheduledTask {
  id: string;
  timer: NodeJS.Timeout;
  label: string;
  intervalMs: number;
}

const tasks = new Map<string, ScheduledTask>();

export function schedule(
  id: string,
  label: string,
  intervalMs: number,
  fn: () => void | Promise<void>
): ScheduledTask {
  const timer = setInterval(async () => {
    try { await fn(); } catch (err: any) {
      console.error(`[Scheduler] Task "${label}" error:`, err.message);
    }
  }, intervalMs);

  const task: ScheduledTask = { id, timer, label, intervalMs };
  tasks.set(id, task);
  return task;
}

export function cancel(id: string): boolean {
  const task = tasks.get(id);
  if (!task) return false;
  clearInterval(task.timer);
  tasks.delete(id);
  return true;
}

export function cancelAll(): void {
  for (const task of tasks.values()) clearInterval(task.timer);
  tasks.clear();
}

export function listTasks(): ScheduledTask[] {
  return Array.from(tasks.values());
}
