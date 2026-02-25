import { Component, EventEmitter, Output, Input } from '@angular/core';

@Component({
  selector: 'app-map-sidebar',
  templateUrl: './map-sidebar.component.html',
  styleUrls: ['./map-sidebar.component.scss'],
  standalone: true,
  imports: [],
})
export class MapSidebarComponent {
  @Input() activeTool: string = 'select';
  @Output() toolChange = new EventEmitter<string>();

  tools = [
    { id: 'select', label: 'Sposta', icon: '✥' },
    { id: 'move', label: 'Modifica', icon: '✏️' },
    { id: 'rack', label: 'Aggiungi Rack', icon: '🖥️' },
    { id: 'wall', label: 'Aggiungi Muro', icon: '🧱' },
    { id: 'door', label: 'Aggiungi Porta', icon: '🚪' },
    { id: 'text', label: 'Aggiungi Testo', icon: '📝' },
  ];

  selectTool(toolId: string) {
    this.activeTool = toolId;
    this.toolChange.emit(toolId);
  }
}
