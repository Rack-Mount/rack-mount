import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="not-found">
      <div class="code">404</div>
      <div class="message">Pagina non trovata</div>
      <p class="hint">L'URL richiesto non esiste.</p>
      <a routerLink="/" class="back-link">← Torna alla home</a>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        height: 100%;
      }

      .not-found {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        background: #0b1120;
        font-family: 'Inter', 'Segoe UI', sans-serif;
        gap: 10px;
      }

      .code {
        font-size: 96px;
        font-weight: 800;
        color: rgba(226, 232, 240, 0.08);
        line-height: 1;
        letter-spacing: -6px;
      }

      .message {
        font-size: 1.1rem;
        font-weight: 600;
        color: #e2e8f0;
      }

      .hint {
        font-size: 0.85rem;
        color: rgba(226, 232, 240, 0.35);
        margin: 0;
      }

      .back-link {
        margin-top: 16px;
        font-size: 0.85rem;
        font-weight: 500;
        color: #00d4ff;
        text-decoration: none;
        padding: 8px 18px;
        border: 1px solid rgba(0, 212, 255, 0.3);
        border-radius: 8px;
        transition:
          background 0.15s,
          box-shadow 0.15s;

        &:hover {
          background: rgba(0, 212, 255, 0.08);
          box-shadow: 0 0 16px rgba(0, 212, 255, 0.2);
        }
      }
    `,
  ],
})
export class NotFoundComponent {}
