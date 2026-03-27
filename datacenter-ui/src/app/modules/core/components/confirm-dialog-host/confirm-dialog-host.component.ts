import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-confirm-dialog-host',
  standalone: true,
  imports: [ConfirmDialogComponent],
  templateUrl: './confirm-dialog-host.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogHostComponent {
  protected readonly confirmDialog = inject(ConfirmDialogService);
}
