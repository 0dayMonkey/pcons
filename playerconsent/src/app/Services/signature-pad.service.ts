import { ElementRef, Injectable } from '@angular/core';
import SignaturePad, { PointGroup } from 'signature_pad';

@Injectable({
  providedIn: 'root',
})
export class SignaturePadService {
  private signaturePadInstance: SignaturePad | null = null;

  public initialize(
    canvasEl: HTMLCanvasElement,
    options: object
  ): SignaturePad {
    this.signaturePadInstance = new SignaturePad(canvasEl, options);
    return this.signaturePadInstance;
  }

  public getInstance(): SignaturePad | null {
    return this.signaturePadInstance;
  }

  public resize(
    canvasEl: HTMLCanvasElement,
    wrapperEl: HTMLDivElement,
    currentDataUrl: string | null
  ): void {
    if (!this.signaturePadInstance) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const parentWidth = wrapperEl.offsetWidth || 1;
    const parentHeight = wrapperEl.offsetHeight || 1;

    canvasEl.width = parentWidth * ratio;
    canvasEl.height = parentHeight * ratio;
    canvasEl.style.width = `${parentWidth}px`;
    canvasEl.style.height = `${parentHeight}px`;

    const ctx = canvasEl.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
    }

    if (currentDataUrl) {
      const tempImg = new Image();
      tempImg.onload = () => {
        if (ctx) ctx.drawImage(tempImg, 0, 0, parentWidth, parentHeight);
      };
      tempImg.src = currentDataUrl;
    } else {
      this.signaturePadInstance.clear();
    }
  }

  public clear(): void {
    this.signaturePadInstance?.clear();
  }

  public off(): void {
    this.signaturePadInstance?.off();
  }

  public async getResizedSignatureDataUrl(
    canvasEl: HTMLCanvasElement
  ): Promise<string | null> {
    if (!this.signaturePadInstance || this.signaturePadInstance.isEmpty()) {
      return null;
    }

    const points = this.signaturePadInstance.toData();

    const tempTransparentCanvas = document.createElement('canvas');
    tempTransparentCanvas.width = canvasEl.width;
    tempTransparentCanvas.height = canvasEl.height;

    const tempSignaturePad = new SignaturePad(tempTransparentCanvas, {
      backgroundColor: 'rgba(0,0,0,0)',
      penColor: 'rgb(0, 0, 0)',
    });
    tempSignaturePad.fromData(points);
    const transparentImageDataUrl = tempSignaturePad.toDataURL('image/png');
    tempSignaturePad.off();

    const DOWNSCALED_WIDTH = 400;
    const DOWNSCALED_HEIGHT = 150;
    const PADDING = 10;

    const imageWithStrokesOnly = new Image();
    imageWithStrokesOnly.src = transparentImageDataUrl;

    return new Promise((resolve) => {
      imageWithStrokesOnly.onload = () => {
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = DOWNSCALED_WIDTH;
        finalCanvas.height = DOWNSCALED_HEIGHT;
        const ctx = finalCanvas.getContext('2d');

        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, DOWNSCALED_WIDTH, DOWNSCALED_HEIGHT);

          const boundingBox = this.signaturePadInstance!.toData().reduce(
            (acc, { points }) => {
              points.forEach(({ x, y }) => {
                acc.minX = Math.min(acc.minX, x);
                acc.maxX = Math.max(acc.maxX, x);
                acc.minY = Math.min(acc.minY, y);
                acc.maxY = Math.max(acc.maxY, y);
              });
              return acc;
            },
            {
              minX: Infinity,
              maxX: -Infinity,
              minY: Infinity,
              maxY: -Infinity,
            }
          );

          const sigWidth = boundingBox.maxX - boundingBox.minX;
          const sigHeight = boundingBox.maxY - boundingBox.minY;

          if (sigWidth > 0 && sigHeight > 0) {
            const sourceX = Math.max(0, boundingBox.minX - PADDING);
            const sourceY = Math.max(0, boundingBox.minY - PADDING);
            const sourceWidth = sigWidth + PADDING * 2;
            const sourceHeight = sigHeight + PADDING * 2;
            const aspectRatio = sourceWidth / sourceHeight;
            let drawWidth = DOWNSCALED_WIDTH;
            let drawHeight = drawWidth / aspectRatio;

            if (drawHeight > DOWNSCALED_HEIGHT) {
              drawHeight = DOWNSCALED_HEIGHT;
              drawWidth = drawHeight * aspectRatio;
            }

            const offsetX = (DOWNSCALED_WIDTH - drawWidth) / 2;
            const offsetY = (DOWNSCALED_HEIGHT - drawHeight) / 2;

            ctx.drawImage(
              imageWithStrokesOnly,
              sourceX,
              sourceY,
              sourceWidth,
              sourceHeight,
              offsetX,
              offsetY,
              drawWidth,
              drawHeight
            );
          }
        }
        resolve(finalCanvas.toDataURL('image/jpeg', 0.8));
      };
      imageWithStrokesOnly.onerror = () => {
        resolve(null);
      };
    });
  }

  public async getSignatureWithWhiteBackground(
    originalDataUrl: string | null
  ): Promise<string | null> {
    if (!originalDataUrl) {
      return null;
    }

    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = 'Anonymous';
      image.src = originalDataUrl;

      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } else {
          resolve(null);
        }
      };

      image.onerror = () => {
        resolve(null);
      };
    });
  }
}
