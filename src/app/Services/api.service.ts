import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ConfigService, IAppConfig } from './config.service';

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
  valueTo?: any; // Pour les modes comme 'between'
}

export interface FilterModel {
  field: string;
  operator?: 'and' | 'or'; // Si les détails doivent être combinés avec AND ou OR
  constraints?: FilterDetail[]; // Renommé de Details à constraints pour coller à certains patterns PrimeNG/etc. ou garder Details
  details?: FilterDetail[]; // Gardé pour correspondre à l'exemple C#
}

export interface SearchModel {
  first?: number; // Equivalent de 'offset' ou 'skip'
  rows?: number; // Equivalent de 'limit' ou 'pageSize'
  sortField?: string;
  sortOrder?: number; // 1 pour asc, -1 pour desc
  filters?: FilterModel[]; // Utilisation de la structure de filtre imbriquée
  // Les champs page/pageSize peuvent être redondants si first/rows sont utilisés
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
  status: ConsentDefinitionStatusResponse; // Assurez-vous que l'enum est bien mappé ou utilisez string/number
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
  pdf: string; // PDF en base64
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

  constructor(private configService: ConfigService, private http: HttpClient) {
    this.configService.getConfig().subscribe((config) => {
      if (config && config.apiUrl) {
        this.apiUrl = config.apiUrl;
        if (!this.apiUrl.endsWith('/')) {
          this.apiUrl += '/';
        }
      } else {
        console.error("URL de l'API non configurée dans config.json");
        this.apiUrl = 'http://localhost:3000/'; // Fallback
      }
    });
  }

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });
    const token = this.configService.getToken();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  getPlayerData(playerId: string): Observable<any> {
    if (!this.apiUrl) {
      console.error('API URL non disponible pour getPlayerData');
      return of(null); // Gérer l'erreur comme il se doit
    }
    const url = `${this.apiUrl}player/${playerId}`;
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }

  getConsentDefinitions(
    searchModel: SearchModel
  ): Observable<ConsentDefinitionResponse[]> {
    if (!this.apiUrl) {
      console.error('API URL non disponible pour getConsentDefinitions');
      return of([]);
    }
    const url = `${this.apiUrl}api/web/v1/consent-definitions`;
    return this.http
      .post<ConsentDefinitionResponse[]>(url, searchModel, {
        headers: this.getHeaders(),
      })
      .pipe(
        catchError((err) => {
          console.error(
            'Erreur lors de la récupération des définitions de consentement',
            err
          );
          return of([]);
        })
      );
  }

  getNewConsentId(): Observable<NewConsentIdResponse> {
    if (!this.apiUrl) {
      console.error('API URL non disponible pour getNewConsentId');
      return of({ id: '' });
    }
    const url = `${this.apiUrl}api/web/v1/consents/new-id`;
    return this.http.get<NewConsentIdResponse>(url, {
      headers: this.getHeaders(),
    });
  }

  submitPlayerConsent(
    playerId: string,
    consentData: PlayerConsentPOST
  ): Observable<any> {
    if (!this.apiUrl) {
      console.error('API URL non disponible pour submitPlayerConsent');
      return of(null);
    }
    const url = `${this.apiUrl}api/web/v1/players/${playerId}/consents`;
    return this.http.post(url, consentData, { headers: this.getHeaders() });
  }
}
