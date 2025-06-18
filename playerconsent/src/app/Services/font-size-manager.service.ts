import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class FontSizeManagerService {
  public currentTextSizeInPx: number;

  constructor() {
    this.currentTextSizeInPx = this.predefinedTextSizes.medium;
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  get predefinedTextSizes() {
    const baseSize = Math.max(14, Math.min(window.innerWidth * 0.025, 30));
    return {
      small: Math.round(baseSize * 1),
      medium: Math.round(baseSize * 1.5),
      large: Math.round(baseSize * 2),
    };
  }

  get minTextSize(): number {
    return Math.max(10, Math.min(window.innerWidth * 0.02, 14));
  }

  get maxTextSize(): number {
    return Math.max(20, Math.min(window.innerWidth * 0.04, 65));
  }

  public setTextSize(sizeKey: 'small' | 'medium' | 'large'): void {
    this.currentTextSizeInPx = this.predefinedTextSizes[sizeKey];
    this.clampTextSize();
  }

  public setCurrentTextSize(newSize: number): void {
    this.currentTextSizeInPx = newSize;
    this.clampTextSize();
  }

  public getCurrentTextSizeKey(): 'small' | 'medium' | 'large' | null {
    const sizes = this.predefinedTextSizes;
    if (Math.abs(this.currentTextSizeInPx - sizes.small) < 1) return 'small';
    if (Math.abs(this.currentTextSizeInPx - sizes.medium) < 1) return 'medium';
    if (Math.abs(this.currentTextSizeInPx - sizes.large) < 1) return 'large';
    return null;
  }

  public getScaledCheckboxLabelSize(): number {
    const viewportWidth = window.innerWidth;
    const baseSize = Math.max(12, Math.min(viewportWidth * 0.025, 30));
    const scaleFactor =
      this.currentTextSizeInPx / this.predefinedTextSizes.medium;
    let scaledSize = baseSize * scaleFactor;
    const minSize = Math.max(10, Math.min(viewportWidth * 0.04, 20));
    const maxSize = Math.max(20, Math.min(viewportWidth * 0.08, 35));
    scaledSize = Math.max(minSize, Math.min(scaledSize, maxSize));
    return Math.round(scaledSize);
  }

  private handleResize(): void {
    const currentSizeKey = this.getCurrentTextSizeKey();
    if (currentSizeKey) {
      this.currentTextSizeInPx = this.predefinedTextSizes[currentSizeKey];
    } else {
      this.currentTextSizeInPx = this.predefinedTextSizes.medium;
    }
    this.clampTextSize();
  }

  private clampTextSize(): void {
    this.currentTextSizeInPx = Math.max(
      this.minTextSize,
      Math.min(this.maxTextSize, this.currentTextSizeInPx)
    );
  }
}
