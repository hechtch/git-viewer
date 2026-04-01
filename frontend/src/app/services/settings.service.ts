import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type DateFormatStyle = 'short' | 'medium' | 'long';

export interface AppSettings {
  watermark: {
    enabled: boolean;
    minCommits: number;
    textOpacity: number;      // 0.01 – 0.20
    ruleOpacity: number;      // 0.01 – 0.30
    fontScale: number;        // 0.5 – 2.0
    dateFormat: DateFormatStyle;
  };
}

const STORAGE_KEY = 'git-viewer-settings';

const DEFAULTS: AppSettings = {
  watermark: {
    enabled: true,
    minCommits: 3,
    textOpacity: 0.07,
    ruleOpacity: 0.12,
    fontScale: 0.7,
    dateFormat: 'medium',
  },
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly change$ = new Subject<void>();
  private _s: AppSettings;

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._s = {
          ...DEFAULTS,
          ...parsed,
          watermark: { ...DEFAULTS.watermark, ...(parsed.watermark ?? {}) },
        };
      } else {
        this._s = structuredClone(DEFAULTS);
      }
    } catch {
      this._s = structuredClone(DEFAULTS);
    }
  }

  get watermark(): AppSettings['watermark'] { return this._s.watermark; }

  updateWatermark(patch: Partial<AppSettings['watermark']>): void {
    this._s.watermark = { ...this._s.watermark, ...patch };
    this.persist();
    this.change$.next();
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._s));
  }
}
