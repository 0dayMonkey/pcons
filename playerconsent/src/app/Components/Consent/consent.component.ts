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
  InitialData,
  PdfLayoutType,
  SubmissionData,
} from '../../Services/consent-orchestration.service';
import { ConsentDefinitionResponse } from '../../Services/api.service';
import { SignaturePadService } from '../../Services/signature-pad.service';
import { LoggingService } from '../../Services/logging.service';
import { LogLevel } from '../../Services/websocket.service';
import { ConfigService } from '../../Services/config.service';
import { FontSizeManagerService } from '../../Services/font-size-manager.service';
import { UiInteractionService } from '../../Services/ui-interaction.service';
import { Subject, takeUntil } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-consent',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, TranslateModule],
  templateUrl: './consent.component.html',
  styleUrls: ['./consent.component.scss'],
  providers: [FontSizeManagerService, UiInteractionService],
})
export class ConsentComponent implements OnInit, AfterViewInit, OnDestroy {
  consentIdToDisplayAndSubmit: string = '';
  firstName: string = '';
  lastName: string = '';
  documentIdInfo: string = '';
  rulesText: string = '';
  safeRulesText: SafeHtml = '';
  mandatoryCheckbox: boolean = false;
  optionalCheckbox: boolean = false;
  isCommunicationCheckboxDisabled: boolean = true;
  signatureDataUrl: string | null = null;
  casinoName: string = '';
  casinoLogoUrl: string | null = null;
  public logoLayoutType: PdfLayoutType = 'portrait';
  buttonState: 'idle' | 'loading' | 'success' = 'idle';
  showValidationPopup: boolean = false;
  validationPopupMessage: string = '';
  isLoadingInitialData: boolean = true;
  hasReachedBottomOnce: boolean = false;

  private currentPlayerId: string | null = null;
  private currentConsentDefinition: ConsentDefinitionResponse | null = null;
  private consentDefinitionIdToSubmit: number = 0;
  private definitionUserIdApi: string | null = null;

  @ViewChild('signaturePadCanvas')
  signaturePadCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('rulesBody') rulesBody!: ElementRef<HTMLDivElement>;
  @ViewChild('signaturePadWrapper')
  signaturePadWrapper!: ElementRef<HTMLDivElement>;

  private resizeObserver!: ResizeObserver;
  private navigationTimer: any;
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
    private signaturePadService: SignaturePadService,
    private orchestrationService: ConsentOrchestrationService,
    private loggingService: LoggingService,
    private configService: ConfigService,
    public fontSizeManager: FontSizeManagerService,
    public uiInteractionService: UiInteractionService,
    private sanitizer: DomSanitizer
  ) {
    this.validationPopupMessage = this.translate.instant('alert.thankYou');
    const loadingText = this.translate.instant('generic.loading');
    this.rulesText = loadingText;
    this.safeRulesText = this.sanitizer.bypassSecurityTrustHtml(loadingText);
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.currentPlayerId = params.get('playerId');
      const siteId = this.configService.getSiteId();

      this.loggingService.log(
        LogLevel.DEBUG,
        'Consent component initializing or re-initializing for player.',
        {
          playerId: this.currentPlayerId,
          siteId: siteId,
        }
      );

      if (!this.currentPlayerId || !siteId) {
        this.loggingService.log(
          LogLevel.ERROR,
          'Critical error: PlayerId or SiteId is missing.'
        );
        this.orchestrationService.handleCriticalError(
          'PlayerId or SiteId missing'
        );
        return;
      }

      this.resetFormState();

      this.uiInteractionService.hasReachedBottom$
        .pipe(takeUntil(this.destroy$))
        .subscribe((value) => {
          if (value) {
            this.hasReachedBottomOnce = true;
            this.cdr.detectChanges();
          }
        });

      this.loadInitialData(this.currentPlayerId, siteId);
    });

    this.listenForNewConsentRequests();
  }
  private listenForNewConsentRequests(): void {
    this.orchestrationService.newConsentRequest$
      .pipe(takeUntil(this.destroy$))
      .subscribe((newPlayerId) => {
        this.loggingService.log(
          LogLevel.INFO,
          'New consent request received, cancelling current flow.',
          { newPlayerId }
        );

        if (this.navigationTimer) {
          clearTimeout(this.navigationTimer);
          this.navigationTimer = null;
        }

        this.showValidationPopup = false;

        this.router.navigate(['/consent', newPlayerId], {
          skipLocationChange: true,
          replaceUrl: true,
        });
      });
  }
  private loadInitialData(playerId: string, siteId: string): void {
    this.isLoadingInitialData = true;
    this.cdr.detectChanges();

    this.orchestrationService
      .loadInitialData(playerId, Number(siteId))
      .subscribe({
        next: (results) => {
          if (!results) {
            const apiErrorText = this.translate.instant('generic.apiError');
            this.rulesText = apiErrorText;
            this.safeRulesText =
              this.sanitizer.bypassSecurityTrustHtml(apiErrorText);
            this.isLoadingInitialData = false;
            this.cdr.detectChanges();
            this.loggingService.log(
              LogLevel.ERROR,
              'Initial data is null after loading.',
              { playerId, siteId }
            );
            return;
          }
          this.processInitialData(results);
        },
        error: (err) => {
          const apiErrorText = this.translate.instant('generic.apiError');
          this.rulesText = apiErrorText;
          this.safeRulesText =
            this.sanitizer.bypassSecurityTrustHtml(apiErrorText);
          this.isLoadingInitialData = false;
          this.cdr.detectChanges();
          this.loggingService.log(
            LogLevel.ERROR,
            'Error while loading initial data.',
            err
          );
        },
      });
  }

  private processInitialData(data: InitialData): void {
    const {
      playerData,
      newConsentId,
      consentDefinitions,
      siteInfo,
      siteLogoUrl,
      hasActiveContacts,
      identityDocumentString,
    } = data;

    if (playerData) {
      this.firstName =
        playerData.firstName || this.translate.instant('generic.na');
      this.lastName =
        playerData.lastName || this.translate.instant('generic.na');
      this.documentIdInfo = identityDocumentString || ' ';
    }

    if (siteInfo && siteInfo.longLabel) {
      this.casinoName = siteInfo.longLabel;
    } else {
      this.loggingService.log(
        LogLevel.ERROR,
        'Le nom du casino est manquant dans l objet siteInfo de l API.',
        { siteInfo }
      );
    }
    this.casinoLogoUrl = siteLogoUrl;

    this.consentIdToDisplayAndSubmit = newConsentId;
    this.currentConsentDefinition = consentDefinitions;
    this.rulesText = consentDefinitions.text;
    this.safeRulesText = this.sanitizer.bypassSecurityTrustHtml(this.rulesText);
    this.consentDefinitionIdToSubmit = consentDefinitions.id;
    this.definitionUserIdApi = consentDefinitions.userId || null;
    this.isCommunicationCheckboxDisabled = !hasActiveContacts;
    if (this.isCommunicationCheckboxDisabled) {
      this.optionalCheckbox = false;
    }

    this.isLoadingInitialData = false;
    this.uiInteractionService.resetScrollState();
    this.cdr.detectChanges();
    this.loggingService.log(
      LogLevel.INFO,
      'Initial data processed successfully.'
    );
  }

  public onLogoLoad(imageElement: HTMLImageElement): void {
    const isWide = imageElement.naturalWidth > imageElement.naturalHeight * 1.7;
    this.logoLayoutType = isWide ? 'wide' : 'portrait';
    this.cdr.detectChanges();
    this.loggingService.log(
      LogLevel.INFO,
      'Logo loaded, layout type set to:',
      this.logoLayoutType
    );
  }

  ngAfterViewInit(): void {
    this.initializeSignaturePad();
    this.uiInteractionService.initialize(
      this.rulesBody.nativeElement,
      this.fontSizeManager
    );

    this.resizeObserver = new ResizeObserver(() => {
      if (this.signaturePadWrapper?.nativeElement.offsetWidth > 0) {
        this.resizeSignaturePad();
      }
    });
    this.resizeObserver.observe(this.signaturePadWrapper.nativeElement);
  }

  ngOnDestroy(): void {
    this.loggingService.log(
      LogLevel.DEBUG,
      'Consent component being destroyed.'
    );
    this.destroy$.next();
    this.destroy$.complete();
    this.uiInteractionService.ngOnDestroy();
    this.resizeObserver?.disconnect();
    this.signaturePadService.off();
    if (this.navigationTimer) {
      clearTimeout(this.navigationTimer);
    }
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

  public setTextSize(sizeKey: 'small' | 'medium' | 'large'): void {
    this.fontSizeManager.setTextSize(sizeKey);
    this.uiInteractionService.resetScrollState();
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

  public handleContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const anchorElement = target.closest('a');

    if (anchorElement) {
      event.preventDefault();
      this.loggingService.log(
        LogLevel.INFO,
        'Navigation link click prevented.',
        { href: anchorElement.href }
      );
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.isSubmitEnabled() || this.buttonState !== 'idle') {
      if (this.buttonState !== 'idle') return;

      const validationErrors: string[] = [];
      if (this.isLoadingInitialData)
        validationErrors.push(this.translate.instant('generic.loading'));
      if (!this.hasReachedBottomOnce)
        validationErrors.push(
          this.translate.instant('alert.mustReadConditions')
        );
      if (!this.mandatoryCheckbox)
        validationErrors.push(
          this.translate.instant('alert.mandatoryCheckboxRequired')
        );
      if (!this.signatureDataUrl)
        validationErrors.push(
          this.translate.instant('alert.signatureRequired')
        );

      this.loggingService.log(LogLevel.ERROR, 'Submit validation failed.', {
        reasons: validationErrors,
      });

      const alertMessage = `${this.translate.instant(
        'alert.validationImpossible'
      )}\n- ${validationErrors.join('\n- ')}`;
      alert(alertMessage);
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
      documentIdInfo: this.documentIdInfo,
      currentConsentDefinition: this.currentConsentDefinition,
      casinoName: this.casinoName,
      casinoLogoUrl: this.casinoLogoUrl,
      mandatoryCheckbox: this.mandatoryCheckbox,
      signaturePadCanvas: this.signaturePadCanvas,
      logoLayoutType: this.logoLayoutType,
    };

    const success = await this.orchestrationService.submitConsent(
      submissionData
    );

    if (success) {
      this.buttonState = 'success';
      this.showValidationPopup = true;
      this.cdr.detectChanges();

      this.navigationTimer = setTimeout(() => {
        this.showValidationPopup = false;
        this.resetFormState();

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
    this.isCommunicationCheckboxDisabled = true;
    this.clearSignature();
    this.hasReachedBottomOnce = false;
    this.setTextSize('medium');
    const loadingText = this.translate.instant('generic.loading');
    this.rulesText = loadingText;
    this.safeRulesText = this.sanitizer.bypassSecurityTrustHtml(loadingText);
    this.consentIdToDisplayAndSubmit = '';
    this.currentConsentDefinition = null;
    this.isLoadingInitialData = true;
    this.casinoName = '';
    this.casinoLogoUrl = null;
    this.logoLayoutType = 'portrait';
    this.buttonState = 'idle';
  }
}
