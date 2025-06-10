import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  OnInit,
  Renderer2,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import SignaturePad from 'signature_pad';
import {
  AppWebSocketService,
  LogLevel,
  WebSocketMessage,
} from '../../Services/websocket.service';
import jsPDF from 'jspdf';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  ApiService,
  ConsentDefinitionResponse,
  LocationRef,
  PlayerConsentPOST,
} from '../../Services/api.service';
import { ConfigService } from '../../Services/config.service';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap, first } from 'rxjs/operators';

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
  birthDate: string = '';
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
    const baseSize = Math.max(14, Math.min(window.innerWidth * 0.025, 20));

    return {
      small: Math.round(baseSize * 0.85),
      medium: Math.round(baseSize),
      large: Math.round(baseSize * 1.25),
    };
  }

  currentTextSizeInPx: number = this.predefinedTextSizes.medium;

  get minTextSize(): number {
    return Math.max(10, Math.min(window.innerWidth * 0.02, 14));
  }

  get maxTextSize(): number {
    return Math.max(20, Math.min(window.innerWidth * 0.04, 32));
  }

  buttonState: 'idle' | 'loading' | 'success' = 'idle';
  showValidationPopup: boolean = false;
  validationPopupMessage: string = '';
  @ViewChild('signaturePadCanvas')
  signaturePadCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('rulesBody') rulesBody!: ElementRef<HTMLDivElement>;
  @ViewChild('signaturePadWrapper')
  signaturePadWrapper!: ElementRef<HTMLDivElement>;
  private signaturePad!: SignaturePad;
  private resizeObserver!: ResizeObserver;
  private navigationTimer: any;
  private initialPinchDistance: number = 0;
  private pinchStartFontSize: number = 0;
  private rulesBodyElement: HTMLDivElement | null = null;
  isLoadingInitialData: boolean = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private webSocketService: AppWebSocketService,
    private renderer: Renderer2,
    private translate: TranslateService,
    private apiService: ApiService,
    private configService: ConfigService,
    private cdr: ChangeDetectorRef
  ) {
    this.validationPopupMessage = this.translate.instant('alert.thankYou');
    this.rulesText = this.translate.instant('generic.loading');
  }

  private sendLog(level: LogLevel, message: string, error?: any): void {
    if (this.configService.getLogLevel() >= level) {
      const levelName = LogLevel[level];
      let logString = `[LOG][${levelName}] ${message}`;

      if (error) {
        const errorCode = error.name || 'UNKNOWN_ERROR';
        const errorMessage = error.message || 'No error message available.';
        const stack = error.stack ? `\n-- Stack Trace --\n${error.stack}` : '';
        logString += `\n> Code: ${errorCode}\n> Message: ${errorMessage}${stack}`;
      }
      this.webSocketService.sendMessage(logString);
    }
  }

  ngOnInit(): void {
    this.currentPlayerId = this.route.snapshot.paramMap.get('playerId');
    this.sendLog(
      LogLevel.DEBUG,
      `Consent component initializing for player ID: ${
        this.currentPlayerId || 'N/A'
      }`
    );
    if (!this.currentPlayerId) {
      this.playerPhotoUrl = 'assets/placeholder/placeholder.jpg';
      this.rulesText = this.translate.instant('generic.apiError');
      this.isLoadingInitialData = false;
      this.sendLog(
        LogLevel.ERROR,
        'Critical error: PlayerId is missing from route parameters.'
      );
      this.handleCriticalError('PlayerId missing');
      return;
    }

    this.loadInitialData();
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

  private getCurrentTextSizeKey(): 'small' | 'medium' | 'large' | null {
    const sizes = this.predefinedTextSizes;
    if (Math.abs(this.currentTextSizeInPx - sizes.small) < 1) return 'small';
    if (Math.abs(this.currentTextSizeInPx - sizes.medium) < 1) return 'medium';
    if (Math.abs(this.currentTextSizeInPx - sizes.large) < 1) return 'large';
    return null;
  }

  private loadInitialData(): void {
    this.isLoadingInitialData = true;
    this.playerPhotoUrl = 'assets/placeholder/placeholder.jpg';
    this.cdr.detectChanges();
    this.sendLog(LogLevel.INFO, 'Starting to load initial data.');

    this.configService
      .getConfig()
      .pipe(
        first(),
        switchMap(() => {
          return forkJoin({
            playerData: this.currentPlayerId
              ? this.apiService.getPlayerData(this.currentPlayerId)
              : of(null),
            newConsentId: this.apiService.getNewConsentId(),
            consentDefinitions: this.apiService.getActiveConsentDefinition(),
          });
        }),
        catchError((error) => {
          this.sendLog(
            LogLevel.ERROR,
            'Erreur lors du chargement des données initiales',
            error
          );
          this.rulesText = this.translate.instant('generic.apiError');
          this.playerPhotoUrl = 'assets/placeholder/placeholder.jpg';
          this.isLoadingInitialData = false;
          this.cdr.detectChanges();
          this.handleCriticalError('Initial data loading failed');
          return of(null);
        })
      )
      .subscribe((results) => {
        if (!results) {
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
          this.birthDate = playerData.birthDate
            ? new Date(playerData.birthDate).toLocaleDateString(
                this.translate.currentLang || 'fr-FR'
              )
            : this.translate.instant('generic.na');
          this.cardIdNumber =
            this.currentPlayerId || this.translate.instant('generic.na');

          if (playerData.photoUrl) {
            this.playerPhotoUrl = playerData.photoUrl;
          } else if (this.currentPlayerId) {
            this.apiService.getPlayerPicture(this.currentPlayerId).subscribe({
              next: (imageBlob: Blob) => {
                if (imageBlob && imageBlob.size > 0) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    this.playerPhotoUrl = reader.result as string;
                    this.cdr.detectChanges();
                  };
                  reader.readAsDataURL(imageBlob);
                } else {
                  this.playerPhotoUrl = 'assets/placeholder/placeholder.jpg';
                  this.cdr.detectChanges();
                }
              },
              error: (err) => {
                this.sendLog(
                  LogLevel.ERROR,
                  'Failed to load player picture',
                  err
                );
                this.playerPhotoUrl = 'assets/placeholder/placeholder.jpg';
                this.cdr.detectChanges();
              },
            });
          } else {
            this.playerPhotoUrl = 'assets/placeholder/placeholder.jpg';
          }
        }

        if (newConsentId) {
          this.consentIdToDisplayAndSubmit = newConsentId;
        } else {
          this.sendLog(
            LogLevel.ERROR,
            "Impossible d'obtenir un nouvel ID de consentement."
          );
          this.rulesText = this.translate.instant('generic.apiError');
          this.isLoadingInitialData = false;
          this.cdr.detectChanges();
          this.handleCriticalError("Couldn't get new consent ID");
          return;
        }

        if (consentDefinitions) {
          this.currentConsentDefinition = consentDefinitions;
          this.rulesText = this.currentConsentDefinition.text;
          this.consentDefinitionIdToSubmit = this.currentConsentDefinition.id;
          this.definitionUserIdApi =
            this.currentConsentDefinition.userId || null;
        } else {
          this.sendLog(
            LogLevel.ERROR,
            "Aucune définition de consentement active n'a été trouvée."
          );
          this.rulesText = this.translate.instant('generic.apiError');
          this.isLoadingInitialData = false;
          this.cdr.detectChanges();
          this.handleCriticalError('No active consent definition found');
          return;
        }
        this.isLoadingInitialData = false;
        this.hasReachedBottomOnce = false;
        this.cdr.detectChanges();
        this.sendLog(LogLevel.INFO, 'Initial data loaded successfully.');
        setTimeout(() => {
          this.checkScroll();
        }, 50);
      });
  }

  private handleCriticalError(reason?: string): void {
    const errorResponse: WebSocketMessage = {
      Action: 'Consent',
      PlayerId: this.currentPlayerId || undefined,
      Status: false,
      Message: reason,
    };
    this.webSocketService.sendMessage(errorResponse);
    this.router.navigate(['/logo'], { skipLocationChange: true });
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
    this.sendLog(LogLevel.DEBUG, 'Consent component being destroyed.');
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
    if (this.signaturePad) {
      this.signaturePad.off();
    }
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

  initializeSignaturePad(): void {
    if (this.signaturePadCanvas) {
      this.signaturePad = new SignaturePad(
        this.signaturePadCanvas.nativeElement,
        {
          backgroundColor: 'rgb(243, 244, 246)',
          penColor: 'rgb(0, 0, 0)',
          minWidth: 0.5,
          maxWidth: 2.5,
        }
      );
      this.signaturePad.addEventListener('endStroke', () => {
        this.signatureDataUrl = this.signaturePad.isEmpty()
          ? null
          : this.signaturePad.toDataURL();
        this.cdr.detectChanges();
      });
      this.resizeSignaturePad();
    }
  }

  resizeSignaturePad(): void {
    if (
      this.signaturePad &&
      this.signaturePadCanvas &&
      this.signaturePadWrapper
    ) {
      const canvas = this.signaturePadCanvas.nativeElement;
      const parentElement = this.signaturePadWrapper.nativeElement;

      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const parentWidth = parentElement.offsetWidth || 1;
      const parentHeight = parentElement.offsetHeight || 1;

      canvas.width = parentWidth * ratio;
      canvas.height = parentHeight * ratio;
      canvas.style.width = `${parentWidth}px`;
      canvas.style.height = `${parentHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(ratio, ratio);
      }

      if (this.signatureDataUrl) {
        const tempImg = new Image();
        tempImg.onload = () => {
          if (ctx) ctx.drawImage(tempImg, 0, 0, parentWidth, parentHeight);
        };
        tempImg.src = this.signatureDataUrl;
      } else {
        this.signaturePad.clear();
      }
    }
  }

  clearSignature(): void {
    if (this.signaturePad) {
      this.signaturePad.clear();
      this.signatureDataUrl = null;
      this.cdr.detectChanges();
    }
  }

  onRulesScroll(): void {
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

  setTextSize(sizeKey: 'small' | 'medium' | 'large'): void {
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

  getScaledCheckboxLabelSize(): number {
    const viewportWidth = window.innerWidth;
    const baseSize = Math.max(10, Math.min(viewportWidth * 0.022, 14));
    const scaleFactor =
      this.currentTextSizeInPx / this.predefinedTextSizes.medium;
    let scaledSize = baseSize * scaleFactor;

    const minSize = Math.max(9, Math.min(viewportWidth * 0.018, 12));
    const maxSize = Math.max(16, Math.min(viewportWidth * 0.035, 24));

    scaledSize = Math.max(minSize, Math.min(scaledSize, maxSize));
    return Math.round(scaledSize);
  }

  isSubmitEnabled(): boolean {
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

      this.sendLog(
        LogLevel.ERROR,
        `Submit validation failed: ${message.replace(/\n/g, ' ')}`
      );
      alert(message);
      return;
    }

    this.buttonState = 'loading';
    this.cdr.detectChanges();
    this.sendLog(
      LogLevel.INFO,
      'Submit button clicked, starting consent submission process.'
    );

    try {
      const pdfBlob = await this.generateConsentPdfAsBlob();
      const pdfBase64 = await this.blobToBase64(pdfBlob);

      const now = new Date();
      const endDate = new Date(now);
      if (this.currentConsentDefinition?.consentYearsDuration) {
        endDate.setFullYear(
          now.getFullYear() + this.currentConsentDefinition.consentYearsDuration
        );
      } else {
        endDate.setFullYear(now.getFullYear() + 1);
      }

      const locationType = this.configService.getLocTyp();
      const locationId = this.configService.getLocId();

      if (!locationType || !locationId) {
        this.sendLog(LogLevel.ERROR, 'Location Type ou Location ID manquant.');
        alert(this.translate.instant('generic.apiError'));
        this.buttonState = 'idle';
        this.cdr.detectChanges();
        return;
      }

      const location: LocationRef = {
        type: locationType,
        id: locationId,
      };

      const payload: PlayerConsentPOST = {
        id: this.consentIdToDisplayAndSubmit,
        consentDefinitionId: this.consentDefinitionIdToSubmit,
        commercialConsent: this.optionalCheckbox,
        startDate: now.toISOString(),
        endDate: endDate.toISOString(),
        pdf: pdfBase64,
        userId:
          this.definitionUserIdApi ||
          this.configService.getToken() ||
          undefined,
        lastUpdatedTimestamp: now.toISOString(),
        location: location,
      };

      this.sendLog(LogLevel.DEBUG, 'Submitting player consent payload.');
      this.apiService
        .submitPlayerConsent(this.currentPlayerId!, payload)
        .subscribe({
          next: (response) => {
            this.sendLog(
              LogLevel.INFO,
              'Consent submitted successfully to API.'
            );
            const wsMessage: WebSocketMessage = {
              Action: 'Consent',
              PlayerId: this.currentPlayerId || undefined,
              Status: true,
            };
            this.webSocketService.sendMessage(wsMessage);

            this.buttonState = 'success';
            this.showValidationPopup = true;
            this.cdr.detectChanges();

            if (this.navigationTimer) {
              clearTimeout(this.navigationTimer);
            }
            this.navigationTimer = setTimeout(() => {
              this.showValidationPopup = false;
              this.router.navigate(['/logo'], { skipLocationChange: true });
              this.resetFormState();
              this.buttonState = 'idle';
              this.cdr.detectChanges();
            }, 5000);
          },
          error: (err) => {
            this.sendLog(
              LogLevel.ERROR,
              this.translate.instant('alert.pdfUploadError'),
              err
            );
            alert(this.translate.instant('alert.pdfUploadErrorDetail'));
            this.buttonState = 'idle';
            this.cdr.detectChanges();
          },
        });
    } catch (error) {
      this.sendLog(
        LogLevel.ERROR,
        this.translate.instant('alert.pdfGenerationError'),
        error
      );
      alert(this.translate.instant('alert.pdfGenerationError'));
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

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => {
        reject(error);
      };
      reader.readAsDataURL(blob);
    });
  }

  private async getResizedSignatureDataUrl(): Promise<string | null> {
    if (!this.signaturePad || this.signaturePad.isEmpty()) {
      return null;
    }

    const points = this.signaturePad.toData();

    const tempTransparentCanvas = document.createElement('canvas');
    const originalCanvas = this.signaturePadCanvas.nativeElement;
    tempTransparentCanvas.width = originalCanvas.width;
    tempTransparentCanvas.height = originalCanvas.height;

    const tempSignaturePad = new SignaturePad(tempTransparentCanvas, {
      backgroundColor: 'rgba(0,0,0,0)',
      penColor: 'rgb(0, 0, 0)',
    });
    tempSignaturePad.fromData(points);
    const transparentImageDataUrl = tempSignaturePad.toDataURL('image/png');
    tempSignaturePad.off();

    const DOWNSCALED_WIDTH = 400;
    const DOWNSCALED_HEIGHT = 150;
    const PADDING = 10;

    const imageWithStrokesOnly = new Image();
    imageWithStrokesOnly.src = transparentImageDataUrl;

    return new Promise((resolve) => {
      imageWithStrokesOnly.onload = () => {
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = DOWNSCALED_WIDTH;
        finalCanvas.height = DOWNSCALED_HEIGHT;
        const ctx = finalCanvas.getContext('2d');

        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, DOWNSCALED_WIDTH, DOWNSCALED_HEIGHT);

          const boundingBox = this.signaturePad.toData().reduce(
            (acc, { points }) => {
              points.forEach(({ x, y }) => {
                acc.minX = Math.min(acc.minX, x);
                acc.maxX = Math.max(acc.maxX, x);
                acc.minY = Math.min(acc.minY, y);
                acc.maxY = Math.max(acc.maxY, y);
              });
              return acc;
            },
            {
              minX: Infinity,
              maxX: -Infinity,
              minY: Infinity,
              maxY: -Infinity,
            }
          );

          const sigWidth = boundingBox.maxX - boundingBox.minX;
          const sigHeight = boundingBox.maxY - boundingBox.minY;

          if (sigWidth > 0 && sigHeight > 0) {
            const sourceX = Math.max(0, boundingBox.minX - PADDING);
            const sourceY = Math.max(0, boundingBox.minY - PADDING);
            const sourceWidth = sigWidth + PADDING * 2;
            const sourceHeight = sigHeight + PADDING * 2;

            const aspectRatio = sourceWidth / sourceHeight;
            let drawWidth = DOWNSCALED_WIDTH;
            let drawHeight = drawWidth / aspectRatio;

            if (drawHeight > DOWNSCALED_HEIGHT) {
              drawHeight = DOWNSCALED_HEIGHT;
              drawWidth = drawHeight * aspectRatio;
            }

            const offsetX = (DOWNSCALED_WIDTH - drawWidth) / 2;
            const offsetY = (DOWNSCALED_HEIGHT - drawHeight) / 2;

            ctx.drawImage(
              imageWithStrokesOnly,
              sourceX,
              sourceY,
              sourceWidth,
              sourceHeight,
              offsetX,
              offsetY,
              drawWidth,
              drawHeight
            );
          }
        }
        resolve(finalCanvas.toDataURL('image/png'));
      };
      imageWithStrokesOnly.onerror = () => {
        resolve(null);
      };
    });
  }

  private async getSignatureWithWhiteBackground(
    originalDataUrl: string | null
  ): Promise<string | null> {
    if (!originalDataUrl) {
      return null;
    }

    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = 'Anonymous';
      image.src = originalDataUrl;

      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          resolve(null);
        }
      };

      image.onerror = () => {
        resolve(null);
      };
    });
  }

  async generateConsentPdfAsBlob(): Promise<Blob> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let currentY = margin;
    const contentWidth = pageWidth - 2 * margin;

    const addPageIfNeeded = (requiredHeight: number) => {
      if (currentY + requiredHeight > pageHeight - margin - 10) {
        doc.addPage();
        currentY = margin;
      }
    };

    const lastName = this.lastName || 'N/A';
    const firstName = this.firstName || 'N/A';
    const identityDocument = `${this.cardIdNumber}`;
    const rulesText = this.currentConsentDefinition?.text ?? 'N/A';
    const consentYearsDuration =
      this.currentConsentDefinition?.consentYearsDuration ?? 1;
    const consentVersion = this.currentConsentDefinition?.version ?? 'N/A';

    const logoContainerWidth = 40;
    const logoContainerHeight = 40;
    const logoX = margin;
    let headerSectionStartY = currentY;

    doc.setFillColor(255, 255, 255);
    doc.rect(
      logoX,
      headerSectionStartY,
      logoContainerWidth,
      logoContainerHeight,
      'F'
    );

    if (this.casinoLogoUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = this.casinoLogoUrl;
        await new Promise<void>((resolve) => {
          img.onload = () => {
            const imgAspectRatio = img.width / img.height;
            const containerAspectRatio =
              logoContainerWidth / logoContainerHeight;
            let drawWidth = logoContainerWidth;
            let drawHeight = logoContainerHeight;

            if (imgAspectRatio > containerAspectRatio) {
              drawHeight = drawWidth / imgAspectRatio;
            } else {
              drawWidth = drawHeight * imgAspectRatio;
            }

            const offsetX = logoX + (logoContainerWidth - drawWidth) / 2;
            const offsetY =
              headerSectionStartY + (logoContainerHeight - drawHeight) / 2;

            const format = this.casinoLogoUrl!.toLowerCase().includes('jpeg')
              ? 'JPEG'
              : 'PNG';
            doc.addImage(img, format, offsetX, offsetY, drawWidth, drawHeight);
            resolve();
          };
          img.onerror = () => {
            doc.setFillColor(230, 230, 230);
            doc.rect(
              logoX,
              headerSectionStartY,
              logoContainerWidth,
              logoContainerHeight,
              'F'
            );
            doc.setFontSize(8).setTextColor(150, 150, 150);
            doc.text(
              this.translate.instant('consent.pdf.logoPlaceholder'),
              logoX + logoContainerWidth / 2,
              headerSectionStartY + logoContainerHeight / 2,
              { align: 'center', baseline: 'middle' }
            );
            resolve();
          };
        });
      } catch (e) {}
    }

    const titleTextX = logoX + logoContainerWidth + 5;
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(0, 0, 0);
    const titleText = this.translate.instant('consent.pdf.title');
    doc.text(titleText, titleTextX, headerSectionStartY + 5);
    const titleDimensions = doc.getTextDimensions(titleText);

    const casinoNameTextY = headerSectionStartY + 5 + titleDimensions.h + 2;
    doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(80, 80, 80);
    doc.text(this.casinoName, titleTextX, casinoNameTextY);

    currentY =
      Math.max(headerSectionStartY + logoContainerHeight, casinoNameTextY) + 5;

    doc.setFontSize(10).setTextColor(0, 0, 0);
    const infoLineHeight = 6;

    const nomLabel = this.translate.instant('consent.pdf.lastNameLabel');
    doc.setFont('helvetica', 'bold');
    doc.text(nomLabel, margin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(lastName, margin + doc.getTextWidth(nomLabel) + 2, currentY);
    currentY += infoLineHeight;

    const prenomLabel = this.translate.instant('consent.pdf.firstNameLabel');
    doc.setFont('helvetica', 'bold');
    doc.text(prenomLabel, margin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(firstName, margin + doc.getTextWidth(prenomLabel) + 2, currentY);
    currentY += infoLineHeight;

    const idLabel = this.translate.instant('consent.pdf.identityDocumentLabel');
    doc.setFont('helvetica', 'bold');
    doc.text(idLabel, margin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(
      identityDocument,
      margin + doc.getTextWidth(idLabel) + 2,
      currentY
    );
    currentY += infoLineHeight + 4;

    doc.setDrawColor(200, 200, 200).setLineWidth(0.3);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 8;

    doc.setFontSize(9).setTextColor(0, 0, 0).setFont('helvetica', 'normal');
    const splitRulesText = doc.splitTextToSize(rulesText, contentWidth);
    for (const line of splitRulesText) {
      addPageIfNeeded(4);
      doc.text(line, margin, currentY);
      currentY += 4;
    }
    currentY += 10;

    addPageIfNeeded(30);
    doc.setFont('helvetica', 'bold').setFontSize(14);
    doc.text(
      this.translate.instant('consent.pdf.agreementsTitle'),
      margin,
      currentY
    );
    currentY += 8;
    doc.setDrawColor(200, 200, 200).setLineWidth(0.1);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 7;

    const checkboxSize = 4;
    const checkboxTextOffsetX = checkboxSize + 2;
    const checkboxLineHeight = 5;
    let tempY = currentY;

    doc.setFontSize(10);
    doc.setDrawColor(0, 0, 0).setLineWidth(0.3);
    doc.rect(margin, tempY, checkboxSize, checkboxSize, 'S');
    if (this.mandatoryCheckbox) {
      doc.setLineWidth(0.5);
      doc.line(margin + 1, tempY + 2, margin + 2, tempY + 3);
      doc.line(margin + 2, tempY + 3, margin + 3.5, tempY + 1);
    }

    let manLabelX = margin + checkboxTextOffsetX;
    doc.setFont('helvetica', 'bold').setTextColor(255, 0, 0);
    doc.text(
      this.translate.instant('generic.requiredMarker'),
      manLabelX,
      tempY + 3.5
    );
    manLabelX += doc.getTextWidth(
      this.translate.instant('generic.requiredMarker')
    );

    doc.setTextColor(0, 0, 0);
    const consentBoldText = this.translate.instant('consent.pdf.consentLabel');
    doc.text(consentBoldText, manLabelX, tempY + 3.5);
    manLabelX += doc.getTextWidth(consentBoldText) + 1;

    doc.setFont('helvetica', 'normal');
    const requiredText = this.translate.instant('generic.requiredText');
    const mainText = this.translate.instant('consent.pdf.mainDeclaration');
    const availableWidth =
      contentWidth - (manLabelX - margin) - doc.getTextWidth(requiredText) - 2;
    const mainTextLines = doc.splitTextToSize(mainText, availableWidth);

    let lastLineY = tempY + 3.5;
    mainTextLines.forEach((line: string, index: number) => {
      const currentLineY = tempY + 3.5 + index * checkboxLineHeight;
      doc.text(line, manLabelX, currentLineY);
      lastLineY = currentLineY;
    });

    doc.setFont('helvetica', 'italic').setTextColor(255, 0, 0);
    const lastLineX =
      manLabelX + doc.getTextWidth(mainTextLines[mainTextLines.length - 1]) + 1;
    doc.text(requiredText, lastLineX, lastLineY);

    tempY = lastLineY + checkboxLineHeight + 2;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.rect(margin, tempY, checkboxSize, checkboxSize, 'S');
    if (this.optionalCheckbox) {
      doc.setLineWidth(0.5);
      doc.line(margin + 1, tempY + 2, margin + 2, tempY + 3);
      doc.line(margin + 2, tempY + 3, margin + 3.5, tempY + 1);
    }

    let optLabelX = margin + checkboxTextOffsetX;
    doc.setFont('helvetica', 'bold');
    const comBoldText = this.translate.instant(
      'consent.pdf.communicationsLabel'
    );
    doc.text(comBoldText, optLabelX, tempY + 3.5);
    optLabelX += doc.getTextWidth(comBoldText) + 1;

    doc.setFont('helvetica', 'normal');
    const comTextLines = doc.splitTextToSize(
      this.translate.instant('consent.optionalCommunicationsLabelText'),
      contentWidth - (optLabelX - margin)
    );
    comTextLines.forEach((line: string, index: number) => {
      doc.text(line, optLabelX, tempY + 3.5 + index * checkboxLineHeight);
    });

    currentY = tempY + comTextLines.length * checkboxLineHeight + 10;

    addPageIfNeeded(40);
    doc.setFont('helvetica', 'bold').setFontSize(14);
    doc.text(
      this.translate.instant('consent.pdf.signatureInfoTitle'),
      margin,
      currentY
    );
    currentY += 8;
    doc
      .setDrawColor(200, 200, 200)
      .line(margin, currentY, pageWidth - margin, currentY);
    currentY += 7;

    const signatureMaxHeight = 30;
    const signatureMaxWidth = 80;
    const optimizedSignatureUrl = await this.getResizedSignatureDataUrl();
    const signatureImgDataForPdf = await this.getSignatureWithWhiteBackground(
      optimizedSignatureUrl
    );
    if (signatureImgDataForPdf) {
      doc.addImage(
        signatureImgDataForPdf,
        'PNG',
        margin,
        currentY,
        signatureMaxWidth,
        signatureMaxHeight
      );
    } else {
      doc
        .setDrawColor(0, 0, 0)
        .rect(margin, currentY, signatureMaxWidth, signatureMaxHeight, 'S');
      doc.setFontSize(8).setTextColor(150, 150, 150);
      doc.text(
        this.translate.instant('consent.pdf.signatureNotProvided'),
        margin + signatureMaxWidth / 2,
        currentY + signatureMaxHeight / 2,
        { align: 'center', baseline: 'middle' }
      );
    }

    const now = new Date();
    const validUntilDate = new Date(now);
    validUntilDate.setFullYear(now.getFullYear() + consentYearsDuration);

    const infoX = margin + signatureMaxWidth + 10;
    let infoY = currentY + 5;
    doc.setFontSize(9);

    doc.setFont('helvetica', 'normal').setTextColor(100, 100, 100);
    doc.text(
      this.translate.instant('consent.pdf.consentDateLabel'),
      infoX,
      infoY
    );
    infoY += 5;
    doc.setFont('helvetica', 'bold').setTextColor(0, 0, 0);
    doc.text(now.toLocaleString('fr-FR'), infoX, infoY);
    infoY += 7;

    doc.setFont('helvetica', 'normal').setTextColor(100, 100, 100);
    doc.text(
      this.translate.instant('consent.pdf.validUntilLabel'),
      infoX,
      infoY
    );
    infoY += 5;
    doc.setFont('helvetica', 'bold').setTextColor(0, 0, 0);
    doc.text(validUntilDate.toLocaleDateString('fr-FR'), infoX, infoY);
    infoY += 7;

    doc.setFont('helvetica', 'normal').setTextColor(100, 100, 100);
    doc.text(
      this.translate.instant('consent.pdf.consentIdLabel'),
      infoX,
      infoY
    );
    infoY += 5;
    doc.setFont('helvetica', 'bold').setTextColor(0, 0, 0);
    doc.text(this.consentIdToDisplayAndSubmit, infoX, infoY);

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8).setTextColor(100, 100, 100);
      const pagePrefix = this.translate.instant('consent.pdf.pagePrefixLabel');
      const pageSeparator = this.translate.instant(
        'consent.pdf.pageSeparatorLabel'
      );
      doc.text(
        `${pagePrefix} ${i} ${pageSeparator} ${totalPages}`,
        pageWidth - margin,
        pageHeight - margin + 7,
        { align: 'right' }
      );
    }

    return doc.output('blob');
  }
}
