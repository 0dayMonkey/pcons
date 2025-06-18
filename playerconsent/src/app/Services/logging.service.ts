import { Injectable } from '@angular/core';
import { ConfigService } from './config.service';
import { AppWebSocketService, LogLevel } from './websocket.service';

@Injectable({
  providedIn: 'root',
})
export class LoggingService {
  constructor(
    private configService: ConfigService,
    private webSocketService: AppWebSocketService
  ) {}

  public log(level: LogLevel, message: string, data?: any): void {
    if (this.configService.getLogLevel() >= level) {
      const levelName = LogLevel[level];
      let logString = `[LOG][${levelName}] ${message}`;

      if (data) {
        logString += ` - DETAILS: ${this.formatData(data)}`;
      }

      this.webSocketService.sendMessage(logString);
    }
  }

  private formatData(data: any): string {
    if (data instanceof Error) {
      return `Error: ${data.message}${
        data.stack ? ' | Stack: ' + data.stack : ''
      }`;
    }

    if (
      data &&
      typeof data === 'object' &&
      data.hasOwnProperty('status') &&
      data.hasOwnProperty('message')
    ) {
      return `HttpError: { status: ${data.status}, message: "${data.message}", name: "${data.name}" }`;
    }

    if (data instanceof Blob) {
      return `[Blob, size: ${data.size} bytes, type: ${data.type}]`;
    }

    if (typeof data === 'object' && data !== null) {
      try {
        return JSON.stringify(data);
      } catch (e) {
        return 'Unserializable Object';
      }
    }

    return String(data);
  }
}
