import { ApplicationInitStatus, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  config: IAppConfig | undefined;
  private wsPortInternal: string = '';
  private tokenInternal: string = '';
  private langInternal: string = '';
  private siteIdInternal: string = '';
  private locTypInternal: string = '';
  private locIdInternal: string = '';
  private logLevelInternal: number = 0;

  constructor(private http: HttpClient) {}

  public getConfig(): Observable<IAppConfig> {
    if (this.config) {
      return of(this.config);
    }
    const jsonFile = './assets/config.json';
    return this.http.get<IAppConfig>(jsonFile).pipe(
      tap((data) => {
        if (data.apiUrl && !data.apiUrl.endsWith('/')) {
          data.apiUrl += '/';
        }
        this.config = data;
        this.logLevelInternal = data.wslog || 0;
      })
    );
  }

  setWsPort(port: string): void {
    this.wsPortInternal = port;
  }

  getWsPort(): string {
    return this.wsPortInternal;
  }

  setToken(token: string): void {
    this.tokenInternal = token;
  }

  getToken(): string {
    return this.tokenInternal;
  }

  setLang(lang: string): void {
    this.langInternal = lang;
  }

  getLang(): string {
    return this.langInternal;
  }

  setSiteId(siteId: string): void {
    this.siteIdInternal = siteId;
  }

  setLocTyp(locTyp: string): void {
    this.locTypInternal = locTyp;
  }

  setLocId(locId: string): void {
    this.locIdInternal = locId;
  }

  getSiteId(): string {
    return this.siteIdInternal;
  }

  getLocTyp(): string {
    return this.locTypInternal;
  }

  getLocId(): string {
    return this.locIdInternal;
  }

  getLogLevel(): number {
    return this.logLevelInternal;
  }
}

export interface IAppConfig {
  apiUrl: string;
  wslog: number;
}
