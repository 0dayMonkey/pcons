import { Component, OnInit, OnDestroy, Renderer2, Inject } from '@angular/core';
import {
  Router,
  RouterOutlet,
  ActivatedRoute,
  NavigationEnd,
  UrlTree,
} from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { ReplaySubject, timer } from 'rxjs';
import { filter, takeUntil, tap } from 'rxjs/operators';
import {
  AppWebSocketService,
  LogLevel,
  WebSocketMessage,
} from './Services/websocket.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfigService } from './Services/config.service';
import { ConsentComponent } from './Components/Consent/consent.component';
import { ConsentOrchestrationService } from './Services/consent-orchestration.service';

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
  private activatedComponent: any;

  constructor(
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private webSocketService: AppWebSocketService,
    private translate: TranslateService,
    private configService: ConfigService,
    private orchestrationService: ConsentOrchestrationService
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
            if (this.configService.getLogLevel() >= LogLevel.INFO) {
              const infoMsg = `[LOG][INFO] Processing launch URL parameters.`;
              this.webSocketService.sendMessage(infoMsg);
            }
            const token = params.get('token') ?? '';
            const lang = params.get('lang') ?? '';
            const siteId = params.get('siteId') ?? '';
            const locTyp = params.get('locTyp') ?? '';
            const locId = params.get('locId') ?? '';

            this.configService.setWsPort(wsPort);
            this.configService.setToken(token);
            this.configService.setLang(lang);
            this.configService.setSiteId(siteId);
            this.configService.setLocTyp(locTyp);
            this.configService.setLocId(locId);

            const languageToUse =
              this.configService.getLang() || this.translate.getDefaultLang();
            this.translate.use(languageToUse);

            if (this.configService.getWsPort()) {
              const wsUrl = `ws://localhost:${this.configService.getWsPort()}`;
              this.webSocketService.connect(wsUrl);
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
          if (this.configService.getLogLevel() >= LogLevel.ERROR) {
            const errorMsg = `[LOG][ERROR] Initial launch parameters not processed after 5 seconds.`;
            this.webSocketService.sendMessage(errorMsg);
          }
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
    if (queryParams['siteId'] !== undefined) {
      delete queryParams['siteId'];
      paramsModified = true;
    }
    if (queryParams['locTyp'] !== undefined) {
      delete queryParams['locTyp'];
      paramsModified = true;
    }
    if (queryParams['locId'] !== undefined) {
      delete queryParams['locId'];
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
      .subscribe((message: any) => {
        if (typeof message === 'object' && message !== null && message.Action) {
          if (this.configService.getLogLevel() >= LogLevel.DEBUG) {
            const debugMsg = `[LOG][DEBUG] Received WebSocket command: ${message.Action}`;
            this.webSocketService.sendMessage(debugMsg);
          }

          if (message.Action === 'Consent' && message.PlayerId) {
            const isConsentActive =
              this.activatedComponent instanceof ConsentComponent;

            if (isConsentActive) {
              this.orchestrationService.requestNewConsent(message.PlayerId);
            } else {
              this.router.navigate(['/consent', message.PlayerId], {
                queryParams: {},
                skipLocationChange: true,
              });
            }
          } else if (message.Action === 'Idle') {
            const isPopupShowing =
              this.activatedComponent instanceof ConsentComponent &&
              this.activatedComponent.showValidationPopup === true;

            if (!isPopupShowing) {
              this.router.navigate(['/logo'], {
                queryParams: {},
                skipLocationChange: true,
              });
            }
          }
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
        }
      })
    );
  }

  requestFullScreen(): void {
    const elem = this.document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch((err) => {
        if (this.configService.getLogLevel() >= LogLevel.ERROR) {
          const errorMsg = `Fullscreen request failed: ${err.message}`;
          let logString = `[LOG][ERROR] ${errorMsg}`;
          const errorCode = err.name || 'UNKNOWN_ERROR';
          const errorMessage = err.message || 'No error message available.';
          const stack = err.stack ? `\n-- Stack Trace --\n${err.stack}` : '';
          logString += `\n> Code: ${errorCode}\n> Message: ${errorMessage}${stack}`;

          this.webSocketService.sendMessage(logString);
        }
      });
    } else if ((elem as any).mozRequestFullScreen) {
      (elem as any).mozRequestFullScreen();
    } else if ((elem as any).webkitRequestFullscreen) {
      (elem as any).webkitRequestFullscreen();
    } else if ((elem as any).msRequestFullscreen) {
      (elem as any).msRequestFullscreen();
    }
  }

  onActivate(component: any): void {
    this.activatedComponent = component;
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
