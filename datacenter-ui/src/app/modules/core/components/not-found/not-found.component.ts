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
      <a routerLink="/" class="back-link">← Torna alla home</a>
    </div>
  `,
  styles: [
    `
      .not-found {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: #f8f9fa;
        font-family: sans-serif;
        gap: 12px;
      }

      .code {
        font-size: 96px;
        font-weight: 700;
        color: #dee2e6;
        line-height: 1;
        letter-spacing: -4px;
      }

      .message {
        font-size: 20px;
        color: #6c757d;
        font-weight: 400;
      }

      .back-link {
        margin-top: 8px;
        font-size: 14px;
        color: #007bff;
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }
    `,
  ],
})
export class NotFoundComponent {}
