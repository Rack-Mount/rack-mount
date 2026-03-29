import { Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  /** When true the confirm button uses a red/danger style */
  danger?: boolean;
  cancelLabel?: string;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  confirmDanger: boolean;
  cancelLabel: string;
  resolve: (value: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly queue: ConfirmDialogState[] = [];
  private readonly _activeDialog = signal<ConfirmDialogState | null>(null);

  constructor(private readonly translate: TranslateService) {}

  readonly activeDialog = this._activeDialog.asReadonly();

  /**
   * Opens a confirmation dialog and resolves to `true` when the user
   * confirms, or `false` when they cancel / close the overlay.
   */
  confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.queue.push({
        message,
        title: options.title ?? this.t('common.confirm', 'Confirm'),
        confirmLabel: options.confirmLabel ?? this.t('common.confirm', 'Confirm'),
        confirmDanger: options.danger ?? false,
        cancelLabel: options.cancelLabel ?? this.t('common.cancel', 'Cancel'),
        resolve,
      });

      this.flushQueue();
    });
  }

  resolveCurrent(value: boolean): void {
    const active = this._activeDialog();
    if (!active) return;

    this._activeDialog.set(null);
    active.resolve(value);
    this.flushQueue();
  }

  private flushQueue(): void {
    if (this._activeDialog() || this.queue.length === 0) return;
    this._activeDialog.set(this.queue.shift() ?? null);
  }

  /**
   * Opens an informational dialog with a single "OK" button.
   * Resolves when the user dismisses it.
   */
  alert(message: string, title = this.t('common.notice', 'Notice')): Promise<void> {
    return this.confirm(message, {
      title,
      confirmLabel: 'OK',
      cancelLabel: '',
    }).then(() => void 0);
  }

  private t(key: string, fallback: string): string {
    const translated = this.translate.instant(key);
    return translated === key ? fallback : translated;
  }
}
