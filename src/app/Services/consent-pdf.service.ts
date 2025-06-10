import { Injectable, ElementRef } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import { ConsentDefinitionResponse } from './api.service';
import { SignaturePadService } from './signature-pad.service';

export interface PdfGenerationData {
  lastName: string;
  firstName: string;
  cardIdNumber: string;
  consentDefinition: ConsentDefinitionResponse | null;
  casinoName: string;
  casinoLogoUrl: string | null;
  mandatoryCheckbox: boolean;
  optionalCheckbox: boolean;
  signaturePadCanvas: ElementRef<HTMLCanvasElement>;
  consentIdToDisplayAndSubmit: string;
}

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
    return this.blobToBase64(blob);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => {
        reject(error);
      };
      reader.readAsDataURL(blob);
    });
  }

  private async generatePdfAsBlob(data: PdfGenerationData): Promise<Blob> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let currentY = margin;
    const contentWidth = pageWidth - 2 * margin;

    const lastName = data.lastName || 'N/A';
    const firstName = data.firstName || 'N/A';
    const identityDocument = `${data.cardIdNumber}`;
    const rulesText = data.consentDefinition?.text ?? 'N/A';
    const consentYearsDuration =
      data.consentDefinition?.consentYearsDuration ?? 1;
    const casinoName = data.casinoName || 'N/A';
    const casinoLogoDataUrl = data.casinoLogoUrl;

    const addPageIfNeeded = (requiredHeight: number) => {
      if (currentY + requiredHeight > pageHeight - margin - 10) {
        doc.addPage();
        currentY = margin;
      }
    };

    const logoWidth = 35;
    const logoHeight = 35;
    const logoX = margin;
    const logoActualRenderedHeight = logoHeight;
    const titleFontSize = 18;
    const casinoNameFontSize = 11;
    const playerInfoFontSize = 10;
    const gapAfterLogo = 5;
    const smallGap = 3;
    let headerSectionStartY = currentY;

    if (casinoLogoDataUrl) {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = casinoLogoDataUrl;
      try {
        await new Promise<void>((resolve) => {
          img.onload = () => {
            let imgFormat = 'PNG';
            if (
              img.src.toLowerCase().includes('jpeg') ||
              img.src.toLowerCase().includes('jpg')
            ) {
              imgFormat = 'JPEG';
            }
            doc.addImage(
              img,
              imgFormat,
              logoX,
              headerSectionStartY,
              logoWidth,
              logoHeight
            );
            resolve();
          };
          img.onerror = () => {
            doc.setFillColor(230, 230, 230);
            doc.rect(logoX, headerSectionStartY, logoWidth, logoHeight, 'F');
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(
              this.translate.instant('consent.pdf.logoPlaceholder'),
              logoX + logoWidth / 2,
              headerSectionStartY + logoHeight / 2,
              { align: 'center', baseline: 'middle' }
            );
            resolve();
          };
        });
      } catch (e) {
        doc.setFillColor(230, 230, 230);
        doc.rect(logoX, headerSectionStartY, logoWidth, logoHeight, 'F');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          this.translate.instant('consent.pdf.logoPlaceholder'),
          logoX + logoWidth / 2,
          headerSectionStartY + logoHeight / 2,
          { align: 'center', baseline: 'middle' }
        );
      }
    } else {
      doc.setFillColor(230, 230, 230);
      doc.rect(logoX, headerSectionStartY, logoWidth, logoHeight, 'F');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        this.translate.instant('consent.pdf.logoPlaceholder'),
        logoX + logoWidth / 2,
        headerSectionStartY + logoHeight / 2,
        { align: 'center', baseline: 'middle' }
      );
    }

    const titleTextX = logoX + logoWidth + gapAfterLogo;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(titleFontSize);
    doc.setTextColor(0, 0, 0);
    const titleText = this.translate.instant('consent.pdf.title');
    doc.text(titleText, titleTextX, headerSectionStartY, { baseline: 'top' });
    const titleDimensions = doc.getTextDimensions(titleText, {
      fontSize: titleFontSize,
    });
    const casinoNameTextY =
      headerSectionStartY + titleDimensions.h + smallGap / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(casinoNameFontSize);
    doc.setTextColor(80, 80, 80);
    doc.text(casinoName, titleTextX, casinoNameTextY, { baseline: 'top' });
    const casinoNameDimensions = doc.getTextDimensions(casinoName, {
      fontSize: casinoNameFontSize,
    });
    doc.setFontSize(playerInfoFontSize);
    doc.setTextColor(0, 0, 0);
    const playerInfoLineHeight = doc.getTextDimensions('Test', {
      fontSize: playerInfoFontSize,
    }).h;
    const playerInfoLeftAlign = titleTextX;
    const labelValueGap = 2;
    const verticalSpaceBetweenLines = playerInfoLineHeight + 2;
    const logoBottomY = headerSectionStartY + logoActualRenderedHeight;
    let docIdLineY = logoBottomY - 4;
    let prenomLineY = docIdLineY - verticalSpaceBetweenLines;
    let nomLineY = prenomLineY - verticalSpaceBetweenLines;
    const minNomLineY = casinoNameTextY + casinoNameDimensions.h + smallGap;
    if (nomLineY < minNomLineY) {
      nomLineY = minNomLineY;
      prenomLineY = nomLineY + verticalSpaceBetweenLines;
      docIdLineY = prenomLineY + verticalSpaceBetweenLines;
    }
    doc.setFont('helvetica', 'bold');
    const lastNameLabel = this.translate.instant('consent.pdf.lastNameLabel');
    doc.text(lastNameLabel, playerInfoLeftAlign, nomLineY);
    const lastNameLabelWidth = doc.getTextWidth(lastNameLabel);
    doc.setFont('helvetica', 'normal');
    doc.text(
      lastName,
      playerInfoLeftAlign + lastNameLabelWidth + labelValueGap,
      nomLineY
    );
    doc.setFont('helvetica', 'bold');
    const firstNameLabel = this.translate.instant('consent.pdf.firstNameLabel');
    doc.text(firstNameLabel, playerInfoLeftAlign, prenomLineY);
    const firstNameLabelWidth = doc.getTextWidth(firstNameLabel);
    doc.setFont('helvetica', 'normal');
    doc.text(
      firstName,
      playerInfoLeftAlign + firstNameLabelWidth + labelValueGap,
      prenomLineY
    );
    doc.setFont('helvetica', 'bold');
    const idLabel = this.translate.instant('consent.pdf.identityDocumentLabel');
    doc.text(idLabel, playerInfoLeftAlign, docIdLineY);
    const idLabelWidth = doc.getTextWidth(idLabel);
    doc.setFont('helvetica', 'normal');
    doc.text(
      identityDocument,
      playerInfoLeftAlign + idLabelWidth + labelValueGap,
      docIdLineY,
      {
        maxWidth:
          contentWidth -
          (playerInfoLeftAlign - margin) -
          idLabelWidth -
          labelValueGap,
      }
    );
    const bottomOfHeaderTextElements = Math.max(logoBottomY, docIdLineY);
    const spaceBelowHeaderToSeparator = 4;
    const separatorLineY =
      bottomOfHeaderTextElements + spaceBelowHeaderToSeparator;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, separatorLineY, pageWidth - margin, separatorLineY);
    currentY = separatorLineY + 8;

    addPageIfNeeded(10);
    doc.setFontSize(9).setTextColor(0, 0, 0).setFont('helvetica', 'normal');
    const splitRulesText = doc.splitTextToSize(rulesText, contentWidth);
    for (const line of splitRulesText) {
      addPageIfNeeded(4);
      doc.text(line, margin, currentY);
      currentY += 4;
    }
    currentY += 10;

    addPageIfNeeded(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(
      this.translate.instant('consent.pdf.agreementsTitle'),
      margin,
      currentY
    );
    currentY += 8;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 7;

    const checkboxSize = 4;
    const checkboxTextOffsetX = checkboxSize + 2;
    const checkboxLineHeight = 4.5;
    let checkboxSectionY = currentY;

    doc.setFontSize(10);
    let tempY =
      checkboxSectionY + checkboxSize / 2 - checkboxLineHeight / 2 + 1.5;

    addPageIfNeeded(checkboxSize + checkboxLineHeight * 2);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, checkboxSectionY, checkboxSize, checkboxSize, 'S');
    if (data.mandatoryCheckbox) {
      doc.setLineWidth(0.5);
      doc.line(
        margin + checkboxSize * 0.2,
        checkboxSectionY + checkboxSize * 0.5,
        margin + checkboxSize * 0.4,
        checkboxSectionY + checkboxSize * 0.7
      );
      doc.line(
        margin + checkboxSize * 0.4,
        checkboxSectionY + checkboxSize * 0.7,
        margin + checkboxSize * 0.8,
        checkboxSectionY + checkboxSize * 0.3
      );
    }

    let manLabelX = margin + checkboxTextOffsetX;
    const initialManLabelX = manLabelX;

    doc.setTextColor(255, 0, 0);
    doc.setFont('helvetica', 'bold');
    const asteriskChar = this.translate.instant('generic.requiredMarker');
    doc.text(asteriskChar, manLabelX, tempY);
    manLabelX +=
      (doc.getStringUnitWidth(asteriskChar) * doc.getFontSize()) /
      doc.internal.scaleFactor;

    doc.setTextColor(0, 0, 0);
    const consentBoldText = this.translate.instant('consent.pdf.consentLabel');
    doc.text(consentBoldText, manLabelX, tempY);
    manLabelX +=
      (doc.getStringUnitWidth(consentBoldText) * doc.getFontSize()) /
        doc.internal.scaleFactor +
      1;

    doc.setFont('helvetica', 'normal');
    const mainDeclarationText = this.translate.instant(
      'consent.pdf.mainDeclaration'
    );
    const requiredText = ' ' + this.translate.instant('generic.requiredText');

    const originalManFontSize = doc.getFontSize();
    doc.setFont('helvetica', 'italic');
    const requiredTextWidth =
      (doc.getStringUnitWidth(requiredText.trimStart()) * originalManFontSize) /
        doc.internal.scaleFactor +
      1;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(originalManFontSize);

    const availableWidthForMainText =
      contentWidth -
      checkboxTextOffsetX -
      (manLabelX - initialManLabelX) -
      requiredTextWidth;
    const mainTextLines = doc.splitTextToSize(
      mainDeclarationText,
      availableWidthForMainText < 10
        ? contentWidth - checkboxTextOffsetX - (manLabelX - initialManLabelX)
        : availableWidthForMainText
    );

    let manTextCurrentX = manLabelX;
    for (let i = 0; i < mainTextLines.length; i++) {
      if (i > 0) {
        tempY += checkboxLineHeight;
        manTextCurrentX = margin + checkboxTextOffsetX;
        addPageIfNeeded(checkboxLineHeight);
      }
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.text(mainTextLines[i], manTextCurrentX, tempY);
      if (i === mainTextLines.length - 1) {
        manTextCurrentX +=
          (doc.getStringUnitWidth(mainTextLines[i]) * doc.getFontSize()) /
          doc.internal.scaleFactor;
      }
    }
    doc.setTextColor(255, 0, 0);
    doc.setFont('helvetica', 'italic');
    doc.text(requiredText, manTextCurrentX, tempY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    checkboxSectionY = tempY + checkboxLineHeight;

    tempY = checkboxSectionY + checkboxSize / 2 - checkboxLineHeight / 2 + 1.5;
    addPageIfNeeded(checkboxSize + checkboxLineHeight * 2);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, checkboxSectionY, checkboxSize, checkboxSize, 'S');
    if (data.optionalCheckbox) {
      doc.setLineWidth(0.5);
      doc.line(
        margin + checkboxSize * 0.2,
        checkboxSectionY + checkboxSize * 0.5,
        margin + checkboxSize * 0.4,
        checkboxSectionY + checkboxSize * 0.7
      );
      doc.line(
        margin + checkboxSize * 0.4,
        checkboxSectionY + checkboxSize * 0.7,
        margin + checkboxSize * 0.8,
        checkboxSectionY + checkboxSize * 0.3
      );
    }

    let optLabelX = margin + checkboxTextOffsetX;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    const communicationsBoldText = this.translate.instant(
      'consent.pdf.communicationsLabel'
    );
    doc.text(communicationsBoldText, optLabelX, tempY);
    optLabelX +=
      (doc.getStringUnitWidth(communicationsBoldText) * doc.getFontSize()) /
        doc.internal.scaleFactor +
      1;

    doc.setFont('helvetica', 'normal');
    const communicationsNormalText = this.translate.instant(
      'consent.optionalCommunicationsLabelText'
    );
    const commTextLines = doc.splitTextToSize(
      communicationsNormalText,
      contentWidth -
        checkboxTextOffsetX -
        (optLabelX - (margin + checkboxTextOffsetX))
    );

    let optTextCurrentX = optLabelX;
    for (let i = 0; i < commTextLines.length; i++) {
      if (i > 0) {
        tempY += checkboxLineHeight;
        optTextCurrentX = margin + checkboxTextOffsetX;
        addPageIfNeeded(checkboxLineHeight);
      }
      doc.text(commTextLines[i], optTextCurrentX, tempY);
    }
    checkboxSectionY = tempY + checkboxLineHeight;
    currentY = checkboxSectionY + 7;

    addPageIfNeeded(40);
    doc.setFont('helvetica', 'bold').setFontSize(14);
    doc.text(
      this.translate.instant('consent.pdf.signatureInfoTitle'),
      margin,
      currentY
    );
    currentY += 8;
    doc
      .setDrawColor(200, 200, 200)
      .line(margin, currentY, pageWidth - margin, currentY);
    currentY += 7;

    const signatureMaxHeight = 30;
    const signatureMaxWidth = 80;
    try {
      const optimizedSignatureUrl =
        await this.signaturePadService.getResizedSignatureDataUrl(
          data.signaturePadCanvas.nativeElement
        );
      const signatureImgDataForPdf =
        await this.signaturePadService.getSignatureWithWhiteBackground(
          optimizedSignatureUrl
        );
      if (signatureImgDataForPdf) {
        doc.addImage(
          signatureImgDataForPdf,
          'PNG',
          margin,
          currentY,
          signatureMaxWidth,
          signatureMaxHeight
        );
      }
    } catch (e) {
      doc
        .setDrawColor(0, 0, 0)
        .rect(margin, currentY, signatureMaxWidth, signatureMaxHeight, 'S');
      doc.setFontSize(8).setTextColor(150, 150, 150);
      doc.text(
        this.translate.instant('consent.pdf.signatureNotProvided'),
        margin + signatureMaxWidth / 2,
        currentY + signatureMaxHeight / 2,
        { align: 'center', baseline: 'middle' }
      );
    }

    const now = new Date();
    const validUntilDate = new Date(now);
    validUntilDate.setFullYear(now.getFullYear() + consentYearsDuration);

    const infoX = margin + signatureMaxWidth + 10;
    let infoY = currentY + 5;
    doc.setFontSize(9);

    doc.setFont('helvetica', 'normal').setTextColor(100, 100, 100);
    doc.text(
      this.translate.instant('consent.pdf.consentDateLabel'),
      infoX,
      infoY
    );
    infoY += 5;
    doc.setFont('helvetica', 'bold').setTextColor(0, 0, 0);
    doc.text(now.toLocaleString('fr-FR'), infoX, infoY);
    infoY += 7;

    doc.setFont('helvetica', 'normal').setTextColor(100, 100, 100);
    doc.text(
      this.translate.instant('consent.pdf.validUntilLabel'),
      infoX,
      infoY
    );
    infoY += 5;
    doc.setFont('helvetica', 'bold').setTextColor(0, 0, 0);
    doc.text(validUntilDate.toLocaleDateString('fr-FR'), infoX, infoY);
    infoY += 7;

    doc.setFont('helvetica', 'normal').setTextColor(100, 100, 100);
    doc.text(
      this.translate.instant('consent.pdf.consentIdLabel'),
      infoX,
      infoY
    );
    infoY += 5;
    doc.setFont('helvetica', 'bold').setTextColor(0, 0, 0);
    doc.text(data.consentIdToDisplayAndSubmit, infoX, infoY);

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8).setTextColor(100, 100, 100);
      const pagePrefix = this.translate.instant('consent.pdf.pagePrefixLabel');
      const pageSeparator = this.translate.instant(
        'consent.pdf.pageSeparatorLabel'
      );
      doc.text(
        `${pagePrefix} ${i} ${pageSeparator} ${totalPages}`,
        pageWidth - margin,
        pageHeight - margin + 7,
        { align: 'right' }
      );
    }

    return doc.output('blob');
  }
}
