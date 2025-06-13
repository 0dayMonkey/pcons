import { Injectable, ElementRef, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import { ConsentDefinitionResponse } from './api.service';
import { SignaturePadService } from './signature-pad.service';
import { PdfLayoutType } from './consent-orchestration.service';
import { firstValueFrom } from 'rxjs';

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
    h1: 14,
    h2: 12,
    body: 9,
    pre: 8,
    checkboxLabel: 10,
    info: 9,
    footer: 8,
  },
  colors: {
    text: '#000000',
    subtitle: '#505050',
    link: '#0000EE',
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

type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';
type TextAlign = 'left' | 'center' | 'right' | 'justify';
type StyleState = {
  fontName: string;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  color: string;
  bgColor: string | null;
  align: TextAlign;
};
type DrawInstruction = {
  type: 'text' | 'pre' | 'bullet' | 'newline';
  content?: string;
  styles?: StyleState;
  indent?: number;
  spacing?: number;
};

@Injectable({
  providedIn: 'root',
})
export class ConsentPdfService {
  private fontsLoaded = false;
  private readonly httpClient = inject(HttpClient);

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

  private async _loadAndRegisterFonts(doc: jsPDF): Promise<void> {
    if (this.fontsLoaded) return;
    const fontToB64 = async (url: string) => {
      const blob = await firstValueFrom(
        this.httpClient.get(url, { responseType: 'blob' })
      );
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = (reader.result as string)?.split(',')[1];
          if (res) resolve(res);
          else reject(new Error(`Failed to read font from ${url}`));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };
    try {
      const fontsToLoad = [
        { name: 'Arial', style: 'normal', file: 'arial.ttf' },
        { name: 'Arial', style: 'bold', file: 'arialb.ttf' },
        { name: 'Arial', style: 'italic', file: 'ariali.ttf' },
        { name: 'Arial', style: 'bolditalic', file: 'arialbi.ttf' },
        { name: 'Georgia', style: 'normal', file: 'georgia.ttf' },
        { name: 'Georgia', style: 'bold', file: 'georgiab.ttf' },
        { name: 'Georgia', style: 'italic', file: 'georgiai.ttf' },
        { name: 'Georgia', style: 'bolditalic', file: 'georgiabi.ttf' },
        { name: 'Courier', style: 'normal', file: 'Courier.ttf' },
        { name: 'Courier', style: 'bold', file: 'Courierb.ttf' },
        { name: 'Courier', style: 'italic', file: 'Courieri.ttf' },
        { name: 'Courier', style: 'bolditalic', file: 'Courierbi.ttf' },
      ];
      for (const font of fontsToLoad) {
        const b64 = await fontToB64(`/assets/fonts/${font.name}/${font.file}`);
        doc.addFileToVFS(font.file, b64);
        doc.addFont(font.file, font.name, font.style as FontStyle);
      }
      this.fontsLoaded = true;
    } catch (error) {
      console.error(
        'Custom fonts failed to load, falling back to built-ins.',
        error
      );
    }
  }

  private _renderHtml(
    doc: jsPDF,
    html: string,
    x: number,
    y: number,
    options: { width: number },
    addPageIfNeeded: (h: number, y: number) => number
  ): number {
    const FONT_NAME = this.fontsLoaded ? 'Arial' : 'helvetica';
    const SERIF_FONT_NAME = this.fontsLoaded ? 'Georgia' : 'times';
    const MONO_FONT_NAME = this.fontsLoaded ? 'Courier' : 'courier';
    const LINE_HEIGHT_RATIO = 1.4;
    const LIST_INDENT_WIDTH = 5;
    const HEADING_SPACING = 3;

    const instructions: DrawInstruction[] = [];
    const initialStyles: StyleState = {
      fontName: FONT_NAME,
      fontSize: PDF_CONFIG.fontSizes.body,
      isBold: false,
      isItalic: false,
      isUnderline: false,
      color: PDF_CONFIG.colors.text,
      bgColor: null,
      align: 'left',
    };

    const listCounterStack: number[] = [];

    const parseNodes = (
      node: Node,
      currentStyles: StyleState,
      listStack: ('ul' | 'ol')[]
    ) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent
          ?.replace(/[\n\r\t]+/g, ' ')
          .replace(/\s+/g, ' ');
        if (text && text.trim()) {
          instructions.push({
            type: 'text',
            content: text,
            styles: { ...currentStyles },
          });
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as HTMLElement;
      let newStyles = { ...currentStyles };
      const tagName = element.tagName.toLowerCase();

      let needsBlockSpacing = false;
      switch (tagName) {
        case 'h1':
          newStyles.fontSize = PDF_CONFIG.fontSizes.h1;
          newStyles.isBold = true;
          needsBlockSpacing = true;
          break;
        case 'h2':
          newStyles.fontSize = PDF_CONFIG.fontSizes.h2;
          newStyles.isBold = true;
          needsBlockSpacing = true;
          break;
        case 'b':
        case 'strong':
          newStyles.isBold = true;
          break;
        case 'i':
        case 'em':
          newStyles.isItalic = true;
          break;
        case 'u':
          newStyles.isUnderline = true;
          break;
        case 'a':
          newStyles.color = PDF_CONFIG.colors.link;
          newStyles.isUnderline = true;
          break;
        case 'ul':
          listStack.push('ul');
          needsBlockSpacing = true;
          break;
        case 'ol':
          listStack.push('ol');
          listCounterStack.push(0);
          needsBlockSpacing = true;
          break;
        case 'li':
          instructions.push({
            type: 'newline',
            spacing: LINE_HEIGHT_RATIO * 0.5,
          });
          const listLevel = listStack.length;
          const bulletIndent = (listLevel - 1) * LIST_INDENT_WIDTH;
          const currentListType = listStack[listLevel - 1];
          let bulletContent = '•';
          if (currentListType === 'ol') {
            const counterIndex = listCounterStack.length - 1;
            listCounterStack[counterIndex]++;
            bulletContent = `${listCounterStack[counterIndex]}.`;
          }
          instructions.push({
            type: 'bullet',
            content: bulletContent,
            indent: bulletIndent,
            styles: newStyles,
          });
          break;
        case 'p':
        case 'div':
          needsBlockSpacing = true;
          break;
        case 'br':
          instructions.push({ type: 'newline' });
          break;
        case 'pre':
          newStyles.fontName = MONO_FONT_NAME;
          instructions.push({
            type: 'pre',
            content: element.textContent || '',
            styles: newStyles,
          });
          return;
        case 'img':
          return;
      }

      if (element.classList.contains('ql-font-serif'))
        newStyles.fontName = SERIF_FONT_NAME;
      if (element.classList.contains('ql-font-monospace'))
        newStyles.fontName = MONO_FONT_NAME;
      if (element.classList.contains('ql-align-center'))
        newStyles.align = 'center';
      if (element.classList.contains('ql-align-right'))
        newStyles.align = 'right';
      if (element.classList.contains('ql-align-justify'))
        newStyles.align = 'justify';

      const styleAttr = element.getAttribute('style');
      if (styleAttr) {
        const colorMatch = /color:\s*(.*?)(;|$)/.exec(styleAttr);
        if (colorMatch) newStyles.color = colorMatch[1];
        const bgMatch = /background-color:\s*(.*?)(;|$)/.exec(styleAttr);
        if (bgMatch) newStyles.bgColor = bgMatch[1];
      }

      if (
        needsBlockSpacing &&
        instructions.length > 0 &&
        instructions[instructions.length - 1].type !== 'newline'
      ) {
        instructions.push({ type: 'newline', spacing: HEADING_SPACING });
      }

      element.childNodes.forEach((child) =>
        parseNodes(child, newStyles, [...listStack])
      );

      if (tagName === 'ol') listCounterStack.pop();
      if (tagName === 'ul') listStack.pop();

      if (
        needsBlockSpacing &&
        instructions.length > 0 &&
        instructions[instructions.length - 1].type !== 'newline'
      ) {
        instructions.push({ type: 'newline', spacing: HEADING_SPACING });
      }
    };

    const container = document.createElement('div');
    container.innerHTML = html.replace(/&nbsp;/g, ' ');
    parseNodes(container, initialStyles, []);

    let currentY = y;
    let lineBuffer: { text: string; width: number; styles: StyleState }[] = [];
    let currentLineHeight = 0;
    let currentX = x;

    const flushLine = () => {
      if (lineBuffer.length === 0) return;

      const totalWidth = lineBuffer.reduce((sum, item) => sum + item.width, 0);
      let lineX = currentX;
      const firstItemAlign = lineBuffer[0].styles.align;
      if (firstItemAlign === 'center')
        lineX = x + (options.width - totalWidth) / 2;
      if (firstItemAlign === 'right') lineX = x + options.width - totalWidth;

      currentY = addPageIfNeeded(currentLineHeight, currentY);

      for (const item of lineBuffer) {
        const styles = item.styles;
        const style: FontStyle = styles.isBold
          ? styles.isItalic
            ? 'bolditalic'
            : 'bold'
          : styles.isItalic
          ? 'italic'
          : 'normal';

        const yPos = currentY + (currentLineHeight * 0.7) / 2;

        const textColor = styles.bgColor
          ? PDF_CONFIG.colors.text
          : styles.color;

        if (styles.bgColor) {
          doc.setFillColor(styles.bgColor);
          doc.rect(lineX, currentY, item.width, currentLineHeight, 'F');
        }

        doc.setFont(styles.fontName, style);
        doc.setFontSize(styles.fontSize);
        doc.setTextColor(textColor);
        doc.text(item.text, lineX, yPos, { baseline: 'middle' });

        if (item.styles.isUnderline) {
          const trimmedWidth = doc.getTextWidth(item.text.trimEnd());
          const underlineY = currentY + currentLineHeight * 0.5 + 1;
          doc.setDrawColor(textColor);
          doc.line(lineX, underlineY, lineX + trimmedWidth, underlineY);
        }

        lineX += item.width;
      }
      currentY += currentLineHeight;
      lineBuffer = [];
      currentLineHeight = 0;
      currentX = x;
    };

    for (const instruction of instructions) {
      if (
        instruction.type === 'text' &&
        instruction.content &&
        instruction.styles
      ) {
        const words = instruction.content.split(' ').filter((w) => w);
        for (const word of words) {
          const text = word + ' ';
          const styles = instruction.styles;
          const style: FontStyle = styles.isBold
            ? styles.isItalic
              ? 'bolditalic'
              : 'bold'
            : styles.isItalic
            ? 'italic'
            : 'normal';
          doc.setFont(styles.fontName, style);
          doc.setFontSize(styles.fontSize);
          const width = doc.getTextWidth(text);
          const bufferWidth = lineBuffer.reduce(
            (sum, item) => sum + item.width,
            0
          );

          if (
            lineBuffer.length > 0 &&
            currentX + bufferWidth + width > x + options.width
          ) {
            flushLine();
          }

          if (lineBuffer.length === 0) {
            currentX = x;
            if (instruction.indent !== undefined) {
              currentX += instruction.indent;
            }
          }

          lineBuffer.push({ text, width, styles });
          currentLineHeight = Math.max(
            currentLineHeight,
            styles.fontSize * 0.352778 * LINE_HEIGHT_RATIO
          );
        }
      } else if (instruction.type === 'newline') {
        flushLine();
        if (instruction.spacing) currentY += instruction.spacing;
        currentX = x;
      } else if (
        instruction.type === 'bullet' &&
        instruction.content &&
        instruction.styles
      ) {
        flushLine();
        const styles = instruction.styles;
        currentLineHeight = styles.fontSize * 0.352778 * LINE_HEIGHT_RATIO;
        currentY = addPageIfNeeded(currentLineHeight, currentY);
        const style: FontStyle = styles.isBold
          ? styles.isItalic
            ? 'bolditalic'
            : 'bold'
          : styles.isItalic
          ? 'italic'
          : 'normal';
        doc.setFont(styles.fontName, style);
        doc.setFontSize(styles.fontSize);

        const bulletX = x + (instruction.indent || 0);
        const bulletText = instruction.content + ' ';

        doc.text(
          bulletText,
          bulletX,
          currentY + (currentLineHeight * 0.7) / 2,
          { baseline: 'middle' }
        );
        const bulletWidth = doc.getTextWidth(bulletText);
        currentX = bulletX + bulletWidth;
      } else if (
        instruction.type === 'pre' &&
        instruction.content &&
        instruction.styles
      ) {
        flushLine();
        const preFontSize = PDF_CONFIG.fontSizes.pre;
        const lineHeight = preFontSize * 0.352778 * 1.2;
        doc.setFont(MONO_FONT_NAME, 'normal');
        doc.setFontSize(preFontSize);
        doc.setTextColor(PDF_CONFIG.colors.text);

        const lines = instruction.content.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          currentY = addPageIfNeeded(lineHeight, currentY);
          doc.text(line.trim(), x, currentY);
          currentY += lineHeight;
        }
      }
    }
    flushLine();
    return currentY;
  }

  private async generatePdfAsBlob(data: PdfGenerationData): Promise<Blob> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    let currentY = PDF_CONFIG.margin;
    await this._loadAndRegisterFonts(doc);

    const addPageIfNeeded = (requiredHeight: number, yPosition: number) => {
      const pageBottom = doc.internal.pageSize.getHeight() - PDF_CONFIG.margin;
      if (yPosition + requiredHeight > pageBottom) {
        doc.addPage();
        return PDF_CONFIG.margin;
      }
      return yPosition;
    };

    doc.setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'normal');

    currentY = await this._drawHeader(doc, data, currentY);
    currentY = this._drawLine(doc, currentY);
    currentY += PDF_CONFIG.spacing.section;

    if (data.consentDefinition?.text) {
      const contentWidth =
        doc.internal.pageSize.getWidth() - PDF_CONFIG.margin * 2;
      currentY = this._renderHtml(
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
    doc.setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'normal');
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
    doc.setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'bold');
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
    doc.setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'normal');
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
      doc
        .setTextColor(PDF_CONFIG.colors.required)
        .setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'bold');
      doc.text('*', currentX, textY);
      currentX += doc.getTextWidth('*');
    }
    doc
      .setTextColor(PDF_CONFIG.colors.text)
      .setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'bold');
    doc.text(boldText, currentX, textY);
    currentX += doc.getTextWidth(boldText);
    const remainingText = ` ${normalText}`;
    const requiredText = isRequired
      ? ` ${this.translate.instant('generic.requiredText')}`
      : '';
    doc.setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'italic');
    const requiredTextWidth = doc.getTextWidth(requiredText);
    doc.setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'normal');
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
        .setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'italic')
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
          'PNG',
          PDF_CONFIG.margin,
          y,
          PDF_CONFIG.signatureBox.width,
          PDF_CONFIG.signatureBox.height
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
        .setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'normal')
        .setTextColor(PDF_CONFIG.colors.subtitle);
      doc.text(this.translate.instant(labelKey), infoX, infoY);
      infoY += 5;
      doc
        .setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'bold')
        .setTextColor(PDF_CONFIG.colors.text);
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
      .setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'bold')
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
      .setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'normal')
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
        .setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'bold')
        .setFontSize(PDF_CONFIG.fontSizes.playerInfo)
        .setTextColor(PDF_CONFIG.colors.text);
      const label = this.translate.instant(labelKey);
      doc.text(label, titleTextX, infoY);
      const labelWidth = doc.getTextWidth(label);
      doc.setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'normal');
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
      .setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'bold')
      .setFontSize(PDF_CONFIG.fontSizes.headerTitle)
      .setTextColor(PDF_CONFIG.colors.text);
    doc.text(this.translate.instant('consent.pdf.title'), pageWidth / 2, y, {
      align: 'center',
    });
    y += doc.getTextDimensions('T', {
      fontSize: PDF_CONFIG.fontSizes.headerTitle,
    }).h;
    doc
      .setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'normal')
      .setFontSize(PDF_CONFIG.fontSizes.headerSubtitle)
      .setTextColor(PDF_CONFIG.colors.subtitle);
    doc.text(data.casinoName, pageWidth / 2, y, { align: 'center' });
    y +=
      doc.getTextDimensions('T', {
        fontSize: PDF_CONFIG.fontSizes.headerSubtitle,
      }).h + 5;
    const drawInfo = (labelKey: string, value: string) => {
      doc
        .setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'bold')
        .setFontSize(PDF_CONFIG.fontSizes.playerInfo)
        .setTextColor(PDF_CONFIG.colors.text);
      const label = this.translate.instant(labelKey);
      doc.text(label, PDF_CONFIG.margin, y);
      const labelWidth = doc.getTextWidth(label);
      doc.setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'normal');
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
    doc.setFont(this.fontsLoaded ? 'Arial' : 'helvetica', 'normal');
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
        const format = dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
        try {
          doc.addImage(canvas, format, xPos, yPos, imgWidth, imgHeight);
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
