// src/app/Models/site.model.ts

export interface SiteResponse {
  companyId: string;
  establishmentId: string;
  casinoId: number;
  establishmentName: string;
  shortLabel: string;
  direction: string;
  languageId: string;
  minimumAge: number;
  lastUpdatedTimestamp?: Date;
  cashlessMode: any; // Remplacez 'any' par le type enum si vous l'avez
  masterCasino?: number;
  isOverMinimumAge: boolean;
  userId?: string;
}

export interface SiteLogoResponse {
  // Ajustez cette interface en fonction de la réponse réelle de l'API.
  // Supposons qu'elle renvoie le logo en base64.
  logoBase64: string;
}
