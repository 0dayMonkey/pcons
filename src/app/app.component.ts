import {
  Component,
  OnInit,
  HostListener,
  Renderer2,
  Inject,
  OnDestroy,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DOCUMENT } from '@angular/common';

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

  constructor(
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
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

    const touchEndListener = this.renderer.listen(
      this.document.body,
      'touchend',
      (e: TouchEvent) => {
        if (e.touches.length > 0) {
          // Check if any touches are still active that might have been part of a multi-touch
          // Potentially, if e.touches.length was > 1 before this touchend,
          // and now it's 1, you might still want to consider it part of an invalid multi-touch sequence.
          // However, simply preventing default if any touches remain can be overly broad.
          // The key is that touchstart and touchmove for >1 touches are already prevented.
        }
      }
    );
    this.listeners.push(touchEndListener);

    this.listeners.push(
      this.renderer.listen('document', 'fullscreenchange', () => {
        if (!this.document.fullscreenElement) {
          this.requestFullScreen();
        }
      })
    );
    this.listeners.push(
      this.renderer.listen('document', 'webkitfullscreenchange', () => {
        if (
          !this.document.fullscreenElement &&
          !(this.document as any).webkitIsFullScreen
        ) {
          this.requestFullScreen();
        }
      })
    );
    this.listeners.push(
      this.renderer.listen('document', 'mozfullscreenchange', () => {
        if (!(this.document as any).mozFullScreenElement) {
          this.requestFullScreen();
        }
      })
    );
    this.listeners.push(
      this.renderer.listen('document', 'MSFullscreenChange', () => {
        if (!(this.document as any).msFullscreenElement) {
          this.requestFullScreen();
        }
      })
    );
  }

  requestFullScreen(): void {
    const elem = this.document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch((err) => {
        console.warn(
          `Avertissement : Demande de plein écran refusée ou erreur : ${err.message} (${err.name})`
        );
      });
    } else if ((elem as any).mozRequestFullScreen) {
      (elem as any).mozRequestFullScreen();
    } else if ((elem as any).webkitRequestFullscreen) {
      (elem as any).webkitRequestFullscreen();
    } else if ((elem as any).msRequestFullscreen) {
      (elem as any).msRequestFullscreen();
    }
  }

  @HostListener('document:keydown', ['$event'])
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
  }
}
