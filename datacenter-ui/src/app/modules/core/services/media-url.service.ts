import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { BaseApiService } from './base-api.service';

interface SignedUrlResponse {
  url: string;
  expiry_seconds: number;
}

@Injectable({ providedIn: 'root' })
export class MediaUrlService extends BaseApiService {
  private readonly http = inject(HttpClient);

  resolveImageUrl(imagePath: string, width?: number): Observable<string> {
    if (!imagePath) return of('');

    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return of(this.appendWidth(imagePath, width));
    }

    if (imagePath.startsWith('private/')) {
      return this.http
        .post<SignedUrlResponse>(`${this.basePath}/asset/private-media-url`, {
          filename: imagePath,
        })
        .pipe(
          map((res) => this.appendWidth(`${this.basePath}${res.url}`, width)),
          catchError(() =>
            of(this.appendWidth(`${this.basePath}/files/${imagePath}`, width)),
          ),
        );
    }

    return of(this.appendWidth(`${this.basePath}/files/${imagePath}`, width));
  }

  private appendWidth(url: string, width?: number): string {
    if (!width) return url;
    return `${url}${url.includes('?') ? '&' : '?'}w=${width}`;
  }
}
