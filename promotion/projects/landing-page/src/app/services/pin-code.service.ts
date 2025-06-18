import { Injectable } from '@angular/core';
import { ConfigService } from 'projects/common/services/config.service';

@Injectable()
export class PinCodeService {
  constructor(private config: ConfigService) {}

  formatVoucherCode(input: string): string {
    let code = input.replace(/-/g, '').toUpperCase();

    if (code.length > 2 && code.length <= 6) {
      code = code.substring(0, 2) + '-' + code.substring(2);
    } else if (code.length > 6 && code.length <= 10) {
      code =
        code.substring(0, 2) +
        '-' +
        code.substring(2, 6) +
        '-' +
        code.substring(6);
    } else if (code.length > 10 && code.length <= 14) {
      code =
        code.substring(0, 2) +
        '-' +
        code.substring(2, 6) +
        '-' +
        code.substring(6, 10) +
        '-' +
        code.substring(10);
    } else if (code.length > 14) {
      code =
        code.substring(0, 2) +
        '-' +
        code.substring(2, 6) +
        '-' +
        code.substring(6, 10) +
        '-' +
        code.substring(10, 14) +
        '-' +
        code.substring(14, 18);
      if (code.length > 22) {
        code = code.substring(0, 22);
      }
    }

    return code;
  }

  isValidCode(code: string): boolean {
    return this.config.validCodePattern.test(code);
  }
}
