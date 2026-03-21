import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/** Maps Angular locale codes to Django locale codes where they differ. */
const LANG_MAP: Record<string, string> = {
  zh: 'zh-hans',
};

export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  const translate = inject(TranslateService);
  const lang =
    translate.getCurrentLang() ?? translate.getFallbackLang() ?? 'en';
  const djangoLang = LANG_MAP[lang] ?? lang;

  return next(req.clone({ setHeaders: { 'Accept-Language': djangoLang } }));
};
