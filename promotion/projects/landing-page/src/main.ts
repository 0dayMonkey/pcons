import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import localeEn from '@angular/common/locales/en';
import localeBg from '@angular/common/locales/bg';
import localeDe from '@angular/common/locales/de';
import localeEs from '@angular/common/locales/es';
import localeIt from '@angular/common/locales/it';
import localeJa from '@angular/common/locales/ja';
import localeKo from '@angular/common/locales/ko';
import localeRu from '@angular/common/locales/ru';
import localeZh from '@angular/common/locales/zh';

registerLocaleData(localeFr);
registerLocaleData(localeEn);
registerLocaleData(localeBg);
registerLocaleData(localeDe);
registerLocaleData(localeEs);
registerLocaleData(localeIt);
registerLocaleData(localeJa);
registerLocaleData(localeKo);
registerLocaleData(localeRu);
registerLocaleData(localeZh);

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => console.error(err));
