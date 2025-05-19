import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as Handlebars from 'handlebars';
import { PlayerData } from './player-data.service';

export interface ConsentPdfData {
  playerData: PlayerData;
  rulesText: string;
  mandatoryCheckboxChecked: boolean;
  optionalCheckboxChecked: boolean;
  signatureImageUrl: string | null;
  consentDate: string;
  generationDate: string;
  consentFormId: string;
  currentTextSizeInPx: number;
  scaledCheckboxLabelSize: number;
}

const PDF_RENDER_DELAY_MS = 300;

@Injectable({
  providedIn: 'root',
})
export class PdfService {
  constructor(private http: HttpClient) {}

  async generateConsentPdfAsBlob(data: ConsentPdfData): Promise<Blob> {
    const templateString = await this.http
      .get('assets/template/template.html', { responseType: 'text' })
      .toPromise();

    if (!templateString) {
      throw new Error("Le template HTML n'a pas pu être chargé.");
    }

    const template = Handlebars.compile(templateString);
    const templateData = {
      lastName: data.playerData.lastName,
      firstName: data.playerData.firstName,
      birthDate: data.playerData.birthDate,
      playerId: data.playerData.id,
      playerPhotoUrl: data.playerData.photoUrl,
      consentText: data.rulesText,
      mandatoryCheckboxChecked: data.mandatoryCheckboxChecked,
      optionalCheckboxChecked: data.optionalCheckboxChecked,
      signatureImageUrl: data.signatureImageUrl,
      consentDate: data.consentDate,
      generationDate: data.generationDate,
      consentFormId: data.consentFormId,
    };

    const processedHtml = template(templateData);
    const printableElement = document.createElement('div');
    printableElement.style.position = 'absolute';
    printableElement.style.left = '-9999px';
    printableElement.style.top = '0px';
    printableElement.innerHTML = processedHtml;
    document.body.appendChild(printableElement);

    await new Promise((resolve) => setTimeout(resolve, PDF_RENDER_DELAY_MS));

    const containerToPrint = printableElement.querySelector(
      '.container'
    ) as HTMLElement;
    if (!containerToPrint) {
      document.body.removeChild(printableElement);
      throw new Error(
        "Élément '.container' non trouvé dans le template rendu."
      );
    }

    const canvas = await html2canvas(containerToPrint, {
      scale: 2,
      useCORS: true,
      logging: false,
      width: containerToPrint.offsetWidth,
      height: containerToPrint.offsetHeight,
      windowWidth: containerToPrint.scrollWidth,
      windowHeight: containerToPrint.scrollHeight,
      onclone: (clonedDoc) => {
        const playerPhotoImg = clonedDoc.querySelector(
          '.player-photo'
        ) as HTMLImageElement;
        if (
          playerPhotoImg &&
          templateData.playerPhotoUrl &&
          templateData.playerPhotoUrl.startsWith('data:image')
        ) {
          playerPhotoImg.src = templateData.playerPhotoUrl;
        }
        const signatureImg = clonedDoc.querySelector(
          '.signature-image'
        ) as HTMLImageElement;
        if (signatureImg && templateData.signatureImageUrl) {
          signatureImg.src = templateData.signatureImageUrl;
        }
        const preElementClone = clonedDoc.querySelector(
          '.consent-text pre'
        ) as HTMLElement;
        if (preElementClone) {
          preElementClone.style.setProperty(
            'font-size',
            `${data.currentTextSizeInPx}px`,
            'important'
          );
        }
        const checkboxLabelSpans = clonedDoc.querySelectorAll(
          '.checkbox-item span.checked-text'
        ) as NodeListOf<HTMLElement>;
        checkboxLabelSpans.forEach((span) => {
          const parentLabel = span.closest('.checkbox-item');
          if (parentLabel) {
            const mainTextNode = Array.from(parentLabel.childNodes).find(
              (node) =>
                node.nodeType === Node.TEXT_NODE &&
                node.textContent?.trim() !== ''
            );
            if (mainTextNode) {
              const newSpan = clonedDoc.createElement('span');
              newSpan.style.setProperty(
                'font-size',
                `${data.scaledCheckboxLabelSize}px`,
                'important'
              );
              newSpan.textContent = mainTextNode.textContent;
              parentLabel.replaceChild(newSpan, mainTextNode);
            }
          }
        });
      },
    });

    document.body.removeChild(printableElement);

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const ratio = canvasWidth / pdfWidth;
    const projectedCanvasHeight = canvasHeight / ratio;
    let position = 0;
    let heightLeft = projectedCanvasHeight;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, projectedCanvasHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position -= pdfHeight;
      pdf.addPage();
      pdf.addImage(
        imgData,
        'PNG',
        0,
        position,
        pdfWidth,
        projectedCanvasHeight
      );
      heightLeft -= pdfHeight;
    }
    return pdf.output('blob');
  }
}
