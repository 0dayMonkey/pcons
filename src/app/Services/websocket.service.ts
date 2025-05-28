import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

export interface WebSocketMessage {
  Action: string;
  PlayerId?: string;
  Status?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AppWebSocketService {
  private socket$: WebSocketSubject<WebSocketMessage> | undefined;
  public messages$ = new Subject<WebSocketMessage>();

  private currentWsUrl: string | undefined;

  constructor() {}

  public connect(wsUrl?: string): void {
    if (wsUrl) {
      this.currentWsUrl = wsUrl;
    }

    if (!this.currentWsUrl) {
      console.error('URL WebSocket non fournie. Impossible de se connecter.');
      return;
    }

    if (!this.socket$ || this.socket$.closed) {
      this.socket$ = webSocket<WebSocketMessage>(this.currentWsUrl);
      this.socket$.subscribe({
        next: (msg) => {
          console.log('Message received from WebSocket: ', msg);
          this.messages$.next(msg);
        },
        error: (err) => {
          console.error('WebSocket error: ', err);
          this.socket$ = undefined;
        },
        complete: () => {
          console.log('WebSocket connection closed');
          this.socket$ = undefined;
        },
      });
      console.log(
        `Attempting to connect to WebSocket at: ${this.currentWsUrl}`
      );
    }
  }

  public sendMessage(msg: WebSocketMessage): void {
    if (this.socket$ && !this.socket$.closed) {
      console.log('Sending message via WebSocket: ', msg);
      this.socket$.next(msg);
    } else {
      console.error('WebSocket is not connected. Cannot send message.');
    }
  }

  public closeConnection(): void {
    if (this.socket$) {
      this.socket$.complete();
      this.socket$ = undefined;
      console.log('WebSocket connection explicitly closed.');
    }
  }
}
