import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    const authMock = {
      refresh: jasmine.createSpy('refresh').and.returnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authMock },
        {
          provide: ToastService,
          useValue: { error: jasmine.createSpy('error') },
        },
        {
          provide: TranslateService,
          useValue: { instant: (k: string) => k },
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);

    document.cookie = 'csrftoken=test-csrf-token; path=/';
  });

  afterEach(() => {
    httpMock.verify();
    document.cookie =
      'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('should attach X-CSRFToken for unsafe API requests', () => {
    http
      .post('http://localhost:8000/auth/token/', {
        username: 'u',
        password: 'p',
      })
      .subscribe();

    const req = httpMock.expectOne('http://localhost:8000/auth/token/');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.headers.get('X-CSRFToken')).toBe('test-csrf-token');
    req.flush({});
  });

  it('should not attach X-CSRFToken for unsafe external requests', () => {
    http.post('https://example.com/api', {}).subscribe();

    const req = httpMock.expectOne('https://example.com/api');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.headers.has('X-CSRFToken')).toBeFalse();
    req.flush({});
  });
});
