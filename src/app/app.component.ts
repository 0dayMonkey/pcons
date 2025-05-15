import { Component, OnInit, OnDestroy, Renderer2, Inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  AppWebSocketService,
  WebSocketMessage,
} from './Services/websocket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'app';
  private listeners: Array<() => void> = [];
  private webSocketSubscription: Subscription | undefined;

  constructor(
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document,
    private router: Router,
    private webSocketService: AppWebSocketService
  ) {}

  ngOnInit(): void {
    this.webSocketService.connect();
    this.webSocketSubscription = this.webSocketService.messages$.subscribe(
      (message: WebSocketMessage) => {
        this.handleWebSocketMessage(message);
      }
    );

    this.listeners.push(
      this.renderer.listen('window', 'contextmenu', (e: Event) => {
        e.preventDefault();
      })
    );

    const touchStartListener = this.renderer.listen(
      this.document.body,
      'touchstart',
      (e: TouchEvent) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      }
    );
    this.listeners.push(touchStartListener);

    const touchMoveListener = this.renderer.listen(
      this.document.body,
      'touchmove',
      (e: TouchEvent) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      }
    );
    this.listeners.push(touchMoveListener);

    this.listeners.push(
      this.renderer.listen('document', 'fullscreenchange', () => {
        if (!this.document.fullscreenElement) {
          // this.requestFullScreen(); // Commentez ou adaptez si le plein écran constant n'est pas souhaité
        }
      })
    );
    // ... autres listeners pour fullscreen si nécessaire
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    if (message.Action === 'Consent' && message.PlayerId) {
      this.router.navigate(['/consent', message.PlayerId]);
    } else if (message.Action === 'Idle') {
      this.router.navigate(['/logo']);
    }
    // Gérez d'autres actions si nécessaire
  }

  requestFullScreen(): void {
    const elem = this.document.documentElement;
    if (elem.requestFullscreen) {
      elem
        .requestFullscreen()
        .catch((err) =>
          console.warn(`Fullscreen request failed: ${err.message}`)
        );
    } else if ((elem as any).mozRequestFullScreen) {
      (elem as any).mozRequestFullScreen();
    } else if ((elem as any).webkitRequestFullscreen) {
      (elem as any).webkitRequestFullscreen();
    } else if ((elem as any).msRequestFullscreen) {
      (elem as any).msRequestFullscreen();
    }
  }

  // @HostListener('document:keydown', ['$event']) // HostListener n'est pas directement utilisable dans les services ou en dehors des directives/composants de cette manière.
  // La gestion des keydown est déjà dans votre version originale, je la laisse ici pour référence si vous la réactivez.
  onKeydownHandler(event: KeyboardEvent) {
    if (event.key === 'F11') {
      event.preventDefault();
      event.stopPropagation();
      this.requestFullScreen();
    } else if (
      (event.ctrlKey &&
        event.shiftKey &&
        (event.key === 'I' ||
          event.key === 'i' ||
          event.key === 'J' ||
          event.key === 'j' ||
          event.key === 'C' ||
          event.key === 'c')) ||
      (event.ctrlKey && (event.key === 'U' || event.key === 'u')) ||
      event.key === 'Escape'
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  ngOnDestroy(): void {
    this.listeners.forEach((listener) => listener());
    if (this.webSocketSubscription) {
      this.webSocketSubscription.unsubscribe();
    }
    this.webSocketService.closeConnection();
  }
}
