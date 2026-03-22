import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { BASE_PATH } from '../api/v1';
import { MediaUrlService } from './media-url.service';

describe('MediaUrlService', () => {
  let service: MediaUrlService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BASE_PATH, useValue: 'http://localhost:8000' },
      ],
    });

    service = TestBed.inject(MediaUrlService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should resolve public image path without signed URL call', (done) => {
    service
      .resolveImageUrl('public/components/sw.jpg', 320)
      .subscribe((url) => {
        expect(url).toBe(
          'http://localhost:8000/files/public/components/sw.jpg?w=320',
        );
        done();
      });

    httpMock.expectNone('http://localhost:8000/asset/private-media-url');
  });

  it('should resolve private image path via signed URL endpoint', (done) => {
    service.resolveImageUrl('private/training/sw.jpg', 320).subscribe((url) => {
      expect(url).toBe(
        'http://localhost:8000/files/private/training/sw.jpg?sign=abc&expire=123&w=320',
      );
      done();
    });

    const req = httpMock.expectOne(
      'http://localhost:8000/asset/private-media-url',
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ filename: 'private/training/sw.jpg' });
    req.flush({
      url: '/files/private/training/sw.jpg?sign=abc&expire=123',
      expiry_seconds: 120,
    });
  });

  it('should fallback to direct files URL when signed URL endpoint fails', (done) => {
    service.resolveImageUrl('private/training/sw.jpg', 320).subscribe((url) => {
      expect(url).toBe(
        'http://localhost:8000/files/private/training/sw.jpg?w=320',
      );
      done();
    });

    const req = httpMock.expectOne(
      'http://localhost:8000/asset/private-media-url',
    );
    req.flush(
      { detail: 'forbidden' },
      { status: 403, statusText: 'Forbidden' },
    );
  });
});
