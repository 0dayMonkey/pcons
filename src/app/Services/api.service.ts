import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
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

export interface NewConsentIdResponse {
  id: string;
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

  getPlayerData(playerId: string): Observable<any> {
    const errorCheck = this.checkApiUrl();
    if (errorCheck) return errorCheck;

    const url = `${this.apiUrl}player/${playerId}`;
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }

  getConsentDefinitions(
    searchModel: SearchModel
  ): Observable<ConsentDefinitionResponse[]> {
    const errorCheck = this.checkApiUrl();
    if (errorCheck) return errorCheck;

    const url = `${this.apiUrl}api/web/v1/consent-definitions`;

    let params = new HttpParams();
    if (searchModel.first !== undefined) {
      params = params.set('First', searchModel.first.toString());
    }
    if (searchModel.rows !== undefined) {
      params = params.set('Rows', searchModel.rows.toString());
    }
    if (searchModel.filters) {
      params = params.set('Filters', JSON.stringify(searchModel.filters));
    }

    return this.http
      .get<ConsentDefinitionResponse[]>(url, {
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
        })
      );
  }

  getNewConsentId(): Observable<NewConsentIdResponse> {
    const errorCheck = this.checkApiUrl();
    if (errorCheck) return errorCheck;

    const url = `${this.apiUrl}api/web/v1/consents/new-id`;
    return this.http.get<NewConsentIdResponse>(url, {
      headers: this.getHeaders(),
    });
  }

  submitPlayerConsent(
    playerId: string,
    consentData: PlayerConsentPOST
  ): Observable<any> {
    const errorCheck = this.checkApiUrl();
    if (errorCheck) return errorCheck;

    const url = `${this.apiUrl}api/web/v1/players/${playerId}/consents`;
    return this.http.post(url, consentData, { headers: this.getHeaders() });
  }
}
