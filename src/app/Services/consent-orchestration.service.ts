import { Injectable, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import {
  ApiService,
  ConsentDefinitionResponse,
  ContactDetailRef,
  CustomerContactResponse,
  LocationRef,
  PlayerConsentPOST,
  PlayerData,
  PlayerDocumentResponse,
  SiteResponse,
} from './api.service';
import {
  AppWebSocketService,
  LogLevel,
  WebSocketMessage,
} from './websocket.service';
import { ConfigService } from './config.service';
import { ConsentPdfService, PdfGenerationData } from './consent-pdf.service';
import { LoggingService } from './logging.service';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError, switchMap, first, map } from 'rxjs/operators';

export type PdfLayoutType = 'portrait' | 'wide';

export interface InitialData {
  playerData: PlayerData | null;
  newConsentId: string;
  consentDefinitions: ConsentDefinitionResponse;
  siteInfo: SiteResponse;
  siteLogoUrl: string | null;
  hasActiveContacts: boolean;
  identityDocumentString: string | null;
}

export interface SubmissionData {
  currentPlayerId: string;
  consentIdToDisplayAndSubmit: string;
  consentDefinitionIdToSubmit: number;
  optionalCheckbox: boolean;
  definitionUserIdApi: string | null;
  lastName: string;
  firstName: string;
  documentIdInfo: string;
  currentConsentDefinition: ConsentDefinitionResponse | null;
  casinoName: string;
  casinoLogoUrl: string | null;
  mandatoryCheckbox: boolean;
  signaturePadCanvas: ElementRef<HTMLCanvasElement>;
  logoLayoutType: PdfLayoutType;
}

@Injectable({
  providedIn: 'root',
})
export class ConsentOrchestrationService {
  constructor(
    private apiService: ApiService,
    private configService: ConfigService,
    private consentPdfService: ConsentPdfService,
    private webSocketService: AppWebSocketService,
    private router: Router,
    private loggingService: LoggingService
  ) {}

  public loadInitialData(
    playerId: string,
    siteId: number
  ): Observable<InitialData | null> {
    this.loggingService.log(LogLevel.INFO, 'Starting to load initial data.', {
      playerId,
      siteId,
    });
    return this.apiService.getSite(siteId).pipe(
      switchMap((siteInfo) => {
        const playerData$ = this.apiService.getPlayerData(playerId);
        const newConsentId$ = this.apiService.getNewConsentId();
        const consentDefinitions$ =
          this.apiService.getActiveConsentDefinition();
        const playerContacts$ = this.apiService
          .getPlayerContacts(playerId)
          .pipe(
            catchError((err) => {
              this.loggingService.log(
                LogLevel.ERROR,
                'Failed to load player contacts, defaulting to none.',
                err
              );
              return of(null);
            })
          );
        const playerDocuments$ = this.apiService
          .getPlayerDocuments(playerId)
          .pipe(
            catchError((err) => {
              this.loggingService.log(
                LogLevel.ERROR,
                'Failed to load player documents.',
                err
              );
              return of([]);
            })
          );

        return forkJoin({
          playerData: playerData$,
          newConsentId: newConsentId$,
          consentDefinitions: consentDefinitions$,
          playerContacts: playerContacts$,
          playerDocuments: playerDocuments$,
        }).pipe(
          switchMap(async (results) => {
            this.loggingService.log(
              LogLevel.DEBUG,
              'ForkJoin results received from API',
              results
            );
            const {
              playerData,
              newConsentId,
              consentDefinitions,
              playerContacts,
              playerDocuments,
            } = results;

            let hasActiveContacts = false;
            if (playerContacts) {
              const contacts: (ContactDetailRef | null | undefined)[] = [
                playerContacts.contactDetailEmail,
                playerContacts.contactDetailMobile,
                playerContacts.contactDetailPhone,
                playerContacts.contactDetailFax,
                playerContacts.contactDetailMailing,
              ];
              hasActiveContacts = contacts.some(
                (contact) => contact?.accept === true
              );
            }

            const now = new Date();
            const validDocument = playerDocuments.find(
              (doc) => doc.expiryDate && new Date(doc.expiryDate) > now
            );

            let identityDocumentString: string | null = null;
            if (validDocument) {
              const expiryDate = new Date(
                validDocument.expiryDate!
              ).toLocaleDateString('fr-FR');
              identityDocumentString = `${validDocument.documentType.label}, ${validDocument.documentNumber}, ${expiryDate}`;
            }

            return {
              playerData,
              newConsentId,
              consentDefinitions,
              siteInfo: siteInfo,
              siteLogoUrl: this.apiService.getSiteLogoUrl(siteId),
              hasActiveContacts: hasActiveContacts,
              identityDocumentString: identityDocumentString,
            };
          })
        );
      }),
      catchError((error) => {
        this.loggingService.log(
          LogLevel.ERROR,
          'Erreur lors du chargement des données initiales',
          error
        );
        this.handleCriticalError('Initial data loading failed');
        return of(null);
      })
    );
  }

  public async submitConsent(data: SubmissionData): Promise<boolean> {
    this.loggingService.log(
      LogLevel.INFO,
      'Submit button clicked, starting consent submission process.',
      { consentId: data.consentIdToDisplayAndSubmit }
    );

    try {
      const pdfData: PdfGenerationData = {
        lastName: data.lastName,
        firstName: data.firstName,
        documentIdInfo: data.documentIdInfo,
        consentDefinition: data.currentConsentDefinition,
        casinoName: data.casinoName,
        casinoLogoUrl: data.casinoLogoUrl,
        mandatoryCheckbox: data.mandatoryCheckbox,
        optionalCheckbox: data.optionalCheckbox,
        signaturePadCanvas: data.signaturePadCanvas,
        consentIdToDisplayAndSubmit: data.consentIdToDisplayAndSubmit,
        layoutType: data.logoLayoutType,
      };
      const pdfBase64 = await this.consentPdfService.generatePdfAsBase64(
        pdfData
      );

      const now = new Date();
      const endDate = new Date(now);
      if (data.currentConsentDefinition?.consentYearsDuration) {
        endDate.setFullYear(
          now.getFullYear() + data.currentConsentDefinition.consentYearsDuration
        );
      } else {
        endDate.setFullYear(now.getFullYear() + 1);
      }

      const locationType = this.configService.getLocTyp();
      const locationId = this.configService.getLocId();

      if (!locationType || !locationId) {
        this.loggingService.log(
          LogLevel.ERROR,
          'Location Type or Location ID is missing from config.'
        );
        throw new Error('Missing location configuration.');
      }

      const location: LocationRef = { type: locationType, id: locationId };

      const payload: PlayerConsentPOST = {
        id: data.consentIdToDisplayAndSubmit,
        consentDefinitionId: data.consentDefinitionIdToSubmit,
        commercialConsent: data.optionalCheckbox,
        startDate: now.toISOString(),
        endDate: endDate.toISOString(),
        pdf: 'base64_placeholder_for_log',
        userId:
          data.definitionUserIdApi ||
          this.configService.getToken() ||
          undefined,
        lastUpdatedTimestamp: now.toISOString(),
        location: location,
      };
      this.loggingService.log(
        LogLevel.DEBUG,
        'Submitting player consent payload.',
        payload
      );

      payload.pdf = pdfBase64;

      await firstValueFrom(
        this.apiService.submitPlayerConsent(data.currentPlayerId, payload)
      );

      this.loggingService.log(
        LogLevel.INFO,
        'Consent submitted successfully to API.'
      );
      const wsMessage: WebSocketMessage = {
        Action: 'Consent',
        PlayerId: data.currentPlayerId,
        Status: true,
      };
      this.webSocketService.sendMessage(wsMessage);

      return true;
    } catch (error) {
      this.loggingService.log(
        LogLevel.ERROR,
        'Consent submission failed.',
        error
      );
      return false;
    }
  }

  public handleCriticalError(reason?: string, playerId?: string | null): void {
    const errorResponse: WebSocketMessage = {
      Action: 'Consent',
      PlayerId: playerId || undefined,
      Status: false,
      Message: reason,
    };
    this.webSocketService.sendMessage(errorResponse);
    this.router.navigate(['/logo'], { skipLocationChange: true });
  }
}

function firstValueFrom<T>(source: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    source.pipe(first()).subscribe({
      next: (value) => resolve(value),
      error: (err) => reject(err),
    });
  });
}
