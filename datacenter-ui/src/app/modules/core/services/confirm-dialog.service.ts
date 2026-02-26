import {
  ApplicationRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
} from '@angular/core';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  /** When true the confirm button uses a red/danger style */
  danger?: boolean;
  cancelLabel?: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  /**
   * Opens a confirmation dialog and resolves to `true` when the user
   * confirms, or `false` when they cancel / close the overlay.
   */
  confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const componentRef = createComponent(ConfirmDialogComponent, {
        environmentInjector: this.injector,
      });

      const instance = componentRef.instance;
      instance.message = message;
      instance.title = options.title ?? 'Conferma';
      instance.confirmLabel = options.confirmLabel ?? 'Conferma';
      instance.confirmDanger = options.danger ?? false;
      instance.cancelLabel = options.cancelLabel ?? 'Annulla';
      instance.resolve = (value: boolean) => {
        resolve(value);
        this.appRef.detachView(componentRef.hostView);
        componentRef.destroy();
      };

      this.appRef.attachView(componentRef.hostView);
      const domElem = (componentRef.hostView as any).rootNodes[0] as HTMLElement;
      document.body.appendChild(domElem);

      // Trigger initial change detection
      componentRef.changeDetectorRef.detectChanges();
    });
  }

  /**
   * Opens an informational dialog with a single "OK" button.
   * Resolves when the user dismisses it.
   */
  alert(message: string, title = 'Avviso'): Promise<void> {
    return this.confirm(message, {
      title,
      confirmLabel: 'OK',
      cancelLabel: '',
    }).then(() => void 0);
  }
}
