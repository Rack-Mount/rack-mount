import { HttpErrorResponse } from '@angular/common/http';
import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import {
  AssetModel,
  AssetService,
  AssetType,
  Vendor,
} from '../../../../core/api/v1';
import { BackendErrorService } from '../../../../core/services/backend-error.service';
import { LanguageService } from '../../../../core/services/language.service';
import { MultipartUploadService } from '../../../../core/services/multipart-upload.service';
import { SettingsService } from '../../../../core/services/settings.service';
import { DestroyableState } from '../../../../core/types/list-state.types';
import type { ImageEditParams } from './image-editor/image-editor.component';
import { ModelPortsService } from './model-ports.service';
import { emptyForm, ModelForm } from './models-list.types';

@Injectable()
export class ModelFormDrawerService {
  private readonly svc = inject(AssetService);
  private readonly backendErr = inject(BackendErrorService);
  private readonly uploadSvc = inject(MultipartUploadService);
  private readonly portsSvc = inject(ModelPortsService);
  private readonly settings = inject(SettingsService);
  private readonly lang = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Units ──────────────────────────────────────────────────────────────────
  readonly isImperial = computed(() => {
    const s = this.settings.measurementSystemSetting();
    if (s !== 'auto') return s === 'imperial';
    return this.lang.currentLang() === 'en';
  });

  toDimDisplay(mm: number | null): string {
    if (mm == null) return '';
    if (this.isImperial()) return (mm * 0.0393701).toFixed(3);
    return String(mm);
  }

  fromDimInput(value: string): number | null {
    if (!value) return null;
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    if (this.isImperial()) return Math.round(n / 0.0393701);
    return n;
  }

  toWeightDisplay(kg: string): string {
    if (!kg) return '';
    const n = Number(kg);
    if (isNaN(n)) return kg;
    if (this.isImperial()) return (n * 2.20462).toFixed(3);
    return kg;
  }

  fromWeightInput(value: string): string {
    if (!value) return '';
    const n = parseFloat(value);
    if (isNaN(n)) return value;
    if (this.isImperial()) return (n / 2.20462).toFixed(4);
    return value;
  }

  // ── Drawer state ──────────────────────────────────────────────────────────
  readonly drawerOpen = signal(false);
  readonly drawerMode = signal<'create' | 'edit'>('create');
  readonly drawerEditId = signal<number | null>(null);
  readonly form = signal<ModelForm>(emptyForm());
  readonly drawerSave = signal<DestroyableState>('idle');
  readonly drawerSaveMsg = signal('');

  // ── Image editor ──────────────────────────────────────────────────────────
  readonly editingImage = signal<'front' | 'rear' | null>(null);

  // ── Autocomplete ──────────────────────────────────────────────────────────
  readonly vendorSearch = signal('');
  readonly vendorDropdownOpen = signal(false);
  readonly typeSearch = signal('');
  readonly typeDropdownOpen = signal(false);
  readonly filteredVendors = signal<Vendor[]>([]);
  readonly filteredTypes = signal<AssetType[]>([]);
  private readonly _vendorAcInput = new Subject<string>();
  private readonly _typeAcInput = new Subject<string>();

  // ── Output event ──────────────────────────────────────────────────────────
  readonly modelSaved = new Subject<{
    saved: AssetModel;
    mode: 'create' | 'edit';
  }>();

  constructor() {
    // Autocomplete vendor — live DB search
    this._vendorAcInput
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) =>
          this.svc
            .assetVendorList({ search: q || undefined, pageSize: 25, ordering: 'name' })
            .pipe(
              map((r) => r.results ?? []),
              catchError(() => of([] as Vendor[])),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => this.filteredVendors.set(list));

    // Autocomplete type — live DB search
    this._typeAcInput
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) =>
          this.svc
            .assetAssetTypeList({ search: q || undefined, pageSize: 25, ordering: 'name' })
            .pipe(
              map((r) => r.results ?? []),
              catchError(() => of([] as AssetType[])),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => this.filteredTypes.set(list));
  }

  readonly canSave = computed(() => {
    const f = this.form();
    return !!f.name.trim() && f.vendor_id !== null && f.type_id !== null;
  });

  // ── Drawer open/close ─────────────────────────────────────────────────────
  openCreate(): void {
    this.form.set(emptyForm());
    this.vendorSearch.set('');
    this.typeSearch.set('');
    this.vendorDropdownOpen.set(false);
    this.typeDropdownOpen.set(false);
    this.drawerSave.set('idle');
    this.drawerSaveMsg.set('');
    this.drawerMode.set('create');
    this.drawerEditId.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(m: AssetModel): void {
    this.openDrawerFromModel(m, 'edit');
    this.portsSvc.loadPortsForModel(m.id);
  }

  cloneModel(m: AssetModel): void {
    this.openDrawerFromModel(m, 'create', `(CLONE) ${m.name ?? ''}`);
  }

  private openDrawerFromModel(
    m: AssetModel,
    mode: 'create' | 'edit',
    nameOverride?: string,
  ): void {
    this.vendorSearch.set(m.vendor?.name ?? '');
    this.typeSearch.set(m.type?.name ?? '');
    this.vendorDropdownOpen.set(false);
    this.typeDropdownOpen.set(false);
    this.form.set({
      name: nameOverride ?? m.name ?? '',
      vendor_id: m.vendor?.id ?? null,
      type_id: m.type?.id ?? null,
      rack_units: m.rack_units ?? null,
      width_mm: m.width_mm ?? null,
      height_mm: m.height_mm ?? null,
      depth_mm: m.depth_mm ?? null,
      weight_kg: m.weight_kg ?? '',
      power_consumption_watt: m.power_consumption_watt ?? null,
      note: m.note ?? '',
      front_image_file: null,
      rear_image_file: null,
      front_image_url: m.front_image ?? null,
      rear_image_url: m.rear_image ?? null,
      front_transform: null,
      rear_transform: null,
      front_preview_url: null,
      rear_preview_url: null,
    });
    this.drawerSave.set('idle');
    this.drawerSaveMsg.set('');
    this.drawerMode.set(mode);
    this.drawerEditId.set(mode === 'edit' ? m.id : null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.portsSvc.reset();
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  setField<K extends keyof ModelForm>(key: K, value: ModelForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  submitDrawer(): void {
    if (!this.canSave()) return;
    const f = this.form();

    const fd = new FormData();
    fd.append('name', f.name.trim());
    fd.append('vendor_id', String(f.vendor_id));
    fd.append('type_id', String(f.type_id));
    if (f.rack_units != null) fd.append('rack_units', String(f.rack_units));
    if (f.width_mm != null) fd.append('width_mm', String(f.width_mm));
    if (f.height_mm != null) fd.append('height_mm', String(f.height_mm));
    if (f.depth_mm != null) fd.append('depth_mm', String(f.depth_mm));
    if (f.weight_kg) fd.append('weight_kg', f.weight_kg);
    if (f.power_consumption_watt != null)
      fd.append('power_consumption_watt', String(f.power_consumption_watt));
    fd.append('note', f.note ?? '');
    if (f.front_image_file) {
      fd.append('front_image', f.front_image_file);
      if (f.front_transform)
        fd.append('front_image_transform', JSON.stringify(f.front_transform));
    } else if (f.front_image_url === null && this.drawerMode() === 'edit') {
      fd.append('front_image', '');
    } else if (f.front_image_url && f.front_transform) {
      fd.append('front_image_transform', JSON.stringify(f.front_transform));
    }
    if (f.rear_image_file) {
      fd.append('rear_image', f.rear_image_file);
      if (f.rear_transform)
        fd.append('rear_image_transform', JSON.stringify(f.rear_transform));
    } else if (f.rear_image_url === null && this.drawerMode() === 'edit') {
      fd.append('rear_image', '');
    } else if (f.rear_image_url && f.rear_transform) {
      fd.append('rear_image_transform', JSON.stringify(f.rear_transform));
    }

    this.drawerSave.set('saving');
    const mode = this.drawerMode();
    const req$ = this.uploadSvc.saveAssetModel(fd, this.drawerEditId());

    req$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.drawerSave.set('idle');
        this.drawerOpen.set(false);
        this.modelSaved.next({ saved, mode });
      },
      error: (err: HttpErrorResponse) => {
        this.drawerSave.set('error');
        this.drawerSaveMsg.set(this.backendErr.parse(err));
      },
    });
  }

  // ── Image utilities ───────────────────────────────────────────────────────
  objectUrl(file: File): string {
    return URL.createObjectURL(file);
  }

  onFileChange(
    field: 'front_image_file' | 'rear_image_file',
    event: Event,
  ): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.form.update((f) => ({ ...f, [field]: file }));
  }

  clearImage(field: 'front_image_url' | 'rear_image_url'): void {
    this.form.update((f) => ({ ...f, [field]: null }));
  }

  openImageEditor(side: 'front' | 'rear'): void {
    this.editingImage.set(side);
  }

  onEditorConfirmed(
    event: { params: ImageEditParams; previewDataUrl: string },
    side: 'front' | 'rear',
  ): void {
    if (side === 'front') {
      this.form.update((f) => ({
        ...f,
        front_transform: event.params,
        front_preview_url: event.previewDataUrl,
      }));
    } else {
      this.form.update((f) => ({
        ...f,
        rear_transform: event.params,
        rear_preview_url: event.previewDataUrl,
      }));
    }
    this.editingImage.set(null);
  }

  onEditorCancelled(): void {
    this.editingImage.set(null);
  }

  hasTransform(side: 'front' | 'rear'): boolean {
    const t =
      side === 'front'
        ? this.form().front_transform
        : this.form().rear_transform;
    if (!t) return false;
    return (
      !!t.perspective || !!t.crop || t.rotation !== 0 || t.flipH || t.flipV
    );
  }

  // ── Autocomplete handlers ─────────────────────────────────────────────────
  onVendorFocus(): void {
    this.vendorDropdownOpen.set(true);
    this._vendorAcInput.next(this.vendorSearch());
  }

  onVendorSearch(value: string): void {
    this.vendorSearch.set(value);
    this.vendorDropdownOpen.set(true);
    this._vendorAcInput.next(value);
    if (!value) this.form.update((f) => ({ ...f, vendor_id: null }));
  }

  selectVendor(v: Vendor): void {
    this.form.update((f) => ({ ...f, vendor_id: v.id }));
    this.vendorSearch.set(v.name);
    this.vendorDropdownOpen.set(false);
  }

  clearVendor(): void {
    this.form.update((f) => ({ ...f, vendor_id: null }));
    this.vendorSearch.set('');
    this.vendorDropdownOpen.set(false);
    this._vendorAcInput.next('');
  }

  onTypeFocus(): void {
    this.typeDropdownOpen.set(true);
    this._typeAcInput.next(this.typeSearch());
  }

  onTypeSearch(value: string): void {
    this.typeSearch.set(value);
    this.typeDropdownOpen.set(true);
    this._typeAcInput.next(value);
    if (!value) this.form.update((f) => ({ ...f, type_id: null }));
  }

  selectType(t: AssetType): void {
    this.form.update((f) => ({ ...f, type_id: t.id }));
    this.typeSearch.set(t.name);
    this.typeDropdownOpen.set(false);
  }

  clearType(): void {
    this.form.update((f) => ({ ...f, type_id: null }));
    this.typeSearch.set('');
    this.typeDropdownOpen.set(false);
    this._typeAcInput.next('');
  }
}
