import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ConfigService } from './config.service';
import { MboxData, MboxInfo } from '../models/common.models';
import { onMboxDataMessage, GetInitialMboxInfo } from 'mbox-opencontent-sdk';

@Injectable({
  providedIn: 'root',
})
export class MboxInfoService {
  public mboxDataObject: MboxData = {
    ownerId: '',
    twoLetterISOLanguageName: '',
    casinoCurrencySymbol: '',
    egmCode: '',
    casinoId: '',
  };

  private mboxDataSubject = new BehaviorSubject<MboxData>(this.mboxDataObject);
  public mboxData$: Observable<MboxData> = this.mboxDataSubject.asObservable();

  constructor(private config: ConfigService) {
    this.initializeMboxData();
  }

  private initializeMboxData(): void {
    const initialMboxInfo = GetInitialMboxInfo();

    if (initialMboxInfo) {
      this.setMboxData({
        ownerId: /*initialMboxInfo.ownerId || ''*/ '111111',
        twoLetterISOLanguageName:
          initialMboxInfo.twoLetterISOLanguageName ||
          this.config.defaultLanguage,
        casinoCurrencySymbol:
          initialMboxInfo.casinoCurrencySymbol ||
          this.config.defaultCurrencySymbol,
        egmCode: initialMboxInfo.egmCode || '',
        casinoId: initialMboxInfo.casinoId || '',
      });
    } else {
    }

    onMboxDataMessage((data: MboxData) => {
      this.updateMboxData(data);
    });
  }

  updateMboxData(data: Partial<MboxData>): void {
    this.mboxDataObject = {
      ...this.mboxDataObject,
      ...data,
    };
    this.mboxDataSubject.next(this.mboxDataObject);
  }

  setMboxData(data: MboxData): void {
    this.mboxDataObject = data;
    this.mboxDataSubject.next(this.mboxDataObject);
  }

  getPlayerId(): string {
    return this.mboxDataObject.ownerId;
  }

  getCasinoId(): string {
    return this.mboxDataObject.casinoId;
  }

  getEgmCode(): string {
    return this.mboxDataObject.egmCode;
  }

  getCurrencySymbol(): string {
    return (
      this.mboxDataObject.casinoCurrencySymbol ||
      this.config.defaultCurrencySymbol
    );
  }

  getLanguage(): string {
    return this.mboxDataObject.twoLetterISOLanguageName;
  }
}
