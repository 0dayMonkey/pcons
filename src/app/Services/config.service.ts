import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, firstValueFrom } from 'rxjs';

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

  public loadConfig(): Promise<IAppConfig> {
    const jsonFile = './assets/config.json';
    return firstValueFrom(
      this.http.get<IAppConfig>(jsonFile).pipe(
        tap((data) => {
          if (data.apiUrl && !data.apiUrl.endsWith('/')) {
            data.apiUrl += '/';
          }
          this.config = data;
          this.logLevelInternal = data.wslog || 0;
        })
      )
    );
  }

  public getConfig(): Observable<IAppConfig> {
    return of(this.config!);
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

  getSiteId(): string {
    return this.siteIdInternal;
  }

  setLocTyp(locTyp: string): void {
    this.locTypInternal = locTyp;
  }

  getLocTyp(): string {
    return this.locTypInternal;
  }

  setLocId(locId: string): void {
    this.locIdInternal = locId;
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
