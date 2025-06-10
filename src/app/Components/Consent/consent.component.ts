import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  OnInit,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  ConsentOrchestrationService,
  SubmissionData,
} from '../../Services/consent-orchestration.service';
import { ConsentDefinitionResponse } from '../../Services/api.service';
import { SignaturePadService } from '../../Services/signature-pad.service';
import { LoggingService } from '../../Services/logging.service';
import { LogLevel } from '../../Services/websocket.service';

@Component({
  selector: 'app-consent',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, TranslateModule],
  templateUrl: './consent.component.html',
  styleUrls: ['./consent.component.scss'],
})
export class ConsentComponent implements OnInit, AfterViewInit, OnDestroy {
  consentIdToDisplayAndSubmit: string = '';
  firstName: string = '';
  lastName: string = '';
  cardIdNumber: string = '';
  playerPhotoUrl: string = 'assets/placeholder/placeholder.jpg';
  private currentPlayerId: string | null = null;
  private currentConsentDefinition: ConsentDefinitionResponse | null = null;
  private consentDefinitionIdToSubmit: number = 0;
  private definitionUserIdApi: string | null = null;
  rulesText: string = '';
  mandatoryCheckbox: boolean = false;
  optionalCheckbox: boolean = false;
  signatureDataUrl: string | null = null;
  hasReachedBottomOnce: boolean = false;
  private screenWidth: number = window.innerWidth;
  private resizeListener: any;
  casinoName: string = 'Golden Palace';
  casinoLogoUrl: string | null = '/assets/logo_gp.png';

  get predefinedTextSizes() {
    const baseSize = Math.max(14, Math.min(window.innerWidth * 0.025, 30));
    return {
      small: Math.round(baseSize * 1),
      medium: Math.round(baseSize * 1.5),
      large: Math.round(baseSize * 2),
    };
  }

  currentTextSizeInPx: number = this.predefinedTextSizes.medium;

  get minTextSize(): number {
    return Math.max(10, Math.min(window.innerWidth * 0.02, 14));
  }

  get maxTextSize(): number {
    return Math.max(20, Math.min(window.innerWidth * 0.04, 65));
  }

  buttonState: 'idle' | 'loading' | 'success' = 'idle';
  showValidationPopup: boolean = false;
  validationPopupMessage: string = '';
  @ViewChild('signaturePadCanvas')
  signaturePadCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('rulesBody') rulesBody!: ElementRef<HTMLDivElement>;
  @ViewChild('signaturePadWrapper')
  signaturePadWrapper!: ElementRef<HTMLDivElement>;
  private resizeObserver!: ResizeObserver;
  private navigationTimer: any;
  private initialPinchDistance: number = 0;
  private pinchStartFontSize: number = 0;
  private rulesBodyElement: HTMLDivElement | null = null;
  isLoadingInitialData: boolean = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
    private signaturePadService: SignaturePadService,
    private orchestrationService: ConsentOrchestrationService,
    private loggingService: LoggingService
  ) {
    this.validationPopupMessage = this.translate.instant('alert.thankYou');
    this.rulesText = this.translate.instant('generic.loading');
  }

  ngOnInit(): void {
    this.currentPlayerId = this.route.snapshot.paramMap.get('playerId');
    this.loggingService.log(
      LogLevel.DEBUG,
      `Consent component initializing for player ID: ${
        this.currentPlayerId || 'N/A'
      }`
    );
    if (!this.currentPlayerId) {
      this.playerPhotoUrl = 'assets/placeholder/placeholder.jpg';
      this.rulesText = this.translate.instant('generic.apiError');
      this.isLoadingInitialData = false;
      this.loggingService.log(
        LogLevel.ERROR,
        'Critical error: PlayerId is missing from route parameters.'
      );
      this.orchestrationService.handleCriticalError('PlayerId missing');
      return;
    }

    this.loadInitialData(this.currentPlayerId);
    this.applyTextSizeChangeSideEffects();
    this.resizeListener = this.handleResize.bind(this);
    window.addEventListener('resize', this.resizeListener);

    this.currentTextSizeInPx = this.predefinedTextSizes.medium;
  }

  private handleResize(): void {
    this.screenWidth = window.innerWidth;
    const currentSizeKey = this.getCurrentTextSizeKey();
    if (currentSizeKey) {
      this.currentTextSizeInPx = this.predefinedTextSizes[currentSizeKey];
    } else {
      this.currentTextSizeInPx = this.predefinedTextSizes.medium;
    }
    this.applyTextSizeChangeSideEffects();
  }

  public getCurrentTextSizeKey(): 'small' | 'medium' | 'large' | null {
    const sizes = this.predefinedTextSizes;
    if (Math.abs(this.currentTextSizeInPx - sizes.small) < 1) return 'small';
    if (Math.abs(this.currentTextSizeInPx - sizes.medium) < 1) return 'medium';
    if (Math.abs(this.currentTextSizeInPx - sizes.large) < 1) return 'large';
    return null;
  }

  private loadInitialData(playerId: string): void {
    this.isLoadingInitialData = true;
    this.playerPhotoUrl = 'assets/placeholder/placeholder.jpg';
    this.cdr.detectChanges();

    this.orchestrationService.loadInitialData(playerId).subscribe({
      next: (results) => {
        if (!results) {
          this.rulesText = this.translate.instant('generic.apiError');
          this.isLoadingInitialData = false;
          this.cdr.detectChanges();
          return;
        }

        const { playerData, newConsentId, consentDefinitions } = results;

        if (playerData) {
          this.firstName =
            playerData.firstName || this.translate.instant('generic.na');
          this.lastName =
            playerData.lastName || this.translate.instant('generic.na');
          this.cardIdNumber = playerId;

          if (playerData.photoUrl) {
            this.playerPhotoUrl = playerData.photoUrl;
          } else {
            this.orchestrationService
              .loadPlayerPicture(playerId)
              .subscribe((url) => {
                this.playerPhotoUrl =
                  url || 'assets/placeholder/placeholder.jpg';
                this.cdr.detectChanges();
              });
          }
        }

        this.consentIdToDisplayAndSubmit = newConsentId;
        this.currentConsentDefinition = consentDefinitions;
        this.rulesText = consentDefinitions.text;
        this.consentDefinitionIdToSubmit = consentDefinitions.id;
        this.definitionUserIdApi = consentDefinitions.userId || null;

        this.isLoadingInitialData = false;
        this.hasReachedBottomOnce = false;
        this.cdr.detectChanges();
        this.loggingService.log(
          LogLevel.INFO,
          'Initial data loaded successfully.'
        );
        setTimeout(() => this.checkScroll(), 50);
      },
      error: () => {
        this.rulesText = this.translate.instant('generic.apiError');
        this.isLoadingInitialData = false;
        this.cdr.detectChanges();
      },
    });
  }

  ngAfterViewInit(): void {
    this.initializeSignaturePad();
    this.rulesBodyElement = this.rulesBody?.nativeElement || null;

    if (this.rulesBodyElement) {
      this.rulesBodyElement.addEventListener(
        'scroll',
        this.onRulesScroll.bind(this)
      );
      this.rulesBodyElement.addEventListener(
        'touchstart',
        this.onTouchStart.bind(this),
        { passive: false }
      );
      this.rulesBodyElement.addEventListener(
        'touchmove',
        this.onTouchMove.bind(this),
        { passive: false }
      );
      this.rulesBodyElement.addEventListener(
        'touchend',
        this.onTouchEnd.bind(this)
      );
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (
        this.signaturePadWrapper &&
        this.signaturePadWrapper.nativeElement.offsetWidth > 0
      ) {
        this.resizeSignaturePad();
      }
    });
    if (this.signaturePadWrapper && this.signaturePadWrapper.nativeElement) {
      this.resizeObserver.observe(this.signaturePadWrapper.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.loggingService.log(
      LogLevel.DEBUG,
      'Consent component being destroyed.'
    );
    if (this.rulesBodyElement) {
      this.rulesBodyElement.removeEventListener(
        'scroll',
        this.onRulesScroll.bind(this)
      );
      this.rulesBodyElement.removeEventListener(
        'touchstart',
        this.onTouchStart.bind(this)
      );
      this.rulesBodyElement.removeEventListener(
        'touchmove',
        this.onTouchMove.bind(this)
      );
      this.rulesBodyElement.removeEventListener(
        'touchend',
        this.onTouchEnd.bind(this)
      );
    }
    if (
      this.resizeObserver &&
      this.signaturePadWrapper &&
      this.signaturePadWrapper.nativeElement
    ) {
      this.resizeObserver.unobserve(this.signaturePadWrapper.nativeElement);
    }
    this.signaturePadService.off();
    if (this.navigationTimer) {
      clearTimeout(this.navigationTimer);
    }
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
  }

  private onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2 && this.rulesBodyElement) {
      event.preventDefault();
      this.initialPinchDistance = this.getDistanceBetweenTouches(event.touches);
      this.pinchStartFontSize = this.currentTextSizeInPx;
    }
  }

  private onTouchMove(event: TouchEvent): void {
    if (
      event.touches.length === 2 &&
      this.rulesBodyElement &&
      this.initialPinchDistance > 0
    ) {
      event.preventDefault();
      const currentDistance = this.getDistanceBetweenTouches(event.touches);
      const scaleFactor = currentDistance / this.initialPinchDistance;
      let newSize = this.pinchStartFontSize * scaleFactor;
      newSize = Math.max(this.minTextSize, Math.min(this.maxTextSize, newSize));

      if (Math.abs(this.currentTextSizeInPx - newSize) >= 0.5) {
        this.currentTextSizeInPx = Math.round(newSize);
        this.applyTextSizeChangeSideEffects();
      }
    }
  }

  private onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      this.initialPinchDistance = 0;
    }
  }

  private getDistanceBetweenTouches(touches: TouchList): number {
    const touch1 = touches[0];
    const touch2 = touches[1];
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private initializeSignaturePad(): void {
    if (this.signaturePadCanvas) {
      const signaturePad = this.signaturePadService.initialize(
        this.signaturePadCanvas.nativeElement,
        {
          backgroundColor: 'rgb(243, 244, 246)',
          penColor: 'rgb(0, 0, 0)',
          minWidth: 0.5,
          maxWidth: 2.5,
        }
      );
      signaturePad.addEventListener('endStroke', () => {
        this.signatureDataUrl = signaturePad.isEmpty()
          ? null
          : signaturePad.toDataURL();
        this.cdr.detectChanges();
      });
      this.resizeSignaturePad();
    }
  }

  private resizeSignaturePad(): void {
    if (this.signaturePadCanvas && this.signaturePadWrapper) {
      this.signaturePadService.resize(
        this.signaturePadCanvas.nativeElement,
        this.signaturePadWrapper.nativeElement,
        this.signatureDataUrl
      );
    }
  }

  public clearSignature(): void {
    this.signaturePadService.clear();
    this.signatureDataUrl = null;
    this.cdr.detectChanges();
  }

  public onRulesScroll(): void {
    this.checkScroll();
  }

  private checkScroll(): void {
    if (this.rulesBodyElement && !this.hasReachedBottomOnce) {
      const el = this.rulesBodyElement;
      const threshold = 10;
      if (el.scrollHeight - el.scrollTop <= el.clientHeight + threshold) {
        this.hasReachedBottomOnce = true;
        this.cdr.detectChanges();
      }
    }
  }

  public setTextSize(sizeKey: 'small' | 'medium' | 'large'): void {
    this.currentTextSizeInPx = this.predefinedTextSizes[sizeKey];
    this.applyTextSizeChangeSideEffects();
  }

  private applyTextSizeChangeSideEffects(): void {
    this.currentTextSizeInPx = Math.max(
      this.minTextSize,
      Math.min(this.maxTextSize, this.currentTextSizeInPx)
    );
    this.hasReachedBottomOnce = false;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.checkScroll();
    }, 50);
  }

  public getScaledCheckboxLabelSize(): number {
    const viewportWidth = window.innerWidth;
    const baseSize = Math.max(12, Math.min(viewportWidth * 0.025, 30));
    const scaleFactor =
      this.currentTextSizeInPx / this.predefinedTextSizes.medium;
    let scaledSize = baseSize * scaleFactor;
    const minSize = Math.max(10, Math.min(viewportWidth * 0.04, 20));
    const maxSize = Math.max(20, Math.min(viewportWidth * 0.08, 35));
    scaledSize = Math.max(minSize, Math.min(scaledSize, maxSize));
    return Math.round(scaledSize);
  }

  public isSubmitEnabled(): boolean {
    return (
      !this.isLoadingInitialData &&
      this.mandatoryCheckbox &&
      !!this.signatureDataUrl &&
      this.hasReachedBottomOnce &&
      !!this.currentConsentDefinition &&
      !!this.consentIdToDisplayAndSubmit
    );
  }

  async onSubmit(): Promise<void> {
    if (!this.isSubmitEnabled() || this.buttonState !== 'idle') {
      if (this.buttonState !== 'idle') return;
      let message = this.translate.instant('alert.validationImpossible');
      if (this.isLoadingInitialData)
        message += `\n- ${this.translate.instant('generic.loading')}`;
      if (!this.hasReachedBottomOnce)
        message += `\n- ${this.translate.instant('alert.mustReadConditions')}`;
      if (!this.mandatoryCheckbox)
        message += `\n- ${this.translate.instant(
          'alert.mandatoryCheckboxRequired'
        )}`;
      if (!this.signatureDataUrl)
        message += `\n- ${this.translate.instant('alert.signatureRequired')}`;
      if (!this.currentConsentDefinition)
        message += `\n- ${this.translate.instant('generic.apiError')}`;
      if (!this.consentIdToDisplayAndSubmit)
        message += `\n- ${this.translate.instant('generic.apiError')}`;
      this.loggingService.log(
        LogLevel.ERROR,
        `Submit validation failed: ${message.replace(/\n/g, ' ')}`
      );
      alert(message);
      return;
    }

    this.buttonState = 'loading';
    this.cdr.detectChanges();

    const submissionData: SubmissionData = {
      currentPlayerId: this.currentPlayerId!,
      consentIdToDisplayAndSubmit: this.consentIdToDisplayAndSubmit,
      consentDefinitionIdToSubmit: this.consentDefinitionIdToSubmit,
      optionalCheckbox: this.optionalCheckbox,
      definitionUserIdApi: this.definitionUserIdApi,
      lastName: this.lastName,
      firstName: this.firstName,
      cardIdNumber: this.cardIdNumber,
      currentConsentDefinition: this.currentConsentDefinition,
      casinoName: this.casinoName,
      casinoLogoUrl: this.casinoLogoUrl,
      mandatoryCheckbox: this.mandatoryCheckbox,
      signaturePadCanvas: this.signaturePadCanvas,
    };

    const success = await this.orchestrationService.submitConsent(
      submissionData
    );

    if (success) {
      this.buttonState = 'success';
      this.showValidationPopup = true;
      this.cdr.detectChanges();

      if (this.navigationTimer) clearTimeout(this.navigationTimer);
      this.navigationTimer = setTimeout(() => {
        this.showValidationPopup = false;
        this.router.navigate(['/logo'], { skipLocationChange: true });
        this.resetFormState();
        this.buttonState = 'idle';
        this.cdr.detectChanges();
      }, 5000);
    } else {
      alert(this.translate.instant('alert.pdfUploadErrorDetail'));
      this.buttonState = 'idle';
      this.cdr.detectChanges();
    }
  }

  private resetFormState(): void {
    this.mandatoryCheckbox = false;
    this.optionalCheckbox = false;
    this.clearSignature();
    this.hasReachedBottomOnce = false;
    this.currentTextSizeInPx = this.predefinedTextSizes.medium;
    this.applyTextSizeChangeSideEffects();
    if (this.rulesBodyElement) this.rulesBodyElement.scrollTop = 0;
    this.rulesText = this.translate.instant('generic.loading');
    this.consentIdToDisplayAndSubmit = '';
    this.currentConsentDefinition = null;
    this.isLoadingInitialData = true;
    this.playerPhotoUrl = 'assets/placeholder/placeholder.jpg';
  }
}
