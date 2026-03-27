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

  function expectNoXsrfAugmentation(url: string): void {
    const req = httpMock.expectOne(url);
    expect(req.request.withCredentials).toBeFalse();
    expect(req.request.headers.has('X-CSRFToken')).toBeFalse();
    req.flush({});
  }

  beforeEach(() => {
    const authMock = {
      accessToken: jasmine.createSpy('accessToken').and.returnValue(''),
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

  it('should not force credentials or X-CSRF header on API auth request', () => {
    http
      .post('http://localhost:8000/auth/token/', {
        username: 'u',
        password: 'p',
      })
      .subscribe();

    expectNoXsrfAugmentation('http://localhost:8000/auth/token/');
  });

  it('should not force credentials or X-CSRF header on external request', () => {
    http.post('https://example.com/api', {}).subscribe();

    expectNoXsrfAugmentation('https://example.com/api');
  });
});
