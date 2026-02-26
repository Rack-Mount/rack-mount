import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

@Component({
  selector: 'app-map-sidebar',
  templateUrl: './map-sidebar.component.html',
  styleUrls: ['./map-sidebar.component.scss'],
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapSidebarComponent {
  @Input() activeTool: string = 'select';
  @Input() disabled: boolean = false;
  @Output() toolChange = new EventEmitter<string>();

  tools = [
    { id: 'select', label: 'Sposta', icon: '✥' },
    { id: 'move', label: 'Modifica', icon: '📝' },
    { id: 'wall', label: 'Aggiungi Muro', icon: '🧱' },
    { id: 'door', label: 'Aggiungi Varco', icon: '🚪' },
    { id: 'text', label: 'Aggiungi Testo', icon: '🔤' },
    { id: 'rack', label: 'Aggiungi Rack', icon: '🖥️' },
  ];

  selectTool(toolId: string): void {
    if (this.disabled) return;
    this.toolChange.emit(toolId);
  }
}
