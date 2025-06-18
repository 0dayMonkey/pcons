import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Promotion,
  PlayerStatus,
  PromoResponse,
} from '../../../../common/models/common.models';
import { ApiService } from '../../../../common/services/api.service';

@Injectable()
export class PromoService {
  constructor(private apiService: ApiService) {}

  getPlayerPromos(): Observable<PromoResponse> {
    return this.apiService.getPlayerPromos();
  }

  checkPlayerStatus(): Observable<PlayerStatus> {
    return this.apiService.checkPlayerStatus();
  }

  usePromo(promoId: number): Observable<{
    message: string;
  }> {
    return this.apiService.usePromo(promoId);
  }

  validatePromoCode(code: string): Observable<{
    valid: boolean;
    message: string;
    promo?: Promotion;
  }> {
    return this.apiService.validatePromoCode(code);
  }
}
