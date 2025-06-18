import { Injectable, Injector } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from '../../../../common/services/api.service';
import { MboxInfoService } from '../../../../common/services/mbox-info.service';
import { ErrorHandlingService } from './error-handler.service';
import { requestPlayerPin } from 'mbox-opencontent-sdk';

export interface ValidationResult {
  isSuccess: boolean;
  isMember: boolean;
  rewardValue?: number;
  rewardType?: string;
  newBalance?: number;
  errorMessage?: string;
  promoId?: number;
  errorCode?: string;
  message?: string;
}

export interface PlayerAuthRequest {
  promoId: number;
  urlOnSuccess: string;
  urlOnFailure: string;
  urlOnError: string;
  customPayload?: any;
}

@Injectable({
  providedIn: 'root',
})
export class PromoValidationService {
  private errorService: ErrorHandlingService | null = null;

  constructor(
    private apiService: ApiService,
    private mboxService: MboxInfoService,
    private injector: Injector
  ) {
    setTimeout(() => {
      this.errorService = this.injector.get(ErrorHandlingService);
    });
  }

  private getErrorService(): ErrorHandlingService {
    if (!this.errorService) {
      this.errorService = this.injector.get(ErrorHandlingService);
    }
    return this.errorService;
  }

  validateCode(code: string): Observable<ValidationResult> {
    return this.apiService.validatePromoCode(code).pipe(
      map((response) => {
        if (response.valid && response.promo) {
          const isCustomer = this.mboxService.getPlayerId() !== '0';

          return {
            isSuccess: true,
            isMember: isCustomer,
            rewardValue: response.promo.reward_value,
            rewardType: response.promo.reward_type,
            newBalance: this.calculateNewBalance(
              response.promo.reward_value,
              response.promo.reward_type
            ),
            promoId: response.promo.id,
          };
        } else {
          let errorCode: string | undefined;

          if (typeof response.message === 'string') {
            const match = response.message.match(/JOAPI_STIM_\d+/);
            if (match) {
              errorCode = match[0];
            }
          }

          console.log("[PROMO_SERVICE] Code d'erreur extrait:", errorCode);

          return {
            isSuccess: false,
            isMember: this.mboxService.getPlayerId() !== '0',
            errorMessage: this.getErrorService().getTranslatedErrorMessage(
              errorCode || 'UNKNOWN_ERROR'
            ),
            errorCode: errorCode || 'UNKNOWN_ERROR',
          };
        }
      }),
      catchError((error: any) => {
        console.log('[PROMO_SERVICE] Erreur:', error);
        const errorService = this.getErrorService();

        if (error && error.code) {
          return of(
            errorService.toValidationResult(
              error,
              this.mboxService.getPlayerId() !== '0'
            )
          );
        }

        const normalizedError = errorService.normalizeHttpError(
          error,
          'PROMO_VALIDATION'
        );
        return of(
          errorService.toValidationResult(
            normalizedError,
            this.mboxService.getPlayerId() !== '0'
          )
        );
      })
    );
  }

  applyValidatedPromo(promoId: number): Observable<ValidationResult> {
    if (!promoId) {
      const error = this.getErrorService().normalizeApplicationError(
        {
          code: 'JOAPI_STIM_0001',
          message:
            this.getErrorService().getTranslatedErrorMessage('JOAPI_STIM_0001'),
        },
        'PROMO_VALIDATION'
      );

      return throwError(() => error);
    }

    return this.apiService.usePromo(promoId).pipe(
      map((response) => {
        return {
          isSuccess: true,
          isMember: this.mboxService.getPlayerId() !== '0',
          message: response.message,
        };
      }),
      catchError((error: any) => {
        console.error(
          "[PROMO_SERVICE] Erreur lors de l'application de la promotion:",
          error
        );
        const errorService = this.getErrorService();

        if (error && error.code) {
          return of(
            errorService.toValidationResult(
              error,
              this.mboxService.getPlayerId() !== '0'
            )
          );
        }

        const normalizedError = errorService.normalizeHttpError(
          error,
          'PROMO_APPLY'
        );
        return of(
          errorService.toValidationResult(
            normalizedError,
            this.mboxService.getPlayerId() !== '0'
          )
        );
      })
    );
  }

  requestPlayerAuthentication(authRequest: PlayerAuthRequest): void {
    try {
      console.log("[PROMO_SERVICE] Appel à l'authentification PIN - START");
      console.log('[PROMO_SERVICE] Paramètres:', {
        promoId: authRequest.promoId,
        urlOnSuccess: authRequest.urlOnSuccess,
        urlOnFailure: authRequest.urlOnFailure,
        urlOnError: authRequest.urlOnError,
        payload: authRequest.customPayload,
      });

      requestPlayerPin({
        appName: 'JOA MyPromo',
        urlOnSuccess: authRequest.urlOnSuccess,
        urlOnFailure: authRequest.urlOnFailure,
        urlOnError: authRequest.urlOnError,
        customPayload: authRequest.customPayload,
      });

      console.log("[PROMO_SERVICE] Appel à l'authentification PIN - SUCCESS");
      console.log('[PROMO_SERVICE] Attente de redirection par la MBox...');
    } catch (error) {
      console.log("[PROMO_SERVICE] Appel à l'authentification PIN - ÉCHEC");
      console.error(
        "[PROMO_SERVICE] Erreur lors de la demande d'authentification:",
        error
      );

      throw this.getErrorService().normalizeMboxError(error, 'MBOX_AUTH');
    }
  }

  /**
   * Gère les erreurs d'authentification MBox
   */
  handleMboxAuthError(errorCode: string): ValidationResult {
    const errorService = this.getErrorService();
    const standardizedError = errorService.normalizeMboxError(
      errorCode,
      'MBOX_AUTH'
    );
    return errorService.toValidationResult(
      standardizedError,
      this.mboxService.getPlayerId() !== '0'
    );
  }

  private calculateNewBalance(rewardValue: number, rewardType: string): number {
    return rewardValue + 1000;
  }
}
