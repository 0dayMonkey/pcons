import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ValidationResult } from './promo-validation.service';

export enum StimErrorCode {
  STIM_INEXISTANTE = 'JOAPI_STIM_0001',
  AUCUN_CLIENT = 'JOAPI_STIM_0002',
  CLIENT_INTERDIT = 'JOAPI_STIM_0003',
  STATUT_INVALIDE = 'JOAPI_STIM_0004',
  CLOTUREE = 'JOAPI_STIM_0005',
  NOMBRE_UTILISATION = 'JOAPI_STIM_0006',
  PERIODE_VALIDITE = 'JOAPI_STIM_0007',
  ETABLISSEMENT_UTILISATION = 'JOAPI_STIM_0008',
  DELAI_UTILISATION = 'JOAPI_STIM_0009',
  ETABLISSEMENT_UTILISATION_NULL = 'JOAPI_STIM_0011',
  PERIODE_NULL = 'JOAPI_STIM_0012',
  ETABLISSEMENT_CONSOMMATION_INCONNU = 'JOAPI_STIM_0013',
  NON_HABILITE = 'JOAPI_STIM_0017',
  API_COMMUNICATION_ERROR = 'API_COMMUNICATION_ERROR',
}

export enum MboxErrorCode {
  MBOX_AUTH_ERROR = 'MBOX_AUTH_ERROR',
  PIN_INVALID = 'PIN_INVALID',
  MBOX_TIMEOUT_ERROR = 'MBOX_TIMEOUT_ERROR',
}

export enum ApplicationErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  APPLICATION_ERROR = 'APPLICATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ErrorContext {
  component?: string;
  action?: string;
  additionalData?: any;
}

@Injectable({
  providedIn: 'root',
})
export class ErrorHandlingService {
  private errorCodesToClear: string[] = [
    StimErrorCode.CLIENT_INTERDIT,
    StimErrorCode.STATUT_INVALIDE,
    StimErrorCode.CLOTUREE,
    StimErrorCode.NOMBRE_UTILISATION,
    StimErrorCode.PERIODE_VALIDITE,
    StimErrorCode.DELAI_UTILISATION,
    StimErrorCode.ETABLISSEMENT_UTILISATION_NULL,
    StimErrorCode.PERIODE_NULL,
    StimErrorCode.ETABLISSEMENT_CONSOMMATION_INCONNU,
    StimErrorCode.NON_HABILITE,
    MboxErrorCode.MBOX_AUTH_ERROR,
  ];

  constructor(private translate: TranslateService) {}

  createValidationResult(
    isSuccess: boolean,
    isMember: boolean,
    errorMessage?: string,
    errorCode?: string
  ): ValidationResult {
    return {
      isSuccess,
      isMember,
      errorMessage:
        errorMessage || this.getTranslatedErrorMessage('UNKNOWN_ERROR'),
      errorCode: errorCode || 'UNKNOWN_ERROR',
    };
  }

  normalizeHttpError(error: HttpErrorResponse, context?: string): any {
    const errorCode = this.extractErrorCodeFromHttpResponse(error);
    const requirePinClear = this.shouldClearPinCode(errorCode);

    return {
      code: errorCode,
      message: this.getTranslatedErrorMessage(errorCode),
      requirePinClear: requirePinClear,
      originalError: error,
      context: context,
    };
  }

  normalizeMboxError(error: any, context?: string): any {
    let errorCode = MboxErrorCode.MBOX_AUTH_ERROR;

    if (
      typeof error === 'string' &&
      Object.values(MboxErrorCode).includes(error as MboxErrorCode)
    ) {
      errorCode = error as MboxErrorCode;
    } else if (
      error?.code &&
      Object.values(MboxErrorCode).includes(error.code as MboxErrorCode)
    ) {
      errorCode = error.code as MboxErrorCode;
    }

    const errorMessage = this.getTranslatedErrorMessage(errorCode);
    const requirePinClear = this.shouldClearPinCode(errorCode);

    const result = {
      code: errorCode,
      message: errorMessage,
      requirePinClear: requirePinClear,
      originalError: error,
      context: context,
    };

    this.logError(result);
    return result;
  }

  normalizeApplicationError(error: any, context?: string): any {
    let errorCode = ApplicationErrorCode.UNKNOWN_ERROR;
    let errorMessage = '';

    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.message) {
      errorMessage = error.message;
    }

    if (
      error?.code &&
      Object.values(ApplicationErrorCode).includes(
        error.code as ApplicationErrorCode
      )
    ) {
      errorCode = error.code as ApplicationErrorCode;
    } else if (
      typeof error === 'string' &&
      Object.values(ApplicationErrorCode).includes(
        error as ApplicationErrorCode
      )
    ) {
      errorCode = error as ApplicationErrorCode;
    }

    if (!errorMessage) {
      errorMessage = this.getTranslatedErrorMessage(errorCode);
    }

    const requirePinClear = this.shouldClearPinCode(errorCode);

    const result = {
      code: errorCode,
      message: errorMessage,
      requirePinClear: requirePinClear,
      originalError: error,
      context: context,
    };

    this.logError(result);
    return result;
  }

  toValidationResult(error: any, isMember: boolean = true): ValidationResult {
    return this.createValidationResult(
      false,
      isMember,
      error.message || this.getTranslatedErrorMessage('UNKNOWN_ERROR'),
      error.code || 'UNKNOWN_ERROR'
    );
  }

  getTranslatedErrorMessage(errorCode: string): string {
    const errorKey = `Errors.${errorCode}`;
    const fallbackKey = 'Errors.UNKNOWN_ERROR';

    if (this.translate.instant(errorKey) !== errorKey) {
      return this.translate.instant(errorKey);
    }

    return this.translate.instant(fallbackKey);
  }

  shouldClearPinCode(errorCode: string): boolean {
    return this.errorCodesToClear.includes(errorCode);
  }

  private logError(error: any): void {
    const context = error.context || 'UNKNOWN';
    console.error(
      `[${context}] Error (${error.code}): ${error.message}`,
      error.originalError
    );
  }

  private extractErrorCodeFromHttpResponse(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return StimErrorCode.API_COMMUNICATION_ERROR;
    }

    if (error.error && typeof error.error === 'object' && error.error.code) {
      return error.error.code;
    }

    if (
      error.error &&
      typeof error.error === 'object' &&
      error.error.error &&
      error.error.error.code
    ) {
      return error.error.error.code;
    }

    if (error.error && typeof error.error === 'string') {
      try {
        const parsedError = JSON.parse(error.error);
        if (parsedError.code) {
          return parsedError.code;
        }
        if (parsedError.error && parsedError.error.code) {
          return parsedError.error.code;
        }
      } catch (e) {
        const match = error.error.match(/JOAPI_STIM_\d+/);
        if (match) {
          return match[0];
        }
      }
    }

    if (error.message) {
      const match = error.message.match(/JOAPI_STIM_\d+/);
      if (match) {
        return match[0];
      }
    }

    return ApplicationErrorCode.UNKNOWN_ERROR;
  }

  handleApiError(error: any): string {
    if (!error.error || !error.error.code) {
      return this.getTranslatedErrorMessage(
        StimErrorCode.API_COMMUNICATION_ERROR
      );
    }

    return this.getTranslatedErrorMessage(error.error.code);
  }
}
