import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { AssetModelPort } from '../../../../core/api/v1/model/assetModelPort';
import { RoleService } from '../../../../core/services/role.service';
import { ImageEditorComponent } from './image-editor/image-editor.component';
import { ModelFormDrawerService } from './model-form-drawer.service';
import { ModelPortsService, type PortForm } from './model-ports.service';

@Component({
  selector: 'app-model-form-drawer',
  standalone: true,
  imports: [TranslatePipe, ImageEditorComponent],
  templateUrl: './model-form-drawer.component.html',
  styleUrl: './model-form-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelFormDrawerComponent {
  protected readonly drawerSvc = inject(ModelFormDrawerService);
  protected readonly portsSvc = inject(ModelPortsService);
  protected readonly role = inject(RoleService);

  protected submitPortForm(): void {
    this.portsSvc.submitPortForm(this.drawerSvc.drawerEditId());
  }

  protected setPortField<K extends keyof PortForm>(
    key: K,
    value: PortForm[K],
  ): void {
    this.portsSvc.setPortField(key, value);
  }

  protected openPortsMapForSide(side: 'front' | 'rear'): void {
    const f = this.drawerSvc.form();
    const url =
      side === 'front' ? f.front_image_url || '' : f.rear_image_url || '';
    this.portsSvc.openPortsMap(side, url, false);
  }

  protected openPortsMapForPort(p: AssetModelPort): void {
    const f = this.drawerSvc.form();
    const url =
      p.side === 'front' ? f.front_image_url || '' : f.rear_image_url || '';
    this.portsSvc.openPortsMap(p.side, url, false);
    this.portsSvc.startPlacingPort(p.id);
  }
}
