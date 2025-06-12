import { Injectable, ElementRef } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import { ConsentDefinitionResponse } from './api.service';
import { SignaturePadService } from './signature-pad.service';
import { PdfLayoutType } from './consent-orchestration.service';

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

const PDF_CONFIG = {
  margin: 15,
  fontSizes: {
    headerTitle: 18,
    headerSubtitle: 11,
    playerInfo: 10,
    sectionTitle: 14,
    body: 14, // Par défaut, mais nous forcerons 14pt dans le HTML
    checkboxLabel: 10,
    info: 9,
    footer: 8,
  },
  colors: {
    text: '#000000',
    subtitle: '#505050',
    line: '#C8C8C8',
    placeholder: '#E6E6E6',
    placeholderText: '#969696',
    required: '#FF0000',
  },
  spacing: {
    headerBottom: 5,
    afterSectionTitle: 8,
    section: 10,
    line: 4,
    checkboxLineHeight: 4.5,
  },
  checkboxSize: 4,
  signatureBox: {
    width: 80,
    height: 30,
  },
};

@Injectable({
  providedIn: 'root',
})
export class ConsentPdfService {
  constructor(
    private translate: TranslateService,
    private signaturePadService: SignaturePadService
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
      if (
        yPosition + requiredHeight >
        doc.internal.pageSize.getHeight() - PDF_CONFIG.margin
      ) {
        doc.addPage();
        return PDF_CONFIG.margin;
      }
      return yPosition;
    };

    doc.setFont('helvetica', 'normal');

    currentY = await this._drawHeader(doc, data, currentY);
    currentY = this._drawLine(doc, currentY);
    currentY += PDF_CONFIG.spacing.section;

    // ==================================================================
    // FIX 1 : On utilise doc.html() pour interpréter le texte du consentement
    // et on force la police à 14pt.
    // ==================================================================
    if (data.consentDefinition?.text) {
      const contentWidth =
        doc.internal.pageSize.getWidth() - PDF_CONFIG.margin * 2;
      const htmlContent = `<div style="font-family: helvetica; font-size: 14pt; color: ${PDF_CONFIG.colors.text}; width: <span class="math-inline">\{contentWidth\}px;"\></span>{data.consentDefinition.text}</div>`;

      await doc.html(htmlContent, {
        x: PDF_CONFIG.margin,
        y: currentY,
        width: contentWidth,
        windowWidth: contentWidth,
        autoPaging: 'slice',
      });

      currentY = (doc as any).y;

      // S'assure que le contenu suivant ne chevauche pas le pied de page
      if (
        currentY >
        doc.internal.pageSize.getHeight() - (PDF_CONFIG.margin + 20)
      ) {
        doc.addPage();
        currentY = PDF_CONFIG.margin;
      } else {
        currentY += PDF_CONFIG.spacing.section / 2;
      }
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
    // ==================================================================
    // FIX 2 : Sécurité pour empêcher le crash si la traduction n'est pas prête.
    // ==================================================================
    const titleText = typeof title === 'string' ? title : '';

    y = addPageIfNeeded(PDF_CONFIG.fontSizes.sectionTitle / 2, y);
    doc
      .setFontSize(PDF_CONFIG.fontSizes.sectionTitle)
      .setFont('helvetica', 'bold')
      .setTextColor(PDF_CONFIG.colors.text);
    doc.text(titleText, PDF_CONFIG.margin, y);
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