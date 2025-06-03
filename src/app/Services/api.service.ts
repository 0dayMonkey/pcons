import { HttpClient } from '@angular/common/http';
import { compileDeclareNgModuleFromMetadata } from '@angular/compiler';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ConfigService } from './config.service';

export interface PlayerData {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  photoUrl: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  constructor(private file: ConfigService, private http: HttpClient) {}

  getPlayerData(playerId: string): Observable<PlayerData> {
    const apiUrl = this.file.config + '/player/${playerId}';
    return this.http.get<PlayerData>(apiUrl);
  }
}
