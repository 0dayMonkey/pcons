import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';

export interface PlayerData {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  photoUrl: string;
}

const API_BASE_URL = 'http://localhost:3000';

@Injectable({
  providedIn: 'root',
})
export class PlayerDataService {
  constructor(private http: HttpClient, private translate: TranslateService) {}

  fetchPlayerData(playerId: string): Observable<PlayerData | null> {
    const apiUrl = `${API_BASE_URL}/player/${playerId}`;
    return this.http.get<PlayerData>(apiUrl).pipe(
      catchError(() => {
        return of(null);
      })
    );
  }

  getFallbackPlayerData(playerId: string | null): PlayerData {
    return {
      id: playerId || this.translate.instant('generic.na'),
      firstName: this.translate.instant('generic.na'),
      lastName: this.translate.instant('generic.na'),
      birthDate: this.translate.instant('generic.na'),
      photoUrl: `https://placehold.co/100x100/FF8C00/FFFFFF?text=${this.translate.instant(
        'generic.apiError'
      )}`,
    };
  }

  getLoadingPlayerData(): PlayerData {
    return {
      id: this.translate.instant('generic.loading'),
      firstName: this.translate.instant('generic.loading'),
      lastName: this.translate.instant('generic.loading'),
      birthDate: this.translate.instant('generic.loading'),
      photoUrl: `https://placehold.co/100x100/E0E0E0/757575?text=${this.translate.instant(
        'generic.loading'
      )}`,
    };
  }
}
