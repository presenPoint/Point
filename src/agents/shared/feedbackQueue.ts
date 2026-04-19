import type { FeedbackItem, FeedbackLevel } from '../../types/session';

const LEVEL_COOLDOWN: Record<FeedbackLevel, number> = {
  CRITICAL: 60_000,
  WARN: 15_000,
  INFO: 30_000,
};

const priority: Record<FeedbackLevel, number> = {
  CRITICAL: 3,
  WARN: 2,
  INFO: 1,
};

export class FeedbackQueue {
  private queue: FeedbackItem[] = [];
  private cooldownMap = new Map<string, number>();
  private MAX_DISPLAY = 2;
  private MAX_HISTORY = 80;
  private displayItems: FeedbackItem[] = [];
  private feedHistory: FeedbackItem[] = [];
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  getDisplayItems(): FeedbackItem[] {
    return this.displayItems;
  }

  getFeedHistory(): FeedbackItem[] {
    return [...this.feedHistory];
  }

  push(item: Omit<FeedbackItem, 'id' | 'createdAt'>): void {
    const cooldown = item.cooldown ?? LEVEL_COOLDOWN[item.level];
    const key = `${item.source}:${item.level}`;
    const lastTime = this.cooldownMap.get(key) ?? 0;
    if (Date.now() - lastTime < cooldown) return;

    this.cooldownMap.set(key, Date.now());
    const full: FeedbackItem = {
      ...item,
      cooldown,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    this.queue.push(full);
    if (!full.silent) {
      this.feedHistory.push(full);
      if (this.feedHistory.length > this.MAX_HISTORY) {
        this.feedHistory.splice(0, this.feedHistory.length - this.MAX_HISTORY);
      }
    }
    this.flush();
    this.notify();
  }

  private flush(): void {
    const sorted = this.queue
      .filter((i) => !i.silent)
      .sort((a, b) => priority[b.level] - priority[a.level]);
    this.displayItems = sorted.slice(0, this.MAX_DISPLAY);
  }

  clearQueue(): void {
    this.queue = [];
    this.displayItems = [];
    this.feedHistory = [];
    this.notify();
  }
}

export const feedbackQueue = new FeedbackQueue();
