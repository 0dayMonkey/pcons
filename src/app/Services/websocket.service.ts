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
  private messagesSubject = new Subject<WebSocketMessage>();
  public messages$: Observable<WebSocketMessage> =
    this.messagesSubject.asObservable();

  private readonly WS_URL = 'ws://localhost:8080';
  constructor() {}

  public connect(): void {
    if (!this.socket$ || this.socket$.closed) {
      this.socket$ = webSocket<WebSocketMessage>(this.WS_URL);
      this.socket$.subscribe({
        next: (msg) => {
          console.log('Message received from WebSocket: ', msg);
          this.messagesSubject.next(msg);
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
    }
  }

  public sendMessage(msg: WebSocketMessage): void {
    if (this.socket$) {
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
    }
  }
}
