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

  public log(level: LogLevel, message: string, error?: any): void {
    if (this.configService.getLogLevel() >= level) {
      const levelName = LogLevel[level];
      let logString = `[LOG][${levelName}] ${message}`;

      if (error) {
        const errorCode = error.name || 'UNKNOWN_ERROR';
        const errorMessage = error.message || 'No error message available.';
        const stack = error.stack ? `\n-- Stack Trace --\n${error.stack}` : '';
        logString += `\n> Code: ${errorCode}\n> Message: ${errorMessage}${stack}`;
      }
      this.webSocketService.sendMessage(logString);
    }
  }
}
