import { Component, OnInit, OnDestroy, Renderer2, Inject } from '@angular/core';
import {
  Router,
  RouterOutlet,
  ActivatedRoute,
  NavigationEnd,
  QueryParamsHandling,
} from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { Subscription } from 'rxjs';
import { filter, distinctUntilChanged, map } from 'rxjs/operators';
import {
  AppWebSocketService,
  WebSocketMessage,
} from './Services/websocket.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TranslateModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'app';
  private listeners: Array<() => void> = [];
  private webSocketSubscription: Subscription | undefined;
  private queryParamSubscription: Subscription | undefined;
  private routerEventsSubscription: Subscription | undefined;
  private langParamSubscription: Subscription | undefined;

  constructor(
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private webSocketService: AppWebSocketService,
    private translate: TranslateService
  ) {
    translate.setDefaultLang('fr');
  }

  ngOnInit(): void {
    this.langParamSubscription = this.activatedRoute.queryParamMap
      .pipe(
        map((params) => params.get('lang')),
        distinctUntilChanged()
      )
      .subscribe((lang) => {
        const languageToUse = lang || this.translate.getDefaultLang();
        this.translate.use(languageToUse);
      });

    this.routerEventsSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          if (
            event.urlAfterRedirects === '/' ||
            event.urlAfterRedirects.startsWith('/?')
          ) {
            this.router.navigate(['/logo'], {
              queryParamsHandling: 'preserve',
              skipLocationChange: true,
            });
          }
        }
      });

    this.queryParamSubscription = this.activatedRoute.queryParamMap.subscribe(
      (params) => {
        const wsPort = params.get('wsPort');
        if (wsPort) {
          const wsUrl = `ws://localhost:${wsPort}`;
          this.webSocketService.connect(wsUrl);
        } else {
          console.warn(
            "Le paramètre wsPort est manquant dans l'URL actuelle. La connexion WebSocket pourrait ne pas être initiée si elle n'a pas déjà été établie."
          );
        }
      }
    );

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
        }
      })
    );
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    if (message.Action === 'Consent' && message.PlayerId) {
      this.router.navigate(['/consent', message.PlayerId], {
        queryParamsHandling: 'preserve',
        skipLocationChange: true,
      });
    } else if (message.Action === 'Idle') {
      this.router.navigate(['/logo'], {
        queryParamsHandling: 'preserve',
        skipLocationChange: true,
      });
    }
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
    if (this.queryParamSubscription) {
      this.queryParamSubscription.unsubscribe();
    }
    if (this.routerEventsSubscription) {
      this.routerEventsSubscription.unsubscribe();
    }
    if (this.langParamSubscription) {
      this.langParamSubscription.unsubscribe();
    }
    this.webSocketService.closeConnection();
  }
}
