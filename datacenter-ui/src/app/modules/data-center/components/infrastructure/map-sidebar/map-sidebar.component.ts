import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RoleService } from '../../../../core/services/role.service';

@Component({
  selector: 'app-map-sidebar',
  templateUrl: './map-sidebar.component.html',
  styleUrl: './map-sidebar.component.scss',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapSidebarComponent {
  protected readonly role = inject(RoleService);

  readonly activeTool = input<string>('select');
  readonly disabled = input<boolean>(false);
  readonly toolChange = output<string>();

  readonly tools = [
    {
      id: 'select',
      label: 'map_sidebar.tool_select',
      iconId: 'icon-select',
    },
    {
      id: 'edit',
      label: 'map_sidebar.tool_move',
      iconId: 'icon-move',
    },
    {
      id: 'wall',
      label: 'map_sidebar.tool_wall',
      iconId: 'icon-wall',
    },
    {
      id: 'door',
      label: 'map_sidebar.tool_door',
      iconId: 'icon-door',
    },
    {
      id: 'text',
      label: 'map_sidebar.tool_text',
      iconId: 'icon-text',
    },
    {
      id: 'rack',
      label: 'map_sidebar.tool_rack',
      iconId: 'icon-rack',
    },
  ];

  selectTool(toolId: string): void {
    if (this.disabled()) return;
    this.toolChange.emit(toolId);
  }
}
