import { ApplicationInitStatus, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  config: IAppConfig | undefined;
  private wsPortInternal: string | null = null;
  private tokenInternal: string | null = null;
  private langInternal: string | null = null;
  private siteIdInternal: string | null = null;
  private locTypInternal: string | null = null;
  private locIdInternal: string | null = null;

  constructor(private http: HttpClient) {}

  public getConfig(): Observable<IAppConfig> {
    if (this.config) {
      return of(this.config);
    }
    const jsonFile = '../assets/config.json';
    return this.http.get<IAppConfig>(jsonFile).pipe(
      tap((data) => {
        if (data.apiUrl && !data.apiUrl.endsWith('/')) {
          data.apiUrl += '/';
        }
        this.config = data;
      })
    );
  }

  setWsPort(port: string | null): void {
    this.wsPortInternal = port;
  }

  getWsPort(): string | null {
    return this.wsPortInternal;
  }

  setToken(token: string | null): void {
    this.tokenInternal = token;
  }

  getToken(): string | null {
    return this.tokenInternal;
  }

  setLang(lang: string | null): void {
    this.langInternal = lang;
  }

  getLang(): string | null {
    return this.langInternal;
  }

  setSiteId(siteId: string | null): void {
    this.siteIdInternal = siteId;
  }

  setLocTyp(locTyp: string | null): void {
    this.locTypInternal = locTyp;
  }

  setLocId(locId: string | null): void {
    this.locIdInternal = locId;
  }

  getSiteId(): string | null {
    return this.siteIdInternal;
  }

  getLocTyp(): string | null {
    return this.locTypInternal;
  }

  getLocId(): string | null {
    return this.locIdInternal;
  }
}

export interface IAppConfig {
  apiUrl: string;
}
