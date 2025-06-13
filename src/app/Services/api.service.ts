import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ConfigService } from './config.service';

export enum ConsentDefinitionStatusResponse {
  Draft = 0,
  Active = 1,
  Archived = 2,
}

export enum FilterMatchMode {
  StartsWith = 'startsWith',
  Contains = 'contains',
  NotContains = 'notContains',
  EndsWith = 'endsWith',
  Equals = 'equals',
  NotEquals = 'notEquals',
  In = 'in',
  NotIn = 'notIn',
  LessThan = 'lt',
  LessThanOrEqual = 'lte',
  GreaterThan = 'gt',
  GreaterThanOrEqual = 'gte',
  Between = 'between',
  Is = 'is',
  IsNot = 'isNot',
  Before = 'before',
  After = 'after',
  DateIs = 'dateIs',
  DateIsNot = 'dateIsNot',
  DateBefore = 'dateBefore',
  DateAfter = 'dateAfter',
}

export interface FilterDetail {
  value: any;
  matchMode: FilterMatchMode;
  valueTo?: any;
}

export interface FilterModel {
  field: string;
  operator?: 'and' | 'or';
  constraints?: FilterDetail[];
  details?: FilterDetail[];
}

export interface SearchModel {
  first?: number;
  rows?: number;
  sortField?: string;
  sortOrder?: number;
  filters?: FilterModel[];
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  totalItems: number;
  items: ConsentDefinitionResponse[];
}

export interface ConsentDefinitionResponse {
  id: number;
  name?: string;
  text: string;
  version?: number;
  start?: string;
  end?: string;
  dataRetentionYearsDuration: number;
  consentYearsDuration: number;
  status: ConsentDefinitionStatusResponse;
  lastUpdatedTimestamp?: string;
  userId?: string;
}

export interface LocationRef {
  type: string;
  id: string;
}

export interface PlayerConsentPOST {
  id?: string;
  consentDefinitionId: number;
  commercialConsent: boolean;
  startDate: string;
  endDate: string;
  pdf: string;
  userId?: string;
  lastUpdatedTimestamp?: string;
  location: LocationRef;
}

export interface PlayerData {
  firstName?: string;
  lastName?: string;
}

export interface SiteResponse {
  companyId: string;
  siteCode: string;
  id: number;
  longLabel: string;
  shortLabel: string;
  direction: string;
  languageId: string;
  minimumAge: number;
  lastUpdatedTimestamp?: Date;
  cashlessMode: any;
  masterSiteId?: number;
  isOverMinimumAge: boolean;
  userId?: string;
}

export interface SiteLogoResponse {
  logoBase64: string;
}

export interface ContactDetailRef {
  value: string;
  accept: boolean;
}

export interface CustomerContactResponse {
  contactDetailEmail?: ContactDetailRef | null;
  contactDetailPhone?: ContactDetailRef | null;
  contactDetailMobile?: ContactDetailRef | null;
  contactDetailFax?: ContactDetailRef | null;
  contactDetailMailing?: ContactDetailRef | null;
  preferredContactMean?: any | null;
  badOrMissingAddress?: boolean | null;
  mailsCollectedAtCasino?: boolean | null;
}

export interface IdDocTypeRef {
  id: string;
  label: string;
}

export interface CountryRef {
  id: string;
  label: string;
}

export interface CityRef {
  id: string;
  label: string;
}

export interface PlayerDocumentResponse {
  id: string;
  documentNumber: string;
  documentType: IdDocTypeRef;
  issuingCountry: CountryRef;
  issuingCity: CityRef;
  issueDate?: string | null;
  expiryDate?: string | null;
  lastUpdatedTimestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl: string = '';
  private apiConfigLoaded: boolean = false;
  private apiConfigError: boolean = false;

  constructor(private configService: ConfigService, private http: HttpClient) {
    this.configService.getConfig().subscribe({
      next: (config) => {
        if (config && config.apiUrl) {
          this.apiUrl = config.apiUrl;
          if (!this.apiUrl.endsWith('/')) {
            this.apiUrl += '/';
          }
          this.apiConfigLoaded = true;
        } else {
          console.error("URL de l'API non configurée dans config.json");
          this.apiConfigError = true;
          this.apiConfigLoaded = true;
        }
      },
      error: (err) => {
        console.error(
          "Erreur lors du chargement de la configuration de l'API",
          err
        );
        this.apiConfigError = true;
        this.apiConfigLoaded = true;
      },
    });
  }

  private checkApiUrl(): Observable<never> | null {
    if (!this.apiConfigLoaded) {
      return throwError(
        () => new Error('La configuration de l_API n_est pas encore chargée.')
      );
    }
    if (this.apiConfigError || !this.apiUrl) {
      return throwError(
        () =>
          new Error("URL de l'API non disponible ou erreur de configuration.")
      );
    }
    return null;
  }

  private getHeaders(isJsonContent: boolean = true): HttpHeaders {
    let headers = new HttpHeaders();
    if (isJsonContent) {
      headers = headers.set('Content-Type', 'application/json');
    }
    const token = this.configService.getToken();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  getPlayerData(playerId: string): Observable<PlayerData> {
    const errorCheck = this.checkApiUrl();
    if (errorCheck) return errorCheck;

    const url = `${this.apiUrl}api/web/v1/players/${playerId}`;
    return this.http.get<PlayerData>(url, { headers: this.getHeaders() });
  }

  getPlayerContacts(
    playerId: string
  ): Observable<CustomerContactResponse | null> {
    const errorCheck = this.checkApiUrl();
    if (errorCheck) return errorCheck;

    const url = `${this.apiUrl}api/web/v1/players/${playerId}/contacts`;
    return this.http.get<CustomerContactResponse>(url, {
      headers: this.getHeaders(),
    });
  }

  getPlayerDocuments(playerId: string): Observable<PlayerDocumentResponse[]> {
    const errorCheck = this.checkApiUrl();
    if (errorCheck) return errorCheck;

    const url = `${this.apiUrl}api/web/v1/players/${playerId}/id-documents`;
    return this.http.get<PlayerDocumentResponse[]>(url, {
      headers: this.getHeaders(),
    });
  }

  getActiveConsentDefinition(): Observable<ConsentDefinitionResponse> {
    const searchModelForActiveConsent: SearchModel = {
      first: 0,
      rows: 1,
      filters: [
        {
          field: 'status',
          details: [{ value: 'Active', matchMode: FilterMatchMode.In }],
        },
      ],
    };

    const errorCheck = this.checkApiUrl();
    if (errorCheck) return errorCheck;

    const url = `${this.apiUrl}api/web/v1/consent-definitions`;

    let params = new HttpParams();
    params = params.set(
      'searchJson',
      JSON.stringify(searchModelForActiveConsent)
    );

    return this.http
      .get<SearchResult>(url, {
        headers: this.getHeaders(false),
        params: params,
      })
      .pipe(
        catchError((err) => {
          console.error(
            'Erreur lors de la récupération des définitions de consentement',
            err
          );
          return throwError(() => err);
        }),
        map((x) => x.items[0])
      );
  }

  getNewConsentId(): Observable<string> {
    const errorCheck = this.checkApiUrl();
    if (errorCheck) return errorCheck;

    const url = `${this.apiUrl}api/web/v1/consents/new-id`;
    return this.http.request('POST', url, {
      headers: this.getHeaders(false),
      responseType: 'text',
    });
  }

  submitPlayerConsent(
    playerId: string,
    consentData: PlayerConsentPOST
  ): Observable<any> {
    const errorCheck = this.checkApiUrl();
    if (errorCheck) return errorCheck;

    const url = `${this.apiUrl}api/web/v1/players/${playerId}/consents`;
    let headers = this.getHeaders();
    headers = headers.append('Site-Origin-ID', this.configService.getSiteId());
    return this.http.post(url, consentData, { headers: headers });
  }

  getSite(siteId: number): Observable<SiteResponse> {
    const errorCheck = this.checkApiUrl();
    if (errorCheck) return errorCheck;
    const url = `${this.apiUrl}api/web/setup/v1/sites/${siteId}`;
    return this.http.get<SiteResponse>(url, { headers: this.getHeaders() });
  }

  getSiteLogoUrl(siteId: number): string {
    if (this.apiConfigError || !this.apiUrl) {
      return '';
    }
    return `${this.apiUrl}api/web/setup/v1/sites/${siteId}/logo`;
  }
}
