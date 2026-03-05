import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../../../../environments/environment';
import {
  ComponentTypeEnum,
  GenericComponent,
} from '../../../../../core/api/v1';
import { BackendErrorService } from '../../../../../core/services/backend-error.service';
import {
  ImageEditorComponent,
  ImageEditParams,
} from '../../models-list/image-editor/image-editor.component';

const COMPONENT_TYPE_LABELS: Record<ComponentTypeEnum, string> = {
  cable_manager: 'Passacavi / Cable Manager',
  blanking_panel: 'Pannello cieco / Blanking Panel',
  patch_panel: 'Patch Panel',
  pdu: 'PDU / Power Strip',
  shelf: 'Ripiano / Shelf',
  other: 'Altro / Other',
};

interface ComponentForm {
  name: string;
  component_type: ComponentTypeEnum;
  rack_units: number | null;
  note: string;
  front_image_file: File | null;
  rear_image_file: File | null;
  front_image_url: string | null;
  rear_image_url: string | null;
  front_transform: ImageEditParams | null;
  rear_transform: ImageEditParams | null;
  front_preview_url: string | null;
  rear_preview_url: string | null;
}

function emptyForm(): ComponentForm {
  return {
    name: '',
    component_type: 'cable_manager',
    rack_units: 1,
    note: '',
    front_image_file: null,
    rear_image_file: null,
    front_image_url: null,
    rear_image_url: null,
    front_transform: null,
    rear_transform: null,
    front_preview_url: null,
    rear_preview_url: null,
  };
}

@Component({
  selector: 'app-component-create-drawer',
  standalone: true,
  imports: [TranslatePipe, ImageEditorComponent],
  templateUrl: './component-create-drawer.component.html',
  styleUrl: './component-create-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComponentCreateDrawerComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly backendErr = inject(BackendErrorService);

  readonly mode = input<'create' | 'edit'>('create');
  readonly editComponent = input<GenericComponent | null>(null);

  /** Emitted with the saved/updated component after a successful save */
  readonly saved = output<GenericComponent>();
  /** Emitted when the user cancels or closes */
  readonly cancelled = output<void>();

  protected readonly componentTypes = Object.entries(COMPONENT_TYPE_LABELS) as [
    ComponentTypeEnum,
    string,
  ][];

  protected readonly form = signal<ComponentForm>(emptyForm());
  protected readonly saveState = signal<'idle' | 'saving' | 'error'>('idle');
  protected readonly saveMsg = signal('');
  protected readonly editingImage = signal<'front' | 'rear' | null>(null);

  protected readonly canSave = computed(
    () => !!this.form().name.trim() && !!this.form().component_type,
  );

  ngOnInit(): void {
    const c = this.editComponent();
    if (!c || this.mode() !== 'edit') return;
    this.form.set({
      name: c.name ?? '',
      component_type:
        (c.component_type as ComponentTypeEnum) ?? 'cable_manager',
      rack_units: c.rack_units ?? null,
      note: c.note ?? '',
      front_image_file: null,
      rear_image_file: null,
      front_image_url: c.front_image ?? null,
      rear_image_url: c.rear_image ?? null,
      front_transform: null,
      rear_transform: null,
      front_preview_url: null,
      rear_preview_url: null,
    });
  }

  protected setField<K extends keyof ComponentForm>(
    key: K,
    value: ComponentForm[K],
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected objectUrl(file: File): string {
    return URL.createObjectURL(file);
  }

  protected onFileChange(
    field: 'front_image_file' | 'rear_image_file',
    event: Event,
  ): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.form.update((f) => ({ ...f, [field]: file }));
  }

  protected clearImage(field: 'front_image_url' | 'rear_image_url'): void {
    this.form.update((f) => ({ ...f, [field]: null }));
  }

  protected openImageEditor(side: 'front' | 'rear'): void {
    this.editingImage.set(side);
  }

  protected onEditorConfirmed(
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

  protected onEditorCancelled(): void {
    this.editingImage.set(null);
  }

  protected hasTransform(side: 'front' | 'rear'): boolean {
    const t =
      side === 'front'
        ? this.form().front_transform
        : this.form().rear_transform;
    if (!t) return false;
    return (
      !!t.perspective || !!t.crop || t.rotation !== 0 || t.flipH || t.flipV
    );
  }

  protected submit(): void {
    if (!this.canSave()) return;
    const f = this.form();
    const fd = new FormData();
    fd.append('name', f.name.trim());
    fd.append('component_type', f.component_type);
    if (f.rack_units != null) fd.append('rack_units', String(f.rack_units));
    fd.append('note', f.note ?? '');

    if (f.front_image_file) {
      fd.append('front_image', f.front_image_file);
      if (f.front_transform)
        fd.append('front_image_transform', JSON.stringify(f.front_transform));
    } else if (f.front_image_url === null && this.mode() === 'edit') {
      fd.append('front_image', '');
    } else if (f.front_image_url && f.front_transform) {
      fd.append('front_image_transform', JSON.stringify(f.front_transform));
    }

    if (f.rear_image_file) {
      fd.append('rear_image', f.rear_image_file);
      if (f.rear_transform)
        fd.append('rear_image_transform', JSON.stringify(f.rear_transform));
    } else if (f.rear_image_url === null && this.mode() === 'edit') {
      fd.append('rear_image', '');
    } else if (f.rear_image_url && f.rear_transform) {
      fd.append('rear_image_transform', JSON.stringify(f.rear_transform));
    }

    this.saveState.set('saving');
    const base = `${environment.service_url}/asset/generic_component`;
    const editComp = this.editComponent();

    const req$ =
      this.mode() === 'create'
        ? this.http.post<GenericComponent>(base, fd)
        : this.http.patch<GenericComponent>(`${base}/${editComp!.id}`, fd);

    req$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.saveState.set('idle');
        this.saved.emit(saved);
      },
      error: (err: HttpErrorResponse) => {
        this.saveState.set('error');
        this.saveMsg.set(this.backendErr.parse(err));
      },
    });
  }
}
