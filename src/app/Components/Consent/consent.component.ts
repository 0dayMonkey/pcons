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
        locationType: locationType,
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

    const DOWNSCALED_WIDTH = 400;
    const DOWNSCALED_HEIGHT = 150;
    const PADDING = 10;

    const originalImageDataUrl = this.signaturePad.toDataURL('image/jpeg');
    const originalImage = new Image();
    originalImage.src = originalImageDataUrl;

    return new Promise((resolve) => {
      originalImage.onload = () => {
        const resampleCanvas = document.createElement('canvas');
        resampleCanvas.width = DOWNSCALED_WIDTH;
        resampleCanvas.height = DOWNSCALED_HEIGHT;
        const ctx = resampleCanvas.getContext('2d');

        if (ctx) {
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
              originalImage,
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
        resolve(resampleCanvas.toDataURL('image/jpeg'));
      };
      originalImage.onerror = () => {
        resolve(null);
      };
    });
  }

  private async generateConsentPdfAsBlob(): Promise<Blob> {
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

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text(this.translate.instant('consent.pdf.title'), margin, currentY);
    currentY += 12;

    const photoWidth = 30;
    const photoHeight = 30;
    const textBlockStartY = currentY;
    let playerDetailsY = textBlockStartY;

    const gapBetweenTextAndPhoto = 5;
    const playerInfoTextWidth =
      contentWidth - photoWidth - gapBetweenTextAndPhoto;
    const lineHeightForPlayerInfo = 7;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    const labelCol1X = margin;
    const valueCol1X = margin + 35;
    const labelCol2X = margin + playerInfoTextWidth / 2 + 2;
    const valueCol2X = labelCol2X + 20;

    doc.setFont('helvetica', 'bold');
    doc.text(
      this.translate.instant('consent.pdf.lastNameLabel'),
      labelCol1X,
      playerDetailsY
    );
    doc.setFont('helvetica', 'normal');
    doc.text(this.lastName, valueCol1X, playerDetailsY, {
      maxWidth: playerInfoTextWidth / 2 - 37,
    });

    doc.setFont('helvetica', 'bold');
    doc.text(
      this.translate.instant('consent.pdf.firstNameLabel'),
      labelCol2X,
      playerDetailsY
    );
    doc.setFont('helvetica', 'normal');
    doc.text(this.firstName, valueCol2X, playerDetailsY, {
      maxWidth: playerInfoTextWidth / 2 - 22,
    });
    playerDetailsY += lineHeightForPlayerInfo;

    doc.setFont('helvetica', 'bold');
    doc.text(
      this.translate.instant('consent.pdf.birthDateLabel'),
      labelCol1X,
      playerDetailsY
    );
    doc.setFont('helvetica', 'normal');
    doc.text(this.birthDate, valueCol1X, playerDetailsY, {
      maxWidth: playerInfoTextWidth / 2 - 37,
    });

    doc.setFont('helvetica', 'bold');
    doc.text(
      this.translate.instant('consent.pdf.playerIDLabel'),
      labelCol2X,
      playerDetailsY
    );
    doc.setFont('helvetica', 'normal');
    doc.text(this.cardIdNumber, valueCol2X, playerDetailsY, {
      maxWidth: playerInfoTextWidth / 2 - 22,
    });

    const textBlockActualHeight =
      playerDetailsY - textBlockStartY + lineHeightForPlayerInfo / 2;
    const photoAdjustmentUpwards = 15;
    const photoFinalY = textBlockStartY - photoAdjustmentUpwards;
    const photoX = margin + playerInfoTextWidth + gapBetweenTextAndPhoto;

    if (
      this.playerPhotoUrl &&
      this.playerPhotoUrl !== 'assets/placeholder/placeholder.jpg'
    ) {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = this.playerPhotoUrl;
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            doc.addImage(
              img,
              img.src.startsWith('data:image/png') ||
                img.src.startsWith('data:image/jpeg')
                ? img.src.startsWith('data:image/png')
                  ? 'PNG'
                  : 'JPEG'
                : 'PNG',
              photoX,
              photoFinalY,
              photoWidth,
              photoHeight
            );
            resolve();
          };
          img.onerror = () => {
            doc.setFillColor(220, 220, 220);
            doc.rect(photoX, photoFinalY, photoWidth, photoHeight, 'F');
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(
              this.translate.instant('consent.pdf.photoPlaceholder'),
              photoX + photoWidth / 2,
              photoFinalY + photoHeight / 2,
              { align: 'center', baseline: 'middle' }
            );
            resolve();
          };
        });
      } catch (e) {
        doc.setFillColor(220, 220, 220);
        doc.rect(photoX, photoFinalY, photoWidth, photoHeight, 'F');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          this.translate.instant('consent.pdf.photoPlaceholder'),
          photoX + photoWidth / 2,
          photoFinalY + photoHeight / 2,
          { align: 'center', baseline: 'middle' }
        );
      }
    } else {
      doc.setFillColor(220, 220, 220);
      doc.rect(photoX, photoFinalY, photoWidth, photoHeight, 'F');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        this.translate.instant('consent.pdf.photoPlaceholder'),
        photoX + photoWidth / 2,
        photoFinalY + photoHeight / 2,
        { align: 'center', baseline: 'middle' }
      );
    }

    currentY =
      Math.max(
        textBlockStartY + textBlockActualHeight,
        photoFinalY + photoHeight
      ) + 5;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 10;

    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const textToDisplayInPdf = this.currentConsentDefinition
      ? this.currentConsentDefinition.text
      : this.translate.instant('generic.na');
    const splitRulesText = doc.splitTextToSize(
      textToDisplayInPdf,
      contentWidth
    );
    const rulesLineHeight = 4;
    for (const line of splitRulesText) {
      addPageIfNeeded(rulesLineHeight);
      doc.text(line, margin, currentY);
      currentY += rulesLineHeight;
    }
    currentY += 10;

    addPageIfNeeded(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(
      this.translate.instant('consent.pdf.agreementsTitle'),
      margin,
      currentY
    );
    currentY += 8;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 7;

    const checkboxSize = 4;
    const checkboxTextOffsetX = checkboxSize + 2;
    const checkboxLineHeight = 4.5;
    let checkboxSectionY = currentY;

    doc.setFontSize(10);
    let tempY =
      checkboxSectionY + checkboxSize / 2 - checkboxLineHeight / 2 + 1.5;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, checkboxSectionY, checkboxSize, checkboxSize, 'S');
    if (this.mandatoryCheckbox) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(
        margin + checkboxSize * 0.2,
        checkboxSectionY + checkboxSize * 0.5,
        margin + checkboxSize * 0.4,
        checkboxSectionY + checkboxSize * 0.7
      );
      doc.line(
        margin + checkboxSize * 0.4,
        checkboxSectionY + checkboxSize * 0.7,
        margin + checkboxSize * 0.8,
        checkboxSectionY + checkboxSize * 0.3
      );
    }

    let manLabelX = margin + checkboxTextOffsetX;
    const initialManLabelX = manLabelX;

    doc.setTextColor(255, 0, 0);
    doc.setFont('helvetica', 'bold');
    const asteriskChar = this.translate.instant('generic.requiredMarker');
    doc.text(asteriskChar, manLabelX, tempY);
    manLabelX +=
      (doc.getStringUnitWidth(asteriskChar) * doc.getFontSize()) /
      doc.internal.scaleFactor;

    doc.setTextColor(0, 0, 0);
    const consentBoldText =
      ' ' + this.translate.instant('consent.pdf.consentLabel') + ' : ';
    doc.text(consentBoldText, manLabelX, tempY);
    manLabelX +=
      (doc.getStringUnitWidth(consentBoldText) * doc.getFontSize()) /
      doc.internal.scaleFactor;

    doc.setFont('helvetica', 'normal');
    const mainDeclarationText = this.translate.instant(
      'consent.pdf.mainDeclaration'
    );
    const requiredText = '   ' + this.translate.instant('generic.requiredText');

    const originalManFontSize = doc.getFontSize();
    let currentManFont = doc.getFont().fontName;
    let currentManStyle = doc.getFont().fontStyle;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(originalManFontSize);
    const requiredTextWidth =
      (doc.getStringUnitWidth(requiredText.trimStart()) * originalManFontSize) /
        doc.internal.scaleFactor +
      1;
    doc.setFont(currentManFont, currentManStyle);
    doc.setFontSize(originalManFontSize);

    const availableWidthForMainText =
      contentWidth -
      checkboxTextOffsetX -
      (manLabelX - initialManLabelX) -
      requiredTextWidth;
    const mainTextLines = doc.splitTextToSize(
      mainDeclarationText,
      availableWidthForMainText < 0
        ? contentWidth - checkboxTextOffsetX
        : availableWidthForMainText
    );

    let manTextCurrentX = manLabelX;
    for (let i = 0; i < mainTextLines.length; i++) {
      if (i > 0) {
        tempY += checkboxLineHeight;
        manTextCurrentX = margin + checkboxTextOffsetX;
        addPageIfNeeded(checkboxLineHeight);
      }
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.text(mainTextLines[i], manTextCurrentX, tempY);
      if (i === mainTextLines.length - 1) {
        manTextCurrentX +=
          (doc.getStringUnitWidth(mainTextLines[i]) * doc.getFontSize()) /
          doc.internal.scaleFactor;
      }
    }
    doc.setTextColor(255, 0, 0);
    doc.setFont('helvetica', 'italic');
    doc.text(requiredText, manTextCurrentX, tempY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    checkboxSectionY = tempY + checkboxLineHeight;

    tempY = checkboxSectionY + checkboxSize / 2 - checkboxLineHeight / 2 + 1.5;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, checkboxSectionY, checkboxSize, checkboxSize, 'S');
    if (this.optionalCheckbox) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(
        margin + checkboxSize * 0.2,
        checkboxSectionY + checkboxSize * 0.5,
        margin + checkboxSize * 0.4,
        checkboxSectionY + checkboxSize * 0.7
      );
      doc.line(
        margin + checkboxSize * 0.4,
        checkboxSectionY + checkboxSize * 0.7,
        margin + checkboxSize * 0.8,
        checkboxSectionY + checkboxSize * 0.3
      );
    }

    let optLabelX = margin + checkboxTextOffsetX;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    const communicationsBoldText =
      this.translate.instant('consent.pdf.communicationsLabel') + ' : ';
    doc.text(communicationsBoldText, optLabelX, tempY);
    optLabelX +=
      (doc.getStringUnitWidth(communicationsBoldText) * doc.getFontSize()) /
      doc.internal.scaleFactor;

    doc.setFont('helvetica', 'normal');
    const communicationsNormalText = this.translate.instant(
      'consent.optionalCommunicationsLabelText'
    );
    const commTextLines = doc.splitTextToSize(
      communicationsNormalText,
      contentWidth -
        checkboxTextOffsetX -
        (optLabelX - (margin + checkboxTextOffsetX))
    );
    let optTextCurrentX = optLabelX;
    for (let i = 0; i < commTextLines.length; i++) {
      if (i > 0) {
        tempY += checkboxLineHeight;
        optTextCurrentX = margin + checkboxTextOffsetX;
        addPageIfNeeded(checkboxLineHeight);
      }
      doc.text(commTextLines[i], optTextCurrentX, tempY);
    }
    checkboxSectionY = tempY + checkboxLineHeight;
    currentY = checkboxSectionY + 7;

    addPageIfNeeded(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(
      this.translate.instant('consent.pdf.signatureInfoTitle'),
      margin,
      currentY
    );
    currentY += 8;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 7;

    const sigInfoStartY = currentY;
    const signatureMaxHeight = 30;
    const infoGap = 5;
    const fixedInfoTextX = 95;
    const signatureMaxWidth = fixedInfoTextX - margin - infoGap;
    const infoTextX = fixedInfoTextX;
    const infoTextWidth = pageWidth - margin - infoTextX;
    const textInfoLineHeight = 5;

    let signatureActualHeight = 0;
    let signatureImgDataForPdf: HTMLImageElement | null = null;
    let signatureImgRenderWidth = 0;

    const signatureImgForPdfDataUrl = await this.getResizedSignatureDataUrl();

    if (signatureImgForPdfDataUrl) {
      const img = new Image();
      img.src = signatureImgForPdfDataUrl;
      try {
        await new Promise<void>((resolve) => {
          img.onload = () => {
            const aspectRatio = img.width / img.height;
            signatureImgRenderWidth = signatureMaxWidth;
            let h = signatureImgRenderWidth / aspectRatio;
            if (h > signatureMaxHeight) {
              h = signatureMaxHeight;
              signatureImgRenderWidth = h * aspectRatio;
            }
            signatureActualHeight = h;
            signatureImgDataForPdf = img;
            resolve();
          };
          img.onerror = () => {
            signatureActualHeight = signatureMaxHeight;
            resolve();
          };
        });
      } catch (e) {
        signatureActualHeight = signatureMaxHeight;
      }
    } else {
      signatureActualHeight = signatureMaxHeight;
    }

    const now = new Date();
    const consentDateFormatted = now.toLocaleString(
      this.translate.currentLang || 'fr-FR',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }
    );
    const validUntilDate = new Date(now);
    if (this.currentConsentDefinition?.consentYearsDuration) {
      validUntilDate.setFullYear(
        now.getFullYear() + this.currentConsentDefinition.consentYearsDuration
      );
    } else {
      validUntilDate.setFullYear(now.getFullYear() + 1);
    }

    const validUntilDateFormatted = validUntilDate.toLocaleDateString(
      this.translate.currentLang || 'fr-FR',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }
    );

    const infoItemsForPdf = [
      {
        label: this.translate.instant('consent.pdf.consentDateLabel'),
        value: consentDateFormatted,
      },
      {
        label: this.translate.instant('consent.pdf.validUntilLabel'),
        value: validUntilDateFormatted,
      },
      {
        label: this.translate.instant('consent.pdf.consentIdLabel'),
        value: this.consentIdToDisplayAndSubmit,
      },
    ];

    const textInfoBlockActualHeight =
      infoItemsForPdf.length * textInfoLineHeight;

    const overallSectionHeight = Math.max(
      signatureActualHeight,
      textInfoBlockActualHeight
    );

    const centeredSignatureY =
      sigInfoStartY + (overallSectionHeight - signatureActualHeight) / 2;
    const centeredTextInfoY_start =
      sigInfoStartY + (overallSectionHeight - textInfoBlockActualHeight) / 2;

    if (signatureImgDataForPdf) {
      doc.addImage(
        signatureImgDataForPdf,
        'PNG',
        margin,
        centeredSignatureY,
        signatureImgRenderWidth,
        signatureActualHeight
      );
    } else {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(
        margin,
        centeredSignatureY,
        signatureMaxWidth,
        signatureActualHeight,
        'S'
      );
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        this.translate.instant('consent.pdf.signatureNotProvided'),
        margin + signatureMaxWidth / 2,
        centeredSignatureY + signatureActualHeight / 2,
        { align: 'center', baseline: 'middle' }
      );
    }

    let currentTextInfoY = centeredTextInfoY_start;
    doc.setFontSize(9);

    infoItemsForPdf.forEach((item) => {
      let currentDrawX = infoTextX;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(item.label, currentDrawX, currentTextInfoY);

      const labelWidth =
        (doc.getStringUnitWidth(item.label) * doc.getFontSize()) /
        doc.internal.scaleFactor;
      currentDrawX += labelWidth + 1;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);

      doc.text(item.value, currentDrawX, currentTextInfoY, {
        maxWidth: infoTextWidth - (currentDrawX - infoTextX),
      });

      currentTextInfoY += textInfoLineHeight;
    });

    currentY = sigInfoStartY + overallSectionHeight + 10;

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `${this.translate.instant(
          'consent.pdf.pagePrefixLabel'
        )}${i}${this.translate.instant(
          'consent.pdf.pageSeparatorLabel'
        )}${totalPages}`,
        pageWidth - margin,
        pageHeight - margin + 7,
        { align: 'right' }
      );
    }
    return doc.output('blob');
  }
}
