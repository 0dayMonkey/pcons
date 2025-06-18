import { Injectable, ElementRef, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import { ConsentDefinitionResponse } from './api.service';
import { SignaturePadService } from './signature-pad.service';
import { PdfLayoutType } from './consent-orchestration.service';
import { PDF_CONFIG } from './pdf.config';
import { PdfHtmlRendererService } from './pdf-html-renderer.service';

export interface PdfGenerationData {
  lastName: string;
  firstName: string;
  documentIdInfo: string;
  consentDefinition: ConsentDefinitionResponse | null;
  casinoName: string;
  casinoLogoUrl: string | null;
  mandatoryCheckbox: boolean;
  optionalCheckbox: boolean;
  signaturePadCanvas: ElementRef<HTMLCanvasElement>;
  consentIdToDisplayAndSubmit: string;
  layoutType: PdfLayoutType;
}

@Injectable({
  providedIn: 'root',
})
export class ConsentPdfService {
  private readonly httpClient = inject(HttpClient);

  constructor(
    private translate: TranslateService,
    private signaturePadService: SignaturePadService,
    private pdfHtmlRendererService: PdfHtmlRendererService
  ) {}

  public async generatePdfAsBase64(data: PdfGenerationData): Promise<string> {
    const blob = await this.generatePdfAsBlob(data);
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async generatePdfAsBlob(data: PdfGenerationData): Promise<Blob> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    let currentY = PDF_CONFIG.margin;

    const addPageIfNeeded = (requiredHeight: number, yPosition: number) => {
      const pageBottom = doc.internal.pageSize.getHeight() - PDF_CONFIG.margin;
      if (yPosition + requiredHeight > pageBottom) {
        doc.addPage();
        return PDF_CONFIG.margin;
      }
      return yPosition;
    };

    doc.setFont('Helvetica', 'normal');

    currentY = await this._drawHeader(doc, data, currentY);
    currentY = this._drawLine(doc, currentY);
    currentY += PDF_CONFIG.spacing.section;

    if (data.consentDefinition?.text) {
      const contentWidth =
        doc.internal.pageSize.getWidth() - PDF_CONFIG.margin * 2;
      currentY = this.pdfHtmlRendererService.render(
        doc,
        data.consentDefinition.text,
        PDF_CONFIG.margin,
        currentY,
        { width: contentWidth },
        addPageIfNeeded
      );
      currentY += PDF_CONFIG.spacing.section;
    }

    currentY = this._drawSectionTitle(
      doc,
      this.translate.instant('consent.pdf.agreementsTitle'),
      currentY,
      addPageIfNeeded
    );
    currentY = this._drawLine(doc, currentY);
    currentY += PDF_CONFIG.spacing.section / 2;

    const mandatoryKeys = {
      bold: 'consent.pdf.consentLabel',
      normal: 'consent.pdf.mainDeclaration',
    };
    currentY = this._drawCheckbox(
      doc,
      mandatoryKeys,
      data.mandatoryCheckbox,
      true,
      currentY,
      addPageIfNeeded
    );
    currentY += PDF_CONFIG.spacing.line;

    const optionalKeys = {
      bold: 'consent.pdf.communicationsLabel',
      normal: 'consent.optionalCommunicationsLabelText',
    };
    currentY = this._drawCheckbox(
      doc,
      optionalKeys,
      data.optionalCheckbox,
      false,
      currentY,
      addPageIfNeeded
    );
    currentY += PDF_CONFIG.spacing.section;

    currentY = this._drawSectionTitle(
      doc,
      this.translate.instant('consent.pdf.signatureInfoTitle'),
      currentY,
      addPageIfNeeded
    );
    currentY = this._drawLine(doc, currentY);
    currentY += PDF_CONFIG.spacing.section / 2;

    currentY = await this._drawSignatureAndInfo(
      doc,
      data,
      currentY,
      addPageIfNeeded
    );

    this._drawFooter(doc);
    return doc.output('blob');
  }

  private _drawFooter(doc: jsPDF): void {
    const pageCount = (doc as any).internal.getNumberOfPages();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFont('Helvetica', 'normal');
    doc
      .setFontSize(PDF_CONFIG.fontSizes.footer)
      .setTextColor(PDF_CONFIG.colors.subtitle);
    const pagePrefix = this.translate.instant('consent.pdf.pagePrefixLabel');
    const pageSeparator = this.translate.instant(
      'consent.pdf.pageSeparatorLabel'
    );
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(
        `${pagePrefix} ${i} ${pageSeparator} ${pageCount}`,
        pageWidth - PDF_CONFIG.margin,
        pageHeight - PDF_CONFIG.margin + 7,
        { align: 'right' }
      );
    }
  }

  private _drawSectionTitle(
    doc: jsPDF,
    title: string,
    y: number,
    addPageIfNeeded: (h: number, y: number) => number
  ): number {
    const textToDraw = title || '';
    y = addPageIfNeeded(PDF_CONFIG.fontSizes.sectionTitle / 2, y);
    doc.setFont('Helvetica', 'bold');
    doc
      .setFontSize(PDF_CONFIG.fontSizes.sectionTitle)
      .setTextColor(PDF_CONFIG.colors.text);
    doc.text(textToDraw, PDF_CONFIG.margin, y);
    return y + PDF_CONFIG.spacing.afterSectionTitle;
  }

  private _drawLine(doc: jsPDF, y: number): number {
    doc
      .setDrawColor(PDF_CONFIG.colors.line)
      .setLineWidth(0.3)
      .line(
        PDF_CONFIG.margin,
        y,
        doc.internal.pageSize.getWidth() - PDF_CONFIG.margin,
        y
      );
    return y;
  }

  private _drawCheckbox(
    doc: jsPDF,
    textKeys: { bold: string; normal: string },
    isChecked: boolean,
    isRequired: boolean,
    y: number,
    addPageIfNeeded: (h: number, y: number) => number
  ): number {
    const checkboxTextX = PDF_CONFIG.margin + PDF_CONFIG.checkboxSize + 2;
    const contentWidth =
      doc.internal.pageSize.getWidth() - PDF_CONFIG.margin - checkboxTextX;
    doc.setFontSize(PDF_CONFIG.fontSizes.checkboxLabel);
    doc.setFont('Helvetica', 'normal');
    const boldText = this.translate.instant(textKeys.bold);
    const normalText = this.translate.instant(textKeys.normal);
    const fullText = isRequired
      ? `* ${boldText} ${normalText} ${this.translate.instant(
          'generic.requiredText'
        )}`
      : `${boldText} ${normalText}`;
    const textLines = doc.splitTextToSize(fullText, contentWidth);
    const requiredHeight =
      textLines.length * PDF_CONFIG.spacing.checkboxLineHeight;
    y = addPageIfNeeded(requiredHeight, y);
    const initialY = y;
    doc
      .setDrawColor(PDF_CONFIG.colors.text)
      .setLineWidth(0.3)
      .rect(
        PDF_CONFIG.margin,
        initialY,
        PDF_CONFIG.checkboxSize,
        PDF_CONFIG.checkboxSize,
        'S'
      );
    if (isChecked) {
      doc.setLineWidth(0.5);
      doc.line(
        PDF_CONFIG.margin + 0.8,
        initialY + 2,
        PDF_CONFIG.margin + 1.6,
        initialY + 2.8
      );
      doc.line(
        PDF_CONFIG.margin + 1.6,
        initialY + 2.8,
        PDF_CONFIG.margin + 3.2,
        initialY + 1.2
      );
    }
    let textY =
      initialY +
      PDF_CONFIG.checkboxSize / 2 -
      PDF_CONFIG.spacing.checkboxLineHeight / 2 +
      1.5;
    let currentX = checkboxTextX;
    if (isRequired) {
      doc.setTextColor(PDF_CONFIG.colors.required).setFont('Helvetica', 'bold');
      doc.text('*', currentX, textY);
      currentX += doc.getTextWidth('*');
    }
    doc.setTextColor(PDF_CONFIG.colors.text).setFont('Helvetica', 'bold');
    doc.text(boldText, currentX, textY);
    currentX += doc.getTextWidth(boldText);
    const remainingText = ` ${normalText}`;
    const requiredText = isRequired
      ? ` ${this.translate.instant('generic.requiredText')}`
      : '';
    doc.setFont('Helvetica', 'italic');
    const requiredTextWidth = doc.getTextWidth(requiredText);
    doc.setFont('Helvetica', 'normal');
    const remainingWidth =
      doc.internal.pageSize.getWidth() -
      PDF_CONFIG.margin -
      currentX -
      requiredTextWidth;
    const splitRemaining = doc.splitTextToSize(remainingText, remainingWidth);
    for (let i = 0; i < splitRemaining.length; i++) {
      const line = splitRemaining[i];
      if (i > 0) {
        textY += PDF_CONFIG.spacing.checkboxLineHeight;
        currentX = checkboxTextX;
      }
      doc.text(line, currentX, textY);
      currentX += doc.getTextWidth(line);
    }
    if (isRequired) {
      doc
        .setFont('Helvetica', 'italic')
        .setTextColor(PDF_CONFIG.colors.required);
      doc.text(requiredText, currentX, textY);
    }
    return initialY + requiredHeight;
  }

  private async _drawSignatureAndInfo(
    doc: jsPDF,
    data: PdfGenerationData,
    y: number,
    addPageIfNeeded: (h: number, y: number) => number
  ): Promise<number> {
    y = addPageIfNeeded(PDF_CONFIG.signatureBox.height, y);
    try {
      const optimizedUrl =
        await this.signaturePadService.getResizedSignatureDataUrl(
          data.signaturePadCanvas.nativeElement
        );
      const signatureImg =
        await this.signaturePadService.getSignatureWithWhiteBackground(
          optimizedUrl
        );
      if (signatureImg) {
        doc.addImage(
          signatureImg,
          'JPEG',
          PDF_CONFIG.margin,
          y,
          PDF_CONFIG.signatureBox.width,
          PDF_CONFIG.signatureBox.height,
          undefined,
          'MEDIUM'
        );
      }
    } catch (e) {
      this._drawPlaceholder(
        doc,
        {
          x: PDF_CONFIG.margin,
          y,
          width: PDF_CONFIG.signatureBox.width,
          height: PDF_CONFIG.signatureBox.height,
        },
        this.translate.instant('consent.pdf.signatureNotProvided')
      );
    }
    const infoX = PDF_CONFIG.margin + PDF_CONFIG.signatureBox.width + 10;
    let infoY = y + 5;
    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setFullYear(
      now.getFullYear() + (data.consentDefinition?.consentYearsDuration ?? 1)
    );
    const drawInfoLine = (labelKey: string, value: string) => {
      doc.setFontSize(PDF_CONFIG.fontSizes.info);
      doc
        .setFont('Helvetica', 'normal')
        .setTextColor(PDF_CONFIG.colors.subtitle);
      doc.text(this.translate.instant(labelKey), infoX, infoY);
      infoY += 5;
      doc.setFont('Helvetica', 'bold').setTextColor(PDF_CONFIG.colors.text);
      doc.text(value, infoX, infoY);
      infoY += 7;
    };
    drawInfoLine('consent.pdf.consentDateLabel', now.toLocaleString('fr-FR'));
    drawInfoLine(
      'consent.pdf.validUntilLabel',
      validUntil.toLocaleDateString('fr-FR')
    );
    drawInfoLine(
      'consent.pdf.versionLabel',
      data.consentDefinition?.version?.toString() ?? 'N/A'
    );
    return y + PDF_CONFIG.signatureBox.height;
  }

  private async _drawHeader(
    doc: jsPDF,
    data: PdfGenerationData,
    y: number
  ): Promise<number> {
    if (data.layoutType === 'wide') {
      return this._drawWideHeader(doc, data, y);
    }
    return this._drawPortraitHeader(doc, data, y);
  }

  private async _drawPortraitHeader(
    doc: jsPDF,
    data: PdfGenerationData,
    y: number
  ): Promise<number> {
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - 2 * PDF_CONFIG.margin;
    const logoBounds = {
      x: PDF_CONFIG.margin,
      y: y,
      maxWidth: 35,
      maxHeight: 35,
    };
    if (data.casinoLogoUrl) {
      await this._drawImage(doc, data.casinoLogoUrl, logoBounds);
    } else {
      this._drawPlaceholder(
        doc,
        { ...logoBounds, width: 35, height: 35 },
        this.translate.instant('consent.pdf.logoPlaceholder')
      );
    }
    const titleTextX = PDF_CONFIG.margin + 35 + 5;
    doc
      .setFont('Helvetica', 'bold')
      .setFontSize(PDF_CONFIG.fontSizes.headerTitle)
      .setTextColor(PDF_CONFIG.colors.text);
    doc.text(this.translate.instant('consent.pdf.title'), titleTextX, y, {
      baseline: 'top',
    });
    const titleDim = doc.getTextDimensions(
      this.translate.instant('consent.pdf.title'),
      { fontSize: PDF_CONFIG.fontSizes.headerTitle }
    );
    const subtitleY = y + titleDim.h + 2;
    doc
      .setFont('Helvetica', 'normal')
      .setFontSize(PDF_CONFIG.fontSizes.headerSubtitle)
      .setTextColor(PDF_CONFIG.colors.subtitle);
    doc.text(data.casinoName, titleTextX, subtitleY, { baseline: 'top' });
    let infoY =
      subtitleY +
      doc.getTextDimensions(data.casinoName, {
        fontSize: PDF_CONFIG.fontSizes.headerSubtitle,
      }).h +
      4;
    const drawInfo = (labelKey: string, value: string) => {
      doc
        .setFont('Helvetica', 'bold')
        .setFontSize(PDF_CONFIG.fontSizes.playerInfo)
        .setTextColor(PDF_CONFIG.colors.text);
      const label = this.translate.instant(labelKey);
      doc.text(label, titleTextX, infoY);
      const labelWidth = doc.getTextWidth(label);
      doc.setFont('Helvetica', 'normal');
      doc.text(value, titleTextX + labelWidth + 2, infoY, {
        maxWidth:
          contentWidth - (titleTextX - PDF_CONFIG.margin) - labelWidth - 2,
      });
      infoY += PDF_CONFIG.fontSizes.playerInfo * 0.5 + 2;
    };
    drawInfo('consent.pdf.lastNameLabel', data.lastName);
    drawInfo('consent.pdf.firstNameLabel', data.firstName);
    drawInfo('consent.pdf.identityDocumentLabel', data.documentIdInfo);
    return (
      Math.max(y + logoBounds.maxHeight, infoY) +
      PDF_CONFIG.spacing.headerBottom
    );
  }

  private async _drawWideHeader(
    doc: jsPDF,
    data: PdfGenerationData,
    y: number
  ): Promise<number> {
    const pageWidth = doc.internal.pageSize.getWidth();
    const newMaxWidth = 120;
    const newMaxHeight = 30;
    const newX = (pageWidth - newMaxWidth) / 2;
    const logoBounds = {
      x: newX,
      y: y,
      maxWidth: newMaxWidth,
      maxHeight: newMaxHeight,
    };
    if (data.casinoLogoUrl) {
      await this._drawImage(doc, data.casinoLogoUrl, logoBounds);
      y += newMaxHeight;
    } else {
      this._drawPlaceholder(
        doc,
        { x: newX, y: y, width: newMaxWidth, height: newMaxHeight },
        this.translate.instant('consent.pdf.logoPlaceholder')
      );
      y += newMaxHeight;
    }
    y += PDF_CONFIG.spacing.headerBottom;
    doc
      .setFont('Helvetica', 'bold')
      .setFontSize(PDF_CONFIG.fontSizes.headerTitle)
      .setTextColor(PDF_CONFIG.colors.text);
    doc.text(this.translate.instant('consent.pdf.title'), pageWidth / 2, y, {
      align: 'center',
    });
    y += doc.getTextDimensions('T', {
      fontSize: PDF_CONFIG.fontSizes.headerTitle,
    }).h;
    doc
      .setFont('Helvetica', 'normal')
      .setFontSize(PDF_CONFIG.fontSizes.headerSubtitle)
      .setTextColor(PDF_CONFIG.colors.subtitle);
    doc.text(data.casinoName, pageWidth / 2, y, { align: 'center' });
    y +=
      doc.getTextDimensions('T', {
        fontSize: PDF_CONFIG.fontSizes.headerSubtitle,
      }).h + 5;
    const drawInfo = (labelKey: string, value: string) => {
      doc
        .setFont('Helvetica', 'bold')
        .setFontSize(PDF_CONFIG.fontSizes.playerInfo)
        .setTextColor(PDF_CONFIG.colors.text);
      const label = this.translate.instant(labelKey);
      doc.text(label, PDF_CONFIG.margin, y);
      const labelWidth = doc.getTextWidth(label);
      doc.setFont('Helvetica', 'normal');
      doc.text(value, PDF_CONFIG.margin + labelWidth + 2, y);
      y += PDF_CONFIG.fontSizes.playerInfo * 0.5 + 1.5;
    };
    drawInfo('consent.pdf.lastNameLabel', data.lastName);
    drawInfo('consent.pdf.firstNameLabel', data.firstName);
    drawInfo('consent.pdf.identityDocumentLabel', data.documentIdInfo);
    return y + PDF_CONFIG.spacing.headerBottom;
  }

  private _drawPlaceholder(
    doc: jsPDF,
    bounds: { x: number; y: number; width: number; height: number },
    text: string
  ): void {
    doc
      .setFillColor(PDF_CONFIG.colors.placeholder)
      .rect(bounds.x, bounds.y, bounds.width, bounds.height, 'F');
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8).setTextColor(PDF_CONFIG.colors.placeholderText);
    doc.text(text, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
      align: 'center',
      baseline: 'middle',
    });
  }

  private async _drawImage(
    doc: jsPDF,
    dataUrl: string,
    bounds: { x: number; y: number; maxWidth: number; maxHeight: number }
  ): Promise<number> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = dataUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          this._drawPlaceholder(
            doc,
            {
              x: bounds.x,
              y: bounds.y,
              width: bounds.maxWidth,
              height: bounds.maxHeight,
            },
            this.translate.instant('consent.pdf.logoPlaceholder')
          );
          return resolve(bounds.y + bounds.maxHeight);
        }

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const aspectRatio = img.naturalWidth / img.naturalHeight;
        let imgWidth = bounds.maxWidth;
        let imgHeight = imgWidth / aspectRatio;
        if (imgHeight > bounds.maxHeight) {
          imgHeight = bounds.maxHeight;
          imgWidth = imgHeight * aspectRatio;
        }
        const xPos = bounds.x + (bounds.maxWidth - imgWidth) / 2;
        const yPos = bounds.y + (bounds.maxHeight - imgHeight) / 2;

        try {
          doc.addImage(
            canvas,
            'JPEG',
            xPos,
            yPos,
            imgWidth,
            imgHeight,
            undefined,
            'MEDIUM'
          );
        } catch (e) {
          this._drawPlaceholder(
            doc,
            {
              x: bounds.x,
              y: bounds.y,
              width: bounds.maxWidth,
              height: bounds.maxHeight,
            },
            this.translate.instant('consent.pdf.logoPlaceholder')
          );
        }
        resolve(bounds.y + bounds.maxHeight);
      };
      img.onerror = () => {
        this._drawPlaceholder(
          doc,
          {
            x: bounds.x,
            y: bounds.y,
            width: bounds.maxWidth,
            height: bounds.maxHeight,
          },
          this.translate.instant('consent.pdf.logoPlaceholder')
        );
        resolve(bounds.y + bounds.maxHeight);
      };
    });
  }
}
