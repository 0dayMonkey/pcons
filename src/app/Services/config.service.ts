import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private wsPortInternal: string | null = null;
  private tokenInternal: string | null = null;
  private langInternal: string | null = null;

  constructor() {}

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
}
