import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AssetRequestService } from '../../../../core/services/asset-request.service';
import { RoleService } from '../../../../core/services/role.service';
import { ToastService } from '../../../../core/services/toast.service';
import { BackendErrorService } from '../../../../core/services/backend-error.service';
import { ConfirmDialogService } from '../../../../core/services/confirm-dialog.service';
import {
  AssetRequest,
  AssetRequestStatus,
  isRequestTerminal,
  requestStatusColor,
} from '../../../../core/models/asset-request.model';
import { formatDate } from '../../../components/assets/assets-list/assets-list-utils';

type PageState = 'loading' | 'loaded' | 'error';
type ActionSaving = 'plan' | 'execute' | 'reject' | 'clarify' | 'resubmit' | null;

@Component({
  selector: 'app-requests-list',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './requests-list.component.html',
  styleUrl: './requests-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestsListComponent {
  private readonly svc = inject(AssetRequestService);
  private readonly toast = inject(ToastService);
  private readonly backendErr = inject(BackendErrorService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly role = inject(RoleService);

  protected readonly requestStatusColor = requestStatusColor;
  protected readonly isRequestTerminal = isRequestTerminal;
  protected readonly formatDate = formatDate;

  // ── List state ────────────────────────────────────────────────────────────
  protected readonly pageState = signal<PageState>('loading');
  protected readonly requests = signal<AssetRequest[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly currentPage = signal(1);
  protected readonly pageSize = 25;

  // ── Filters ───────────────────────────────────────────────────────────────
  protected readonly filterStatus = signal<AssetRequestStatus | ''>('');
  protected readonly filterType = signal('');

  // ── Selected request (detail) ─────────────────────────────────────────────
  protected readonly selectedRequest = signal<AssetRequest | null>(null);

  // ── Action forms ──────────────────────────────────────────────────────────
  protected readonly actionSaving = signal<ActionSaving>(null);
  protected readonly actionError = signal('');

  // Form fields
  protected readonly planDate = signal('');
  protected readonly rejectNotes = signal('');
  protected readonly clarifyNotes = signal('');
  protected readonly resubmitNotes = signal('');

  // ── Active form panel ─────────────────────────────────────────────────────
  protected readonly activeForm = signal<'plan' | 'reject' | 'clarify' | 'resubmit' | null>(null);

  // ── Pagination ────────────────────────────────────────────────────────────
  protected readonly totalPages = computed(() =>
    Math.ceil(this.totalCount() / this.pageSize),
  );

  constructor() {
    this.loadRequests();
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  protected loadRequests(): void {
    this.pageState.set('loading');
    this.svc
      .list({
        status: this.filterStatus() || undefined,
        request_type: this.filterType() || undefined,
        page: this.currentPage(),
        pageSize: this.pageSize,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.requests.set(res.results);
          this.totalCount.set(res.count);
          this.pageState.set('loaded');
        },
        error: () => this.pageState.set('error'),
      });
  }

  protected applyFilters(): void {
    this.currentPage.set(1);
    this.loadRequests();
  }

  protected setPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadRequests();
  }

  // ── Detail panel ──────────────────────────────────────────────────────────

  protected selectRequest(req: AssetRequest): void {
    this.selectedRequest.set(req);
    this.activeForm.set(null);
    this.actionError.set('');
    this.planDate.set('');
    this.rejectNotes.set('');
    this.clarifyNotes.set('');
    this.resubmitNotes.set('');
  }

  protected closeDetail(): void {
    this.selectedRequest.set(null);
    this.activeForm.set(null);
  }

  protected openForm(form: 'plan' | 'reject' | 'clarify' | 'resubmit'): void {
    this.activeForm.set(form);
    this.actionError.set('');
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  protected submitPlan(): void {
    const req = this.selectedRequest();
    if (!req) return;
    this.actionSaving.set('plan');
    this.actionError.set('');
    this.svc
      .plan(req.id, { planned_date: this.planDate() || null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this._replaceInList(updated);
          this.selectedRequest.set(updated);
          this.activeForm.set(null);
          this.actionSaving.set(null);
          this.toast.success(this.translate.instant('requests.planned_ok'));
        },
        error: (err) => {
          this.actionError.set(this.backendErr.parse(err));
          this.actionSaving.set(null);
        },
      });
  }

  protected async submitExecute(): Promise<void> {
    const req = this.selectedRequest();
    if (!req) return;
    const ok = await this.confirm.confirm(
      this.translate.instant('requests.execute_confirm'),
    );
    if (!ok) return;
    this.actionSaving.set('execute');
    this.actionError.set('');
    this.svc
      .execute(req.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this._replaceInList(updated);
          this.selectedRequest.set(updated);
          this.actionSaving.set(null);
          this.toast.success(this.translate.instant('requests.executed_ok'));
        },
        error: (err) => {
          this.actionError.set(this.backendErr.parse(err));
          this.actionSaving.set(null);
        },
      });
  }

  protected submitReject(): void {
    const req = this.selectedRequest();
    if (!req || !this.rejectNotes().trim()) return;
    this.actionSaving.set('reject');
    this.actionError.set('');
    this.svc
      .reject(req.id, { rejection_notes: this.rejectNotes() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this._replaceInList(updated);
          this.selectedRequest.set(updated);
          this.activeForm.set(null);
          this.actionSaving.set(null);
          this.toast.success(this.translate.instant('requests.rejected_ok'));
        },
        error: (err) => {
          this.actionError.set(this.backendErr.parse(err));
          this.actionSaving.set(null);
        },
      });
  }

  protected submitClarify(): void {
    const req = this.selectedRequest();
    if (!req || !this.clarifyNotes().trim()) return;
    this.actionSaving.set('clarify');
    this.actionError.set('');
    this.svc
      .clarify(req.id, { clarification_notes: this.clarifyNotes() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this._replaceInList(updated);
          this.selectedRequest.set(updated);
          this.activeForm.set(null);
          this.actionSaving.set(null);
          this.toast.success(this.translate.instant('requests.clarified_ok'));
        },
        error: (err) => {
          this.actionError.set(this.backendErr.parse(err));
          this.actionSaving.set(null);
        },
      });
  }

  protected submitResubmit(): void {
    const req = this.selectedRequest();
    if (!req) return;
    this.actionSaving.set('resubmit');
    this.actionError.set('');
    this.svc
      .resubmit(req.id, { notes: this.resubmitNotes() || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this._replaceInList(updated);
          this.selectedRequest.set(updated);
          this.activeForm.set(null);
          this.actionSaving.set(null);
          this.toast.success(this.translate.instant('requests.resubmitted_ok'));
        },
        error: (err) => {
          this.actionError.set(this.backendErr.parse(err));
          this.actionSaving.set(null);
        },
      });
  }

  private _replaceInList(updated: AssetRequest): void {
    this.requests.update((list) =>
      list.map((r) => (r.id === updated.id ? updated : r)),
    );
  }
}
