import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  OnInit,
  Renderer2,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import SignaturePad from 'signature_pad';
import {
  AppWebSocketService,
  WebSocketMessage,
} from '../../Services/websocket.service';
import jsPDF from 'jspdf';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../Services/api.service';

@Component({
  selector: 'app-consent',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, TranslateModule],
  templateUrl: './consent.component.html',
  styleUrls: ['./consent.component.scss'],
})
export class ConsentComponent implements OnInit, AfterViewInit, OnDestroy {
  consentId: string = 'CONSENT_FORM_ID';
  firstName: string = '';
  lastName: string = '';
  birthDate: string = '';
  cardIdNumber: string = '';
  playerPhotoUrl: string = 'https://placehold.co/100x100/E0E0E0/757575?text=';
  private currentPlayerId: string | null = null;

  rulesText: string = `
    1. Qui est responsable du traitement des données à caractère personnel ?
    Le responsable du traitement des données à caractère personnel est GOLDEN PALACE CASINO BSM sas dont le siège social est établi à Place de la République 62200 Boulogne-sur-Mer (849 457 163 RCS Boulogne-sur-Mer) ci-après « l'Exploitant ». L'Exploitant fait partie du Groupe Golden Palace dont les membres sont actifs dans le secteur des jeux de hasard et paris sportifs, y compris en ligne.
    2. Quelles données à caractère personnel?
    L'Exploitant collecte et traite les données à caractère personnel suivantes :
    * Nom
    * Prénom
    * Genre
    * Date et lieu de naissance
    * Nationalité
    * Profession
    * Numéro de gsm
    * Photos
    * Images enregistrées par des caméras
    * Email
    * Numéro national
    * Adresse.
    3. Pourquoi nous collectons vos données à caractère personnel?
    Ces données sont traitées aux fins suivantes :
    * Pour nous conformer à nos obligations légales;
    * Dans le cadre de l'exécution de nos liens contractuels et différents objectifs organisationnels et d'affaires (tels que, la gestion des comptes, de services informatiques...);
    * Gestion des risques et contrôles de qualité;
    * Pour vous tenir informés des activités commerciales et sociales de l'Exploitant ou des autres membres du Golden Palace Groupe, par voie de communications électroniques (sms, e-mail, réseaux sociaux....).
    4. Qui aura accès à vos données à caractère personnel?
    Plusieurs entités peuvent avoir accès à vos données à caractère personnel:
    * Les membres du Golden Palace Groupe;
    * La Commission des jeux de hasard;
    * Des fournisseurs belges, français et des fournisseurs situés dans l'Union européenne et auxquels nous faisons appel.
    5. Mesures de sécurité
    Le responsable de traitement a pris des mesures techniques et organisationnelles afin de garantir la sécurité de traitement de vos données. En cas de fuite de données personnelles, vous serez informé dans un délai de 72h suivant la découverte de la fuite.
    6. Durée de conservation
    Vos données personnelles sont conservées pour une durée de 10 ans.
    7. Droits d'accès et de rectification
    Vous avez le droit :
    * De demander l'accès à vos données à caractère personnel
    * De demander la rectification de vos données à caractère personnel
    * De demander l'effacement de vos données à caractère personnel
    * De demander une limitation du traitement
    * De vous opposer au traitement
    * A la portabilité de vos données.
    Vous disposez également du droit d'introduire une réclamation auprès de l'autorité de contrôle. Pour toute question relative à la protection des données à caractère personnel, vous pouvez vous adresser par courrier postal à l'adresse postale de l'Exploitant, Place de la République 62200 Boulogne-sur-Mer ou par courrier électronique à serge.sacre@citexar.be avec une copie de votre carte d'identité.
    8. Copie et consultation
    Vous déclarez avoir reçu une copie électronique ou un support papier de ce document « Règles générales » et « Protection de la vie privée ». Notre politique de vie privée est consultable à tout moment sur le lien suivant: https://www.goldenpalace.fr
  `; // This text is NOT translated as per user request

  mandatoryCheckbox: boolean = false;
  optionalCheckbox: boolean = false;
  signatureDataUrl: string | null = null;
  hasReachedBottomOnce: boolean = false;

  readonly predefinedTextSizes = {
    small: 14,
    medium: 18,
    large: 22,
  };
  currentTextSizeInPx: number = this.predefinedTextSizes.medium;
  minTextSize: number = 12;
  maxTextSize: number = 30;

  buttonState: 'idle' | 'loading' | 'success' = 'idle';
  showValidationPopup: boolean = false;
  validationPopupMessage: string = ''; // Will be set in constructor

  private baseCheckboxLabelSizePx: number = 12;
  private defaultConditionsTextSizePx: number = this.predefinedTextSizes.medium;

  @ViewChild('signaturePadCanvas')
  signaturePadCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('rulesBody') rulesBody!: ElementRef<HTMLDivElement>;
  @ViewChild('signaturePadWrapper')
  signaturePadWrapper!: ElementRef<HTMLDivElement>;

  private signaturePad!: SignaturePad;
  private resizeObserver!: ResizeObserver;
  private navigationTimer: any;

  private initialPinchDistance: number = 0;
  private pinchStartFontSize: number = 0;
  private rulesBodyElement: HTMLDivElement | null = null;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private webSocketService: AppWebSocketService,
    private renderer: Renderer2,
    private translate: TranslateService,
    private apiservice: ApiService
  ) {
    this.playerPhotoUrl = `https://placehold.co/100x100/E0E0E0/757575?text=${this.translate.instant(
      'generic.loading'
    )}`;
    this.validationPopupMessage = this.translate.instant('alert.thankYou');
  }

  ngOnInit(): void {
    this.currentPlayerId = this.route.snapshot.paramMap.get('playerId');
    this.consentId = '29547';

    this.firstName = 'Joseph';
    this.lastName = 'Viens';
    this.birthDate = '23/07/1985';
    this.cardIdNumber = 'ID Card, THGNF2LN1, 04/02/2034';

    if (this.currentPlayerId) {
      // this.fetchAndSetUserData(this.currentPlayerId);
    } else {
      this.playerPhotoUrl = `https://placehold.co/100x100/FF0000/FFFFFF?text=${this.translate.instant(
        'generic.error'
      )}+ID`;
    }
    this.applyTextSizeChangeSideEffects();
  }

  fetchAndSetUserData(playerId: string): void {
    this.apiservice.getPlayerData(playerId).subscribe((playerData) => {
      // Values are hardcoded in ngOnInit for testing purposes
      // this.firstName = playerData.firstName;
      // this.lastName = playerData.lastName;
      // this.birthDate = playerData.birthDate;
      // this.cardIdNumber = playerId;
    });
  }

  ngAfterViewInit(): void {
    this.initializeSignaturePad();
    this.rulesBodyElement = this.rulesBody?.nativeElement || null;

    if (this.rulesBodyElement) {
      this.rulesBodyElement.addEventListener(
        'scroll',
        this.onRulesScroll.bind(this)
      );
      this.rulesBodyElement.addEventListener(
        'touchstart',
        this.onTouchStart.bind(this),
        { passive: false }
      );
      this.rulesBodyElement.addEventListener(
        'touchmove',
        this.onTouchMove.bind(this),
        { passive: false }
      );
      this.rulesBodyElement.addEventListener(
        'touchend',
        this.onTouchEnd.bind(this)
      );
    }
    this.checkScroll();

    this.resizeObserver = new ResizeObserver(() => {
      if (
        this.signaturePadWrapper &&
        this.signaturePadWrapper.nativeElement.offsetWidth > 0
      ) {
        this.resizeSignaturePad();
      }
    });
    if (this.signaturePadWrapper && this.signaturePadWrapper.nativeElement) {
      this.resizeObserver.observe(this.signaturePadWrapper.nativeElement);
    }
  }

  ngOnDestroy(): void {
    if (this.rulesBodyElement) {
      this.rulesBodyElement.removeEventListener(
        'scroll',
        this.onRulesScroll.bind(this)
      );
      this.rulesBodyElement.removeEventListener(
        'touchstart',
        this.onTouchStart.bind(this)
      );
      this.rulesBodyElement.removeEventListener(
        'touchmove',
        this.onTouchMove.bind(this)
      );
      this.rulesBodyElement.removeEventListener(
        'touchend',
        this.onTouchEnd.bind(this)
      );
    }
    if (
      this.resizeObserver &&
      this.signaturePadWrapper &&
      this.signaturePadWrapper.nativeElement
    ) {
      this.resizeObserver.unobserve(this.signaturePadWrapper.nativeElement);
    }
    if (this.signaturePad) {
      this.signaturePad.off();
    }
    if (this.navigationTimer) {
      clearTimeout(this.navigationTimer);
    }
  }

  private onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2 && this.rulesBodyElement) {
      event.preventDefault();
      this.initialPinchDistance = this.getDistanceBetweenTouches(event.touches);
      this.pinchStartFontSize = this.currentTextSizeInPx;
    }
  }

  private onTouchMove(event: TouchEvent): void {
    if (
      event.touches.length === 2 &&
      this.rulesBodyElement &&
      this.initialPinchDistance > 0
    ) {
      event.preventDefault();
      const currentDistance = this.getDistanceBetweenTouches(event.touches);
      const scaleFactor = currentDistance / this.initialPinchDistance;
      let newSize = this.pinchStartFontSize * scaleFactor;
      newSize = Math.max(this.minTextSize, Math.min(this.maxTextSize, newSize));

      if (Math.abs(this.currentTextSizeInPx - newSize) >= 0.5) {
        this.currentTextSizeInPx = Math.round(newSize);
        this.applyTextSizeChangeSideEffects();
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

  initializeSignaturePad(): void {
    if (this.signaturePadCanvas) {
      this.signaturePad = new SignaturePad(
        this.signaturePadCanvas.nativeElement,
        {
          backgroundColor: 'rgb(243, 244, 246)',
          penColor: 'rgb(0, 0, 0)',
          minWidth: 0.5,
          maxWidth: 2.5,
        }
      );
      this.signaturePad.addEventListener('beginStroke', () => {});
      this.signaturePad.addEventListener('endStroke', () => {
        this.signatureDataUrl = this.signaturePad.isEmpty()
          ? null
          : this.signaturePad.toDataURL();
      });
      this.resizeSignaturePad();
    }
  }

  resizeSignaturePad(): void {
    if (
      this.signaturePad &&
      this.signaturePadCanvas &&
      this.signaturePadWrapper
    ) {
      const canvas = this.signaturePadCanvas.nativeElement;
      const parentElement = this.signaturePadWrapper.nativeElement;

      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const parentWidth = parentElement.offsetWidth || 1;
      const parentHeight = parentElement.offsetHeight || 1;

      canvas.width = parentWidth * ratio;
      canvas.height = parentHeight * ratio;
      canvas.style.width = `${parentWidth}px`;
      canvas.style.height = `${parentHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(ratio, ratio);
      }

      if (this.signatureDataUrl) {
        const tempImg = new Image();
        tempImg.onload = () => {
          if (ctx) ctx.drawImage(tempImg, 0, 0, parentWidth, parentHeight);
        };
        tempImg.src = this.signatureDataUrl;
      } else {
        this.signaturePad.clear();
      }
    }
  }

  clearSignature(): void {
    if (this.signaturePad) {
      this.signaturePad.clear();
      this.signatureDataUrl = null;
    }
  }

  onRulesScroll(): void {
    this.checkScroll();
  }

  private checkScroll(): void {
    if (this.rulesBodyElement && !this.hasReachedBottomOnce) {
      const el = this.rulesBodyElement;
      const threshold = 10;
      if (el.scrollHeight - el.scrollTop <= el.clientHeight + threshold) {
        this.hasReachedBottomOnce = true;
      }
    }
  }

  setTextSize(sizeKey: 'small' | 'medium' | 'large'): void {
    this.currentTextSizeInPx = this.predefinedTextSizes[sizeKey];
    this.applyTextSizeChangeSideEffects();
  }

  private applyTextSizeChangeSideEffects(): void {
    this.currentTextSizeInPx = Math.max(
      this.minTextSize,
      Math.min(this.maxTextSize, this.currentTextSizeInPx)
    );
    setTimeout(() => this.checkScroll(), 0);
  }

  getScaledCheckboxLabelSize(): number {
    const scaleFactor =
      this.currentTextSizeInPx / this.defaultConditionsTextSizePx;
    let scaledSize = this.baseCheckboxLabelSizePx * scaleFactor;
    scaledSize = Math.max(10, Math.min(scaledSize, 22));
    return scaledSize;
  }

  isSubmitEnabled(): boolean {
    return (
      this.mandatoryCheckbox &&
      !!this.signatureDataUrl &&
      this.hasReachedBottomOnce
    );
  }

  async onSubmit(): Promise<void> {
    if (!this.isSubmitEnabled() || this.buttonState !== 'idle') {
      if (this.buttonState !== 'idle') return;
      let message = this.translate.instant('alert.validationImpossible');
      if (!this.hasReachedBottomOnce)
        message += `\n- ${this.translate.instant('alert.mustReadConditions')}`;
      if (!this.mandatoryCheckbox)
        message += `\n- ${this.translate.instant(
          'alert.mandatoryCheckboxRequired'
        )}`;
      if (!this.signatureDataUrl)
        message += `\n- ${this.translate.instant('alert.signatureRequired')}`;
      alert(message);
      return;
    }

    this.buttonState = 'loading';

    const consentResponse: WebSocketMessage = {
      Action: 'Consent',
      PlayerId: this.currentPlayerId || undefined,
      Status: true,
    };
    this.webSocketService.sendMessage(consentResponse);

    try {
      const pdfBlob = await this.generateConsentPdfAsBlob();
      const formData = new FormData();
      // pdfFileName is NOT translated as per user request
      const pdfFileName = `Consentement_${this.lastName}_${this.firstName}_${this.currentPlayerId}.pdf`;
      formData.append('pdfFile', pdfBlob, pdfFileName);
      formData.append('playerId', this.currentPlayerId || 'unknown');
      formData.append('consentId', this.consentId);

      const uploadUrl = 'http://localhost:4000/upload-pdf';

      this.http.post(uploadUrl, formData).subscribe({
        next: (response) => {
          this.buttonState = 'success';
          this.showValidationPopup = true;
          if (this.navigationTimer) {
            clearTimeout(this.navigationTimer);
          }
          this.navigationTimer = setTimeout(() => {
            this.showValidationPopup = false;
            this.router.navigate(['/logo'], { skipLocationChange: true });
            this.buttonState = 'idle';
            this.mandatoryCheckbox = false;
            this.optionalCheckbox = false;
            this.clearSignature();
            this.hasReachedBottomOnce = false;
            this.currentTextSizeInPx = this.predefinedTextSizes.medium;
            this.applyTextSizeChangeSideEffects();
            if (this.rulesBodyElement) this.rulesBodyElement.scrollTop = 0;
          }, 5000);
        },
        error: (err) => {
          console.error(
            this.translate.instant('consent.alert.pdfUploadError'),
            err
          );
          alert(this.translate.instant('consent.alert.pdfUploadErrorDetail'));
          this.buttonState = 'idle';
        },
      });
    } catch (error) {
      console.error(
        this.translate.instant('consent.alert.pdfGenerationError'),
        error
      );
      alert(this.translate.instant('consent.alert.pdfGenerationError'));
      this.buttonState = 'idle';
    }
  }

  private async generateConsentPdfAsBlob(): Promise<Blob> {
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

    const addPageIfNeeded = (requiredHeight: number) => {
      if (currentY + requiredHeight > pageHeight - margin - 10) {
        doc.addPage();
        currentY = margin;
      }
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text(this.translate.instant('consent.pdf.title'), margin, currentY);
    currentY += 12;

    const photoWidth = 30;
    const photoHeight = 30;
    const textBlockStartY = currentY;
    let playerDetailsY = textBlockStartY;

    const gapBetweenTextAndPhoto = 5;
    const playerInfoTextWidth =
      contentWidth - photoWidth - gapBetweenTextAndPhoto;
    const lineHeightForPlayerInfo = 7;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    const labelCol1X = margin;
    const valueCol1X = margin + 35;
    const labelCol2X = margin + playerInfoTextWidth / 2 + 2;
    const valueCol2X = labelCol2X + 20;

    doc.setFont('helvetica', 'bold');
    doc.text(
      this.translate.instant('consent.pdf.lastNameLabel'),
      labelCol1X,
      playerDetailsY
    );
    doc.setFont('helvetica', 'normal');
    doc.text(this.lastName, valueCol1X, playerDetailsY, {
      maxWidth: playerInfoTextWidth / 2 - 37,
    });

    doc.setFont('helvetica', 'bold');
    doc.text(
      this.translate.instant('consent.pdf.firstNameLabel'),
      labelCol2X,
      playerDetailsY
    );
    doc.setFont('helvetica', 'normal');
    doc.text(this.firstName, valueCol2X, playerDetailsY, {
      maxWidth: playerInfoTextWidth / 2 - 22,
    });
    playerDetailsY += lineHeightForPlayerInfo;

    doc.setFont('helvetica', 'bold');
    doc.text(
      this.translate.instant('consent.pdf.birthDateLabel'),
      labelCol1X,
      playerDetailsY
    );
    doc.setFont('helvetica', 'normal');
    doc.text(this.birthDate, valueCol1X, playerDetailsY, {
      maxWidth: playerInfoTextWidth / 2 - 37,
    });

    doc.setFont('helvetica', 'bold');
    doc.text(
      this.translate.instant('consent.pdf.playerIDLabel'),
      labelCol2X,
      playerDetailsY
    );
    doc.setFont('helvetica', 'normal');
    doc.text(this.cardIdNumber, valueCol2X, playerDetailsY, {
      maxWidth: playerInfoTextWidth / 2 - 22,
    });

    const textBlockActualHeight =
      playerDetailsY - textBlockStartY + lineHeightForPlayerInfo / 2;
    const photoAdjustmentUpwards = 15;
    const photoFinalY = textBlockStartY - photoAdjustmentUpwards;
    const photoX = margin + playerInfoTextWidth + gapBetweenTextAndPhoto;

    if (this.playerPhotoUrl && !this.playerPhotoUrl.includes('placehold.co')) {
      const img = new Image();
      img.src = this.playerPhotoUrl;
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            doc.addImage(
              img,
              'PNG',
              photoX,
              photoFinalY,
              photoWidth,
              photoHeight
            );
            resolve();
          };
          img.onerror = () => {
            doc.setFillColor(220, 220, 220);
            doc.rect(photoX, photoFinalY, photoWidth, photoHeight, 'F');
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(
              this.translate.instant('consent.pdf.photoPlaceholder'),
              photoX + photoWidth / 2,
              photoFinalY + photoHeight / 2,
              { align: 'center', baseline: 'middle' }
            );
            resolve();
          };
        });
      } catch (e) {
        doc.setFillColor(220, 220, 220);
        doc.rect(photoX, photoFinalY, photoWidth, photoHeight, 'F');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          this.translate.instant('consent.pdf.photoPlaceholder'),
          photoX + photoWidth / 2,
          photoFinalY + photoHeight / 2,
          { align: 'center', baseline: 'middle' }
        );
      }
    } else {
      doc.setFillColor(220, 220, 220);
      doc.rect(photoX, photoFinalY, photoWidth, photoHeight, 'F');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        this.translate.instant('consent.pdf.photoPlaceholder'),
        photoX + photoWidth / 2,
        photoFinalY + photoHeight / 2,
        { align: 'center', baseline: 'middle' }
      );
    }

    currentY =
      Math.max(
        textBlockStartY + textBlockActualHeight,
        photoFinalY + photoHeight
      ) + 5;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 10;

    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const splitRulesText = doc.splitTextToSize(this.rulesText, contentWidth);
    const rulesLineHeight = 4;
    for (const line of splitRulesText) {
      addPageIfNeeded(rulesLineHeight);
      doc.text(line, margin, currentY);
      currentY += rulesLineHeight;
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

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, checkboxSectionY, checkboxSize, checkboxSize, 'S');
    if (this.mandatoryCheckbox) {
      doc.setDrawColor(0, 0, 0);
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
    const asteriskChar = this.translate.instant('generic.requiredMarker'); // Using existing generic key
    doc.text(asteriskChar, manLabelX, tempY);
    manLabelX +=
      (doc.getStringUnitWidth(asteriskChar) * doc.getFontSize()) /
      doc.internal.scaleFactor;

    doc.setTextColor(0, 0, 0);
    const consentBoldText =
      ' ' + this.translate.instant('consent.pdf.consentLabel') + ' : ';
    doc.text(consentBoldText, manLabelX, tempY);
    manLabelX +=
      (doc.getStringUnitWidth(consentBoldText) * doc.getFontSize()) /
      doc.internal.scaleFactor;

    doc.setFont('helvetica', 'normal');
    const mainDeclarationText = this.translate.instant(
      'consent.pdf.mainDeclaration'
    );
    const requiredText = '   ' + this.translate.instant('generic.requiredText'); // Using existing generic key

    const originalManFontSize = doc.getFontSize();
    let currentManFont = doc.getFont().fontName;
    let currentManStyle = doc.getFont().fontStyle;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(originalManFontSize);
    const requiredTextWidth =
      (doc.getStringUnitWidth(requiredText.trimStart()) * originalManFontSize) / // use trimStart for width calculation
        doc.internal.scaleFactor +
      1;
    doc.setFont(currentManFont, currentManStyle);
    doc.setFontSize(originalManFontSize);

    const availableWidthForMainText =
      contentWidth -
      checkboxTextOffsetX -
      (manLabelX - initialManLabelX) -
      requiredTextWidth;
    const mainTextLines = doc.splitTextToSize(
      mainDeclarationText,
      availableWidthForMainText < 0
        ? contentWidth - checkboxTextOffsetX
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
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, checkboxSectionY, checkboxSize, checkboxSize, 'S');
    if (this.optionalCheckbox) {
      doc.setDrawColor(0, 0, 0);
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
    const communicationsBoldText =
      this.translate.instant('consent.pdf.communicationsLabel') + ' : ';
    doc.text(communicationsBoldText, optLabelX, tempY);
    optLabelX +=
      (doc.getStringUnitWidth(communicationsBoldText) * doc.getFontSize()) /
      doc.internal.scaleFactor;

    doc.setFont('helvetica', 'normal');
    const communicationsNormalText = this.translate.instant(
      'consent.pdf.mainDeclaration'
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
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(
      this.translate.instant('consent.pdf.signatureInfoTitle'),
      margin,
      currentY
    );
    currentY += 8;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 7;

    const sigInfoStartY = currentY;
    const signatureMaxHeight = 30;
    const infoGap = 5;
    const fixedInfoTextX = 95;
    const signatureMaxWidth = fixedInfoTextX - margin - infoGap;
    const infoTextX = fixedInfoTextX;
    const infoTextWidth = pageWidth - margin - infoTextX;
    const textInfoLineHeight = 5;

    let signatureActualHeight = 0;
    let signatureImgDataForPdf: HTMLImageElement | null = null;
    let signatureImgRenderWidth = 0;

    let signatureImgForPdfDataUrl = this.signatureDataUrl;

    if (this.signaturePad && !this.signaturePad.isEmpty()) {
      const points = this.signaturePad.toData();

      const tempCanvas = document.createElement('canvas');
      const originalCanvas = this.signaturePadCanvas.nativeElement;
      tempCanvas.width = originalCanvas.width;
      tempCanvas.height = originalCanvas.height;

      const tempSignaturePad = new SignaturePad(tempCanvas, {
        backgroundColor: 'rgba(0,0,0,0)',
        penColor: this.signaturePad.penColor,
        minWidth: this.signaturePad.minWidth,
        maxWidth: this.signaturePad.maxWidth,
      });
      tempSignaturePad.fromData(points);

      if (!tempSignaturePad.isEmpty()) {
        signatureImgForPdfDataUrl = tempSignaturePad.toDataURL('image/png');
      }
      tempSignaturePad.off();
    }

    if (signatureImgForPdfDataUrl) {
      const img = new Image();
      img.src = signatureImgForPdfDataUrl;
      try {
        await new Promise<void>((resolve) => {
          img.onload = () => {
            const aspectRatio = img.width / img.height;
            signatureImgRenderWidth = signatureMaxWidth;
            let h = signatureImgRenderWidth / aspectRatio;
            if (h > signatureMaxHeight) {
              h = signatureMaxHeight;
              signatureImgRenderWidth = h * aspectRatio;
            }
            signatureActualHeight = h;
            signatureImgDataForPdf = img;
            resolve();
          };
          img.onerror = () => {
            signatureActualHeight = signatureMaxHeight;
            resolve();
          };
        });
      } catch (e) {
        signatureActualHeight = signatureMaxHeight;
      }
    } else {
      signatureActualHeight = signatureMaxHeight;
    }

    const now = new Date();
    const consentDateFormatted = now.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const validUntilDate = new Date(now);
    validUntilDate.setFullYear(now.getFullYear() + 5);
    const validUntilDateFormatted = validUntilDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const infoItemsForPdf = [
      {
        label: this.translate.instant('consent.pdf.consentDateLabel'),
        value: consentDateFormatted,
      },
      {
        label: this.translate.instant('consent.pdf.validUntilLabel'),
        value: validUntilDateFormatted,
      },
      {
        label: this.translate.instant('consent.pdf.consentIdLabel'),
        value: this.consentId,
      },
    ];

    const textInfoBlockActualHeight =
      infoItemsForPdf.length * textInfoLineHeight;

    const overallSectionHeight = Math.max(
      signatureActualHeight,
      textInfoBlockActualHeight
    );

    const centeredSignatureY =
      sigInfoStartY + (overallSectionHeight - signatureActualHeight) / 2;
    const centeredTextInfoY_start =
      sigInfoStartY + (overallSectionHeight - textInfoBlockActualHeight) / 2;

    if (signatureImgDataForPdf) {
      doc.addImage(
        signatureImgDataForPdf,
        'PNG',
        margin,
        centeredSignatureY,
        signatureImgRenderWidth,
        signatureActualHeight
      );
    } else {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(
        margin,
        centeredSignatureY,
        signatureMaxWidth,
        signatureActualHeight,
        'S'
      );
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        this.translate.instant('consent.pdf.signatureNotProvided'),
        margin + signatureMaxWidth / 2,
        centeredSignatureY + signatureActualHeight / 2,
        { align: 'center', baseline: 'middle' }
      );
    }

    let currentTextInfoY = centeredTextInfoY_start;
    doc.setFontSize(9);

    infoItemsForPdf.forEach((item) => {
      let currentDrawX = infoTextX;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(item.label, currentDrawX, currentTextInfoY);

      const labelWidth =
        (doc.getStringUnitWidth(item.label) * doc.getFontSize()) /
        doc.internal.scaleFactor;
      currentDrawX += labelWidth + 1;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);

      doc.text(item.value, currentDrawX, currentTextInfoY, {
        maxWidth: infoTextWidth - (currentDrawX - infoTextX),
      });

      currentTextInfoY += textInfoLineHeight;
    });

    currentY = sigInfoStartY + overallSectionHeight + 10;

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `${this.translate.instant(
          'consent.pdf.pagePrefixLabel'
        )}${i}${this.translate.instant(
          'consent.pdf.pageSeparatorLabel'
        )}${totalPages}`,
        pageWidth - margin,
        pageHeight - margin + 7,
        { align: 'right' }
      );
    }
    return doc.output('blob');
  }
}
