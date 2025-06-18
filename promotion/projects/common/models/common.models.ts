export interface MboxData {
  ownerId: string;
  twoLetterISOLanguageName: string;
  casinoCurrencySymbol: string;
  egmCode: string;
  casinoId: string;
}

export interface MboxInfo extends MboxData {
  messageType: 'mbox-data';
}

export interface Stim {
  identifiantStim: number;
  type: string;
  statut: string;
  sujet: string;
  commentaire: string;
  typePromo: string;
  valeurPromo: number;
  utilisation: {
    effectuees: number;
    maximum: number;
    restantes: number;
    utilisateur?: string;
    etablissementValidation?: string;
  };
}

export interface Promotion {
  id: number;
  code: string;
  title: string;
  reward_type: 'Point' | 'Montant';
  reward_value: number;
  promo_type: string;
  utilisation?: {
    effectuees: number;
    maximum: number;
    restantes: number;
  };
}

export interface PlayerStatus {
  isCustomer: boolean;
  message: string;
}

export interface PromoResponse {
  data: Promotion[];
  message: string;
}

export interface WidgetMessage {
  messageType: string;
  data: any;
}
