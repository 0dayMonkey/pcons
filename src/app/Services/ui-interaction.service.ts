import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FontSizeManagerService } from './font-size-manager.service';

@Injectable({
  providedIn: 'root',
})
export class UiInteractionService implements OnDestroy {
  public hasReachedBottom$ = new BehaviorSubject<boolean>(false);

  private rulesBodyElement: HTMLDivElement | null = null;
  private fontSizeManager: FontSizeManagerService | null = null;
  private initialPinchDistance = 0;
  private pinchStartFontSize = 0;

  private boundOnScroll = this.onScroll.bind(this);
  private boundOnTouchStart = this.onTouchStart.bind(this);
  private boundOnTouchMove = this.onTouchMove.bind(this);
  private boundOnTouchEnd = this.onTouchEnd.bind(this);

  public initialize(
    rulesBodyElement: HTMLDivElement,
    fontSizeManager: FontSizeManagerService
  ): void {
    this.rulesBodyElement = rulesBodyElement;
    this.fontSizeManager = fontSizeManager;

    this.rulesBodyElement.addEventListener('scroll', this.boundOnScroll);
    this.rulesBodyElement.addEventListener(
      'touchstart',
      this.boundOnTouchStart,
      { passive: false }
    );
    this.rulesBodyElement.addEventListener('touchmove', this.boundOnTouchMove, {
      passive: false,
    });
    this.rulesBodyElement.addEventListener('touchend', this.boundOnTouchEnd);
  }

  public ngOnDestroy(): void {
    if (this.rulesBodyElement) {
      this.rulesBodyElement.removeEventListener('scroll', this.boundOnScroll);
      this.rulesBodyElement.removeEventListener(
        'touchstart',
        this.boundOnTouchStart
      );
      this.rulesBodyElement.removeEventListener(
        'touchmove',
        this.boundOnTouchMove
      );
      this.rulesBodyElement.removeEventListener(
        'touchend',
        this.boundOnTouchEnd
      );
    }
  }

  public resetScrollState(): void {
    this.hasReachedBottom$.next(false);
    setTimeout(() => this.checkScroll(), 50);
  }

  public checkScroll(): void {
    if (this.rulesBodyElement && !this.hasReachedBottom$.value) {
      const el = this.rulesBodyElement;
      const threshold = 10;
      if (el.scrollHeight - el.scrollTop <= el.clientHeight + threshold) {
        this.hasReachedBottom$.next(true);
      }
    }
  }

  private onScroll(): void {
    this.checkScroll();
  }

  private onTouchStart(event: TouchEvent): void {
    if (
      event.touches.length === 2 &&
      this.rulesBodyElement &&
      this.fontSizeManager
    ) {
      event.preventDefault();
      this.initialPinchDistance = this.getDistanceBetweenTouches(event.touches);
      this.pinchStartFontSize = this.fontSizeManager.currentTextSizeInPx;
    }
  }

  private onTouchMove(event: TouchEvent): void {
    if (
      event.touches.length === 2 &&
      this.rulesBodyElement &&
      this.fontSizeManager &&
      this.initialPinchDistance > 0
    ) {
      event.preventDefault();
      const currentDistance = this.getDistanceBetweenTouches(event.touches);
      const scaleFactor = currentDistance / this.initialPinchDistance;
      let newSize = this.pinchStartFontSize * scaleFactor;

      if (Math.abs(this.fontSizeManager.currentTextSizeInPx - newSize) >= 0.5) {
        this.fontSizeManager.setCurrentTextSize(newSize);
        this.resetScrollState();
      }
    }
  }

  private onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      this.initialPinchDistance = 0;
    }
  }

  private getDistanceBetweenTouches(touches: TouchList): number {
    const touch1 = touches[0];
    const touch2 = touches[1];
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
