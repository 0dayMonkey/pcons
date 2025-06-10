import { Injectable, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import {
  ApiService,
  ConsentDefinitionResponse,
  LocationRef,
  PlayerConsentPOST,
  PlayerData,
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

export interface InitialData {
  playerData: PlayerData | null;
  newConsentId: string;
  consentDefinitions: ConsentDefinitionResponse;
}

export interface SubmissionData {
  currentPlayerId: string;
  consentIdToDisplayAndSubmit: string;
  consentDefinitionIdToSubmit: number;
  optionalCheckbox: boolean;
  definitionUserIdApi: string | null;
  lastName: string;
  firstName: string;
  cardIdNumber: string;
  currentConsentDefinition: ConsentDefinitionResponse | null;
  casinoName: string;
  casinoLogoUrl: string | null;
  mandatoryCheckbox: boolean;
  signaturePadCanvas: ElementRef<HTMLCanvasElement>;
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

  public loadInitialData(playerId: string): Observable<InitialData | null> {
    this.loggingService.log(LogLevel.INFO, 'Starting to load initial data.');
    return this.configService.getConfig().pipe(
      first(),
      switchMap(() => {
        return forkJoin({
          playerData: this.apiService.getPlayerData(playerId),
          newConsentId: this.apiService.getNewConsentId(),
          consentDefinitions: this.apiService.getActiveConsentDefinition(),
        });
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

  public loadPlayerPicture(playerId: string): Observable<string | null> {
    return this.apiService.getPlayerPicture(playerId).pipe(
      map((imageBlob: Blob) => {
        if (imageBlob && imageBlob.size > 0) {
          return URL.createObjectURL(imageBlob);
        }
        return null;
      }),
      catchError((err) => {
        this.loggingService.log(
          LogLevel.ERROR,
          'Failed to load player picture',
          err
        );
        return of(null);
      })
    );
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

  public async submitConsent(data: SubmissionData): Promise<boolean> {
    this.loggingService.log(
      LogLevel.INFO,
      'Submit button clicked, starting consent submission process.'
    );

    try {
      const pdfData: PdfGenerationData = {
        lastName: data.lastName,
        firstName: data.firstName,
        cardIdNumber: data.cardIdNumber,
        consentDefinition: data.currentConsentDefinition,
        casinoName: data.casinoName,
        casinoLogoUrl: data.casinoLogoUrl,
        mandatoryCheckbox: data.mandatoryCheckbox,
        optionalCheckbox: data.optionalCheckbox,
        signaturePadCanvas: data.signaturePadCanvas,
        consentIdToDisplayAndSubmit: data.consentIdToDisplayAndSubmit,
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
          'Location Type ou Location ID manquant.'
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
        pdf: pdfBase64,
        userId:
          data.definitionUserIdApi ||
          this.configService.getToken() ||
          undefined,
        lastUpdatedTimestamp: now.toISOString(),
        location: location,
      };

      this.loggingService.log(
        LogLevel.DEBUG,
        'Submitting player consent payload.'
      );
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
}

function firstValueFrom<T>(source: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    source.pipe(first()).subscribe({
      next: (value) => resolve(value),
      error: (err) => reject(err),
    });
  });
}
