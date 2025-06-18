import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MboxInfoService } from '../../../../common/services/mbox-info.service';
import { ConfigService } from 'projects/common/services/config.service';

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  constructor(
    private translateService: TranslateService,
    private mboxInfoService: MboxInfoService,
    private config: ConfigService
  ) {
    this.init();
  }

  init(): void {
    this.translateService.setDefaultLang(this.config.defaultLanguage);
    this.mboxInfoService.mboxData$.subscribe((data) => {
      this.updateLanguage(data.twoLetterISOLanguageName);
    });
  }

  updateLanguage(lang?: string): void {
    const language = (
      lang ||
      this.mboxInfoService.getLanguage() ||
      this.config.defaultLanguage
    ).toLowerCase();

    if (this.config.supportedLanguages.includes(language)) {
      this.translateService.use(language);
    } else {
      this.translateService.use(this.config.defaultLanguage);
    }
  }

  // translate(key: string, params?: any): string {
  //   return this.translateService.instant(key, params);
  // }
}
