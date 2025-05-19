import { Component, OnInit, OnDestroy, Renderer2, Inject } from '@angular/core';
import {
  Router,
  RouterOutlet,
  ActivatedRoute,
  NavigationEnd,
  UrlTree,
} from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { Subscription, ReplaySubject, timer } from 'rxjs';
import { filter, takeUntil, tap } from 'rxjs/operators';
import {
  AppWebSocketService,
  WebSocketMessage,
} from './Services/websocket.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfigService } from './Services/config.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TranslateModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'app';
  private listeners: Array<() => void> = [];
  private destroy$ = new ReplaySubject<void>(1);
  private initialLaunchParamsProcessed = false;

  constructor(
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private webSocketService: AppWebSocketService,
    private translate: TranslateService,
    private configService: ConfigService
  ) {
    translate.setDefaultLang('fr');
  }

  ngOnInit(): void {
    this.processLaunchUrlParameters();
    this.setupUrlCleaningOnNavigation();
    this.handleWebSocketMessages();
    this.setupDOMListeners();
  }

  private processLaunchUrlParameters(): void {
    this.activatedRoute.queryParamMap
      .pipe(
        tap((params) => {
          if (this.initialLaunchParamsProcessed) {
            return;
          }

          const wsPort = params.get('wsPort');

          if (wsPort !== null) {
            const token = params.get('token');
            const lang = params.get('lang');

            this.configService.setWsPort(wsPort);
            this.configService.setToken(token);
            this.configService.setLang(lang);

            const languageToUse =
              this.configService.getLang() || this.translate.getDefaultLang();
            this.translate.use(languageToUse);

            if (this.configService.getWsPort()) {
              const wsUrl = `ws://localhost:${this.configService.getWsPort()}`;
              this.webSocketService.connect(wsUrl);
            } else {
              console.warn(
                "WARN: 'wsPort' a été détecté mais n'a pas pu être configuré. La connexion WebSocket pourrait échouer."
              );
            }
            this.initialLaunchParamsProcessed = true;
          }
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();

    timer(5000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.initialLaunchParamsProcessed) {
          console.warn(
            "WARN: Aucun paramètre 'wsPort' détecté dans l'URL après 5 secondes. Assurez-vous que l'URL de lancement contient les paramètres attendus. La connexion WebSocket ne sera pas initiée."
          );
        }
      });
  }

  private setupUrlCleaningOnNavigation(): void {
    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd
        ),
        tap((event: NavigationEnd) => {
          if (this.initialLaunchParamsProcessed) {
            this.cleanUrlParamsFromNavigation(event);
          }
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  private cleanUrlParamsFromNavigation(navigationEvent: NavigationEnd): void {
    const urlTree: UrlTree = this.router.parseUrl(
      navigationEvent.urlAfterRedirects
    );
    const queryParams = { ...urlTree.queryParams };

    let paramsModified = false;
    if (queryParams['wsPort'] !== undefined) {
      delete queryParams['wsPort'];
      paramsModified = true;
    }
    if (queryParams['token'] !== undefined) {
      delete queryParams['token'];
      paramsModified = true;
    }
    if (queryParams['lang'] !== undefined) {
      delete queryParams['lang'];
      paramsModified = true;
    }

    if (paramsModified) {
      const pathOnly = navigationEvent.urlAfterRedirects.split('?')[0];
      this.router.navigate([pathOnly || '/'], {
        queryParams: queryParams,
        replaceUrl: true,
        skipLocationChange: true,
      });
    } else if (
      (navigationEvent.urlAfterRedirects === '/' ||
        navigationEvent.urlAfterRedirects === '/#') &&
      !paramsModified
    ) {
      this.router.navigate(['/logo'], {
        replaceUrl: true,
        skipLocationChange: true,
      });
    }
  }

  private handleWebSocketMessages(): void {
    this.webSocketService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe((message: WebSocketMessage) => {
        const cleanQueryParams = {};

        if (message.Action === 'Consent' && message.PlayerId) {
          this.router.navigate(['/consent', message.PlayerId], {
            queryParams: cleanQueryParams,
            skipLocationChange: true,
          });
        } else if (message.Action === 'Idle') {
          this.router.navigate(['/logo'], {
            queryParams: cleanQueryParams,
            skipLocationChange: true,
          });
        }
      });
  }

  private setupDOMListeners(): void {
    this.listeners.push(
      this.renderer.listen('window', 'contextmenu', (e: Event) =>
        e.preventDefault()
      )
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
          // Logic for when exiting fullscreen if needed
        }
      })
    );
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

  onKeydownHandler(event: KeyboardEvent): void {
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
    this.destroy$.next();
    this.destroy$.complete();
    this.listeners.forEach((listener) => listener());
    this.webSocketService.closeConnection();
  }
}
