import { ANIMATION_TOTAL_MS } from './types.js';
import type { TimelinePoint } from './types.js';

export type PlaybackListener = (index: number, playing: boolean) => void;

export class PlaybackController {
  private _points: TimelinePoint[] = [];
  private _index = 0;
  private _playing = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _listeners = new Set<PlaybackListener>();

  setPoints(points: TimelinePoint[]): void {
    this.pause();
    this._points = points;
    this._index = 0;
    this._emit();
  }

  get index(): number {
    return this._index;
  }

  get playing(): boolean {
    return this._playing;
  }

  get length(): number {
    return this._points.length;
  }

  get isAtEnd(): boolean {
    return (
      this._points.length === 0 || this._index >= this._points.length - 1
    );
  }

  subscribe(listener: PlaybackListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  scrub(index: number): void {
    if (this._points.length === 0) return;
    this.pause();
    this._index = Math.min(
      Math.max(0, Math.round(index)),
      this._points.length - 1
    );
    this._emit();
  }

  toggle(): void {
    if (this._playing) this.pause();
    else this.play();
  }

  play(): void {
    if (this._points.length === 0) return;
    if (this.isAtEnd) {
      this._index = 0;
      this._emit();
    }
    this._playing = true;
    this._emit();
    this._scheduleNext();
  }

  pause(): void {
    this._playing = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._emit();
  }

  /** Pause and drop listeners (hard teardown). Prefer pause + unsubscribe for reconnect. */
  destroy(): void {
    this.pause();
    this._listeners.clear();
  }

  /** Soft stop for card disconnect — keeps controller reusable after resubscribe. */
  detach(): void {
    this.pause();
  }

  private _scheduleNext(): void {
    if (!this._playing) return;
    if (this._index >= this._points.length - 1) {
      this.pause();
      return;
    }

    const current = this._points[this._index];
    const next = this._points[this._index + 1];
    const totalTime =
      this._points[this._points.length - 1].timestamp - this._points[0].timestamp;
    const interval =
      totalTime > 0
        ? ((next.timestamp - current.timestamp) / totalTime) * ANIMATION_TOTAL_MS
        : 200;
    const delay = Math.min(1000, Math.max(50, interval));

    this._timer = setTimeout(() => {
      this._index++;
      this._emit();
      this._scheduleNext();
    }, delay);
  }

  private _emit(): void {
    for (const listener of this._listeners) {
      listener(this._index, this._playing);
    }
  }
}
