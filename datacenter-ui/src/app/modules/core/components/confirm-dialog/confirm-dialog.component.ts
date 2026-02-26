import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnInit,
  ViewChild,
} from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent implements OnInit {
  @Input() title = 'Conferma';
  @Input() message = '';
  @Input() confirmLabel = 'Conferma';
  @Input() confirmDanger = false;
  @Input() cancelLabel = 'Annulla';

  @ViewChild('confirmBtn') confirmBtnRef!: ElementRef<HTMLButtonElement>;

  /** Resolved by the service when the user makes a choice */
  resolve!: (value: boolean) => void;

  ngOnInit(): void {
    // Autofocus the confirm button after render
    setTimeout(() => this.confirmBtnRef?.nativeElement?.focus());
  }

  onConfirm(): void {
    this.resolve(true);
  }

  onCancel(): void {
    this.resolve(false);
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('cd-overlay')) {
      this.resolve(false);
    }
  }
}
