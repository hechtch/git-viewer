import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, DateFormatStyle } from '../../services/settings.service';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.css'],
})
export class SettingsPanelComponent {
  @Output() close = new EventEmitter<void>();

  protected settings = inject(SettingsService);

  get wmEnabled(): boolean { return this.settings.watermark.enabled; }
  set wmEnabled(v: boolean) { this.settings.updateWatermark({ enabled: v }); }

  get wmMinCommits(): number { return this.settings.watermark.minCommits; }
  set wmMinCommits(v: number) { this.settings.updateWatermark({ minCommits: +v }); }

  get wmTextOpacity(): number { return this.settings.watermark.textOpacity; }
  set wmTextOpacity(v: number) { this.settings.updateWatermark({ textOpacity: +v }); }

  get wmRuleOpacity(): number { return this.settings.watermark.ruleOpacity; }
  set wmRuleOpacity(v: number) { this.settings.updateWatermark({ ruleOpacity: +v }); }

  get wmFontScale(): number { return this.settings.watermark.fontScale; }
  set wmFontScale(v: number) { this.settings.updateWatermark({ fontScale: +v }); }

  get wmDateFormat(): DateFormatStyle { return this.settings.watermark.dateFormat; }
  setDateFormat(v: DateFormatStyle): void { this.settings.updateWatermark({ dateFormat: v }); }

  toPercent(v: number): number { return Math.round(v * 100); }
}
