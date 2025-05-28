import { HttpClient } from '@angular/common/http';
import { compileDeclareNgModuleFromMetadata } from '@angular/compiler';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

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
  constructor(private http: HttpClient) {}

  getPlayerData(playerId: string): Observable<PlayerData> {
    const apiUrl = `http://localhost:3000/player/${playerId}`;
    return this.http.get<PlayerData>(apiUrl);
  }
}
