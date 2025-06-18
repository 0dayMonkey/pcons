import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import { PDF_CONFIG } from './pdf.config';

type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';
type TextAlign = 'left' | 'center' | 'right' | 'justify';

export type StyleState = {
  fontName: string;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  color: string;
  bgColor: string | null;
  align: TextAlign;
};

export type DrawInstruction = {
  type: 'text' | 'pre' | 'bullet' | 'newline';
  content?: string;
  styles?: StyleState;
  indent?: number;
  spacing?: number;
};

@Injectable({
  providedIn: 'root',
})
export class PdfHtmlRendererService {
  constructor() {}

  public render(
    doc: jsPDF,
    html: string,
    x: number,
    y: number,
    options: { width: number },
    addPageIfNeeded: (h: number, y: number) => number
  ): number {
    const FONT_NAME = 'helvetica';
    const SERIF_FONT_NAME = 'times';
    const MONO_FONT_NAME = 'courier';
    const LINE_HEIGHT_RATIO = 1.4;
    const LIST_INDENT_WIDTH = 8;
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
    let justDrawnBullet = false;
    let bulletTextStartX = x;
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
            justDrawnBullet = false;
          }

          if (lineBuffer.length === 0) {
            if (justDrawnBullet) {
              currentX = bulletTextStartX;
              justDrawnBullet = false;
            } else {
              currentX = x;
              if (instruction.indent !== undefined) {
                currentX += instruction.indent;
              }
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
        justDrawnBullet = false;
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
        doc.setTextColor(styles.color);

        const bulletX = x + (instruction.indent || 0);
        const bulletSpacing = 4;

        doc.text(
          instruction.content,
          bulletX,
          currentY + (currentLineHeight * 0.7) / 2,
          { baseline: 'middle' }
        );

        const bulletWidth = doc.getTextWidth(instruction.content);
        bulletTextStartX = bulletX + bulletWidth + bulletSpacing;
        currentX = bulletTextStartX;
        justDrawnBullet = true;
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
}
