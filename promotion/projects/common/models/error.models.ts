export enum ErrorSource {
  JOA_API = 'JOA_API',
  MBOX_SDK = 'MBOX_SDK',
  APPLICATION = 'APPLICATION',
  NETWORK = 'NETWORK',
}

export interface StandardizedError {
  source: ErrorSource;
  code: string;
  message: string;
  requirePinClear?: boolean;
  originalError?: any;
  context?: {
    component?: string;
    action?: string;
    additionalData?: any;
  };
}
