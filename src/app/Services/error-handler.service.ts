import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root',
})
export class ErrorHandlerService {
  constructor(private translate: TranslateService) {}

  handlePlayerIdError(): string {
    return (
      this.translate.instant('generic.error') +
      ' - ' +
      this.translate.instant('generic.playerID')
    );
  }

  handleApiError(messageKey: string = 'generic.apiError'): string {
    return this.translate.instant(messageKey);
  }

  handlePdfGenerationError(): void {
    alert(
      this.translate.instant('alert.pdfGenerationError', {
        defaultValue: 'Erreur lors de la génération du PDF.',
      })
    );
  }

  handlePdfUploadError(): void {
    alert(
      this.translate.instant('alert.pdfUploadError', {
        defaultValue: "Erreur lors de l'envoi du PDF au serveur.",
      })
    );
  }

  displayValidationAlert(
    hasScrolledToBottom: boolean,
    mandatoryCheckbox: boolean,
    signatureDataUrl: string | null
  ): void {
    let message = this.translate.instant('alert.validationImpossible');
    if (!hasScrolledToBottom) {
      message += `\n- ${this.translate.instant('alert.mustReadConditions')}`;
    }
    if (!mandatoryCheckbox) {
      message += `\n- ${this.translate.instant(
        'alert.mandatoryCheckboxRequired'
      )}`;
    }
    if (!signatureDataUrl) {
      message += `\n- ${this.translate.instant('alert.signatureRequired')}`;
    }
    alert(message);
  }
}
