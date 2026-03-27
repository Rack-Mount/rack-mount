import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  readonly title = input('Conferma');
  readonly message = input('');
  readonly confirmLabel = input('Conferma');
  readonly confirmDanger = input(false);
  readonly cancelLabel = input('Annulla');

  readonly confirm = output<boolean>();
  readonly cancel = output<boolean>();

  private readonly confirmBtnRef =
    viewChild<ElementRef<HTMLButtonElement>>('confirmBtn');

  constructor() {
    afterNextRender(() => this.confirmBtnRef()?.nativeElement.focus());
  }

  onConfirm(): void {
    this.confirm.emit(true);
  }

  onCancel(): void {
    this.cancel.emit(false);
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('cd-overlay')) {
      this.cancel.emit(false);
    }
  }
}
