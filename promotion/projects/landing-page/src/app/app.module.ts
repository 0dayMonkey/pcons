import { NgModule, APP_INITIALIZER, LOCALE_ID } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';
import {
  HttpClientModule,
  HttpClient,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule, CurrencyPipe } from '@angular/common';
import {
  TranslateModule,
  TranslateLoader,
  TranslateService,
} from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { ButtonModule } from 'primeng/button';

import { AppComponent } from './app.component';
import { PromoListComponent } from './components/promo-list/promo-list.component';
import { PinCodeComponent } from './components/pin-code/pin-code.component';
import { ConfirmationComponent } from './components/confirmation/confirmation.component';
import { TestComponent } from './components/test/test.component';
import { routes } from './app.routes';

import { PromoService } from './services/promo.service';
import { FormattingService } from './services/formatting.service';
import { AnimationService } from './services/animation.service';
import { PinCodeService } from './services/pin-code.service';
import { PromoValidationService } from './services/promo-validation.service';
import { TranslationService } from './services/translation.service';
import { ErrorHandlingService } from './services/error-handler.service';
import { HttpErrorInterceptor } from './services/http-error.interceptor';
import { MatIconModule } from '@angular/material/icon';

import { ConfigService } from '../../../common/services/config.service';
import { MboxInfoService } from '../../../common/services/mbox-info.service';
import { ApiService } from '../../../common/services/api.service';

export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

export function appInitializerFactory(
  translate: TranslateService,
  mboxInfoService: MboxInfoService,
  configService: ConfigService
): () => Promise<any> {
  return () => {
    let langToLoad =
      mboxInfoService.getLanguage() || configService.defaultLanguage;
    langToLoad = langToLoad.toLowerCase();

    if (!configService.supportedLanguages.includes(langToLoad)) {
      langToLoad = configService.defaultLanguage;
    }
    return translate.use(langToLoad).toPromise();
  };
}

@NgModule({
  declarations: [
    AppComponent,
    PromoListComponent,
    PinCodeComponent,
    ConfirmationComponent,
    TestComponent,
  ],
  imports: [
    BrowserModule,
    RouterModule.forRoot(routes),
    HttpClientModule,
    FormsModule,
    CommonModule,
    MatIconModule,
    ButtonModule,
    TranslateModule.forRoot({
      defaultLanguage: 'en',
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient],
      },
    }),
  ],
  providers: [
    PromoService,
    MboxInfoService,
    FormattingService,
    AnimationService,
    PinCodeService,
    PromoValidationService,
    ConfigService,
    TranslationService,
    ApiService,
    CurrencyPipe,
    ErrorHandlingService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpErrorInterceptor,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: appInitializerFactory,
      deps: [TranslateService, MboxInfoService, ConfigService],
      multi: true,
    },
    { provide: LOCALE_ID, useValue: 'fr' },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
