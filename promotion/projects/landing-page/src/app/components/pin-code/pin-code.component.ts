import {
  Component,
  EventEmitter,
  Input,
  Output,
  ElementRef,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { PinCodeService } from '../../services/pin-code.service';
import { ConfigService } from 'projects/common/services/config.service';
import {
  PromoValidationService,
  ValidationResult,
  PlayerAuthRequest,
} from '../../services/promo-validation.service';
import { ErrorHandlingService } from '../../services/error-handler.service';
import { Subject, of } from 'rxjs';
import { takeUntil, finalize, delay } from 'rxjs/operators';

import { MboxInfoService } from '../../../../../common/services/mbox-info.service';

@Component({
  selector: 'app-pin-code',
  templateUrl: './pin-code.component.html',
  styleUrls: ['./pin-code.component.scss'],
})
export class PinCodeComponent implements OnInit, OnDestroy, OnChanges {
  @Input() pinTitle: string = '';
  @Input() placeholderText: string = '';
  @Input() validateButtonText: string = '';
  @Input() clearButtonText: string = 'C';
  @Input() initialLoadingState: boolean = true;

  @Output() validate = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();
  @Output() startExitAnimation = new EventEmitter<void>();
  @Output() showConfirmation = new EventEmitter<ValidationResult>();

  voucherCode: string = '';
  isExiting: boolean = false;
  isLoading: boolean = false;
  isPinCodeLoading: boolean = true;

  private destroy$ = new Subject<void>();
  private readonly SIMULATED_DELAY = 0;

  constructor(
    private pinCodeService: PinCodeService,
    private config: ConfigService,
    private el: ElementRef,
    private promoValidationService: PromoValidationService,
    private errorService: ErrorHandlingService,
    private mboxInfoService: MboxInfoService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialLoadingState']) {
      this.isPinCodeLoading = changes['initialLoadingState'].currentValue;
    }
  }

  ngOnInit(): void {
    this.isPinCodeLoading = this.initialLoadingState;

    if (this.SIMULATED_DELAY > 0 && !this.initialLoadingState) {
      this.isPinCodeLoading = true;
      setTimeout(() => {
        this.isPinCodeLoading = false;
      }, this.SIMULATED_DELAY / 2);
    } else if (this.initialLoadingState) {
    } else {
      this.isPinCodeLoading = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  appendDigit(digit: string): void {
    this.voucherCode += digit;
    this.voucherCode = this.pinCodeService.formatVoucherCode(this.voucherCode);
  }

  removeLastDigit(): void {
    if (this.voucherCode.endsWith('-')) {
      this.voucherCode = this.voucherCode.slice(0, -2);
    } else {
      this.voucherCode = this.voucherCode.slice(0, -1);
    }
  }

  clearCode(): void {
    this.voucherCode = '';
  }

  validateCode(): void {
    if (!this.isValidCode() || this.isLoading) {
      return;
    }
    this.isLoading = true;
    this.validate.emit(this.voucherCode);

    const playerId = this.mboxInfoService.getPlayerId();
    const isMember = playerId !== '' && playerId !== '0';

    if (isMember) {
      this.requestPlayerAuthentication();
    } else {
      console.log('Joueur anonyme détecté, validation directe du code...');
      this.validatePromotionForAnonymous(this.voucherCode);
    }
  }

  private validatePromotionForAnonymous(promoCode: string): void {
    this.promoValidationService
      .validateCode(promoCode)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe({
        next: (result: ValidationResult) => {
          result.isMember = false;

          if (
            result.errorCode &&
            this.errorService.shouldClearPinCode(result.errorCode)
          ) {
            this.clearCode();
          }

          this.exitWithConfirmation(result);
        },
        error: (error: any) => {
          let errorResult: ValidationResult;
          if (error && error.code) {
            errorResult = this.errorService.toValidationResult(error, false);
          } else {
            errorResult =
              this.promoValidationService.handleMboxAuthError(
                'VALIDATION_ERROR'
              );
          }

          errorResult.isMember = false;
          if (
            this.errorService.shouldClearPinCode(errorResult.errorCode || '')
          ) {
            this.clearCode();
          }
          this.exitWithConfirmation(errorResult);
        },
      });
  }

  private requestPlayerAuthentication(): void {
    const currentUrl = window.location.href.split('?')[0];
    const baseUrl = currentUrl.endsWith('/') ? currentUrl : `${currentUrl}/`;
    let promoId = 0;
    try {
      promoId = parseInt(this.voucherCode.replace(/-/g, ''));
      if (isNaN(promoId)) promoId = 0;
    } catch (e) {
      promoId = 0;
    }
    const authRequest: PlayerAuthRequest = {
      promoId: promoId,
      urlOnSuccess: `${baseUrl}?status=success&code=${this.voucherCode}`,
      urlOnFailure: `${baseUrl}?status=failure&code=${this.voucherCode}`,
      urlOnError: `${baseUrl}?status=error&code=${this.voucherCode}`,
      customPayload: { code: this.voucherCode },
    };

    of(null)
      .pipe(delay(this.SIMULATED_DELAY / 2), takeUntil(this.destroy$))
      .subscribe(() => {
        try {
          this.promoValidationService.requestPlayerAuthentication(authRequest);
          setTimeout(() => {
            if (this.isLoading) {
              this.isLoading = false;
              this.handleAuthenticationError('MBOX_TIMEOUT_ERROR');
            }
          }, 1000);
        } catch (error) {
          this.isLoading = false;
          this.handleAuthenticationError('MBOX_AUTH_ERROR');
        }
      });
  }

  private handleAuthenticationError(errorCode: string): void {
    const errorResult =
      this.promoValidationService.handleMboxAuthError(errorCode);
    if (this.errorService.shouldClearPinCode(errorCode)) {
      this.clearCode();
    }
    this.isLoading = false;
    this.exitWithConfirmation(errorResult);
  }

  validatePromotion(promoCode: string): void {
    this.isLoading = true;
    this.promoValidationService
      .validateCode(promoCode)
      .pipe(
        delay(this.SIMULATED_DELAY),
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe({
        next: (result: ValidationResult) => {
          if (result.isSuccess && result.promoId) {
            this.clearCode();
          } else if (
            result.errorCode &&
            this.errorService.shouldClearPinCode(result.errorCode)
          ) {
            this.clearCode();
          }
          this.exitWithConfirmation(result);
        },
        error: (error: any) => {
          let errorResult: ValidationResult;
          if (error && error.code) {
            errorResult = this.errorService.toValidationResult(error, false);
            if (
              error.requirePinClear ||
              this.errorService.shouldClearPinCode(error.code)
            ) {
              this.clearCode();
            }
          } else {
            errorResult =
              this.promoValidationService.handleMboxAuthError(
                'VALIDATION_ERROR'
              );
            this.clearCode();
          }
          this.exitWithConfirmation(errorResult);
        },
      });
  }

  private exitWithConfirmation(result: ValidationResult): void {
    this.startExitAnimation.emit();
    setTimeout(() => {
      this.showConfirmation.emit(result);
    }, this.config.viewTransitionDelay);
  }

  goBack(skipEmit: boolean = false): void {
    if (!this.isExiting) {
      this.isExiting = true;
      const container = this.el.nativeElement.querySelector(
        '.pin-code-container'
      );
      container.classList.add('slide-out');
      if (!skipEmit) {
        this.startExitAnimation.emit();
      }
      setTimeout(() => {
        this.cancel.emit();
        this.isExiting = false;
      }, this.config.viewTransitionDelay);
    }
  }

  isValidCode(): boolean {
    return this.pinCodeService.isValidCode(this.voucherCode);
  }
}
