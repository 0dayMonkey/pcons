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
import {
  HttpClient,
  HttpClientModule,
  HttpHeaders,
} from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import SignaturePad from 'signature_pad';
import {
  AppWebSocketService,
  WebSocketMessage,
} from '../../Services/websocket.service';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as Handlebars from 'handlebars';

interface PlayerData {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  photoUrl: string;
}

@Component({
  selector: 'app-consent',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './consent.component.html',
  styleUrls: ['./consent.component.scss'],
})
export class ConsentComponent implements OnInit, AfterViewInit, OnDestroy {
  consentId: string = 'CONSENT_FORM_ID';
  firstName: string = 'Chargement...';
  lastName: string = 'Chargement...';
  birthDate: string = 'YYYY-MM-DD';
  cardIdType: string = 'National ID';
  cardIdNumber: string = 'Chargement...';
  playerPhotoUrl: string =
    'https://placehold.co/100x100/E0E0E0/757575?text=Chargement';
  private currentPlayerId: string | null = null;

  rulesText: string = `
    1. Qui est responsable du traitement des données à caractère personnel ?
    Le responsable du traitement des données à caractère personnel est GOLDEN PALACE CASINO BSM sas dont le siège social est établi à Place de la République 62200 Boulogne-sur-Mer (849 457 163 RCS Boulogne-sur-Mer) ci-après « l'Exploitant ». L'Exploitant fait partie du Groupe Golden Palace dont les membres sont actifs dans le secteur des jeux de hasard et paris sportifs, y compris en ligne.
    2. Quelles données à caractère personnel?
    L'Exploitant collecte et traite les données à caractère personnel suivantes : Nom, Prénom, Genre, Date et lieu de naissance, Nationalité, Profession, Numéro de gsm, Photos, Images enregistrées par des caméras, Email, Numéro national, Adresse.
    3. Pourquoi nous collectons vos données à caractère personnel?
    Ces données sont traitées aux fins suivantes : Pour nous conformer à nos obligations légales; Dans le cadre de l'exécution de nos liens contractuels et différents objectifs organisationnels et d'affaires (tels que, la gestion des comptes, de services informatiques...); Gestion des risques et contrôles de qualité; Pour vous tenir informés des activités commerciales et sociales de l'Exploitant ou des autres membres du Golden Palace Groupe, par voie de communications électroniques (sms, e-mail, réseaux sociaux....).
    4. Qui aura accès à vos données à caractère personnel?
    Plusieurs entités peuvent avoir accès à vos données à caractère personnel: Les membres du Golden Palace Groupe; La Commission des jeux de hasard; Des fournisseurs belges, français et des fournisseurs situés dans l'Union européenne et auxquels nous faisons appel.
    5. Mesures de sécurité
    Le responsable de traitement a pris des mesures techniques et organisationnelles afin de garantir la sécurité de traitement de vos données. En cas de fuite de données personnelles, vous serez informé dans un délai de 72h suivant la découverte de la fuite.
    6. Durée de conservation
    Vos données personnelles sont conservées pour une durée de 10 ans.
    7. Droits d'accès et de rectification
    Vous avez le droit : De demander l'accès à vos données à caractère personnel; De demander la rectification de vos données à caractère personnel; De demander l'effacement de vos données à caractère personnel; De demander une limitation du traitement; De vous opposer au traitement; A la portabilité de vos données. Vous disposez également du droit d'introduire une réclamation auprès de l'autorité de contrôle. Pour toute question relative à la protection des données à caractère personnel, vous pouvez vous adresser par courrier postal à l'adresse postale de l'Exploitant, Place de la République 62200 Boulogne-sur-Mer ou par courrier électronique à serge.sacre@citexar.be avec une copie de votre carte d'identité.
    8. Copie et consultation
    Vous déclarez avoir reçu une copie électronique ou un support papier de ce document « Règles générales » et « Protection de la vie privée ». Notre politique de vie privée est consultable à tout moment sur le lien suivant: https://www.goldenpalace.fr
    (Texte additionnel pour assurer le défilement)
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. Praesent libero. Sed cursus ante dapibus diam. Sed nisi. Nulla quis sem at nibh elementum imperdiet. Duis sagittis ipsum. Praesent mauris. Fusce nec tellus sed augue semper porta. Mauris massa. Vestibulum lacinia arcu eget nulla. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Curabitur sodales ligula in libero.
    Sed dignissim lacinia nunc. Curabitur tortor. Pellentesque nibh. Aenean quam. In scelerisque sem at dolor. Maecenas mattis. Sed convallis tristique sem. Proin ut ligula vel nunc egestas porttitor. Morbi lectus risus, iaculis vel, suscipit quis, luctus non, massa. Fusce ac turpis quis ligula lacinia aliquet. Mauris ipsum. Nulla metus metus, ullamcorper vel, tincidunt sed, euismod in, nibh. Quisque volutpat condimentum velit. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos.
    Fin des conditions.
      `;

  mandatoryCheckbox: boolean = false;
  optionalCheckbox: boolean = false;
  signatureDataUrl: string | null = null;
  hasScrolledToBottom: boolean = false;
  currentTextSizeInPx: number = 16;
  buttonState: 'idle' | 'loading' | 'success' = 'idle';
  isSignaturePadEnlarged: boolean = false;

  private baseCheckboxLabelSizePx: number = 12;
  private defaultConditionsTextSizePx: number = 16;

  @ViewChild('signaturePadCanvas')
  signaturePadCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('rulesBody') rulesBody!: ElementRef<HTMLDivElement>;
  @ViewChild('signaturePadWrapper')
  signaturePadWrapper!: ElementRef<HTMLDivElement>;

  private signaturePad!: SignaturePad;
  private resizeObserver!: ResizeObserver;
  private navigationTimer: any;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private webSocketService: AppWebSocketService,
    private renderer: Renderer2
  ) {}

  ngOnInit(): void {
    this.currentPlayerId = this.route.snapshot.paramMap.get('playerId');
    if (this.currentPlayerId) {
      this.fetchAndSetUserData(this.currentPlayerId);
      this.consentId = `CONSENT_${
        this.currentPlayerId
      }_${new Date().getTime()}`;
    } else {
      this.firstName = 'Erreur';
      this.lastName = 'ID Joueur';
      this.birthDate = 'N/A';
      this.cardIdNumber = 'N/A';
      this.playerPhotoUrl =
        'https://placehold.co/100x100/FF0000/FFFFFF?text=Erreur+ID';
    }
  }

  fetchAndSetUserData(playerId: string): void {
    const apiUrl = `http://localhost:3000/player/${playerId}`;
    this.http.get<PlayerData>(apiUrl).subscribe({
      next: (playerData) => {
        this.firstName = playerData.firstName;
        this.lastName = playerData.lastName;
        this.birthDate = playerData.birthDate;
        this.playerPhotoUrl = playerData.photoUrl;
        this.cardIdNumber = playerData.id;
      },
      error: (err) => {
        this.firstName = 'N/A';
        this.lastName = 'N/A';
        this.birthDate = 'N/A';
        this.cardIdNumber = playerId;
        this.playerPhotoUrl =
          'https://placehold.co/100x100/FF8C00/FFFFFF?text=API+Error';
      },
    });
  }

  ngAfterViewInit(): void {
    this.initializeSignaturePad();
    this.checkScroll();
    if (this.rulesBody) {
      this.rulesBody.nativeElement.addEventListener(
        'scroll',
        this.onRulesScroll.bind(this)
      );
    }
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
    if (this.rulesBody) {
      this.rulesBody.nativeElement.removeEventListener(
        'scroll',
        this.onRulesScroll.bind(this)
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

      this.signaturePad.clear(); // Efface la signature et applique le fond
      this.signatureDataUrl = null; // La signature est effacée, donc pas de data URL
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
    if (this.rulesBody) {
      const el = this.rulesBody.nativeElement;
      const threshold = 10;
      this.hasScrolledToBottom =
        el.scrollHeight - el.scrollTop <= el.clientHeight + threshold;
    }
  }

  onTextSizeChange(event: Event): void {
    const sliderValue = (event.target as HTMLInputElement).value;
    this.currentTextSizeInPx = parseInt(sliderValue, 10);
    this.hasScrolledToBottom = false;
    setTimeout(() => this.checkScroll(), 0);
  }

  getScaledCheckboxLabelSize(): number {
    const scaleFactor =
      this.currentTextSizeInPx / this.defaultConditionsTextSizePx;
    let scaledSize = this.baseCheckboxLabelSizePx * scaleFactor;
    scaledSize = Math.max(10, Math.min(scaledSize, 22));
    return scaledSize;
  }

  toggleSignaturePadSize(): void {
    this.isSignaturePadEnlarged = !this.isSignaturePadEnlarged;
    // Il est crucial d'appeler clearSignature AVANT que le ResizeObserver ne déclenche resizeSignaturePad,
    // ou de s'assurer que resizeSignaturePad efface toujours.
    // L'appel à resizeSignaturePad via setTimeout permet au CSS de s'appliquer d'abord.
    this.clearSignature(); // Effacer la signature immédiatement au changement d'état
    setTimeout(() => {
      this.resizeSignaturePad(); // Redimensionne et réapplique le fond
    }, 50);
  }

  isSubmitEnabled(): boolean {
    return (
      this.mandatoryCheckbox &&
      !!this.signatureDataUrl &&
      this.hasScrolledToBottom
    );
  }

  async onSubmit(): Promise<void> {
    if (this.isSignaturePadEnlarged) {
      this.toggleSignaturePadSize();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (!this.isSubmitEnabled() || this.buttonState !== 'idle') {
      if (this.buttonState !== 'idle') return;
      let message = 'Validation impossible:';
      if (!this.hasScrolledToBottom)
        message += '\n- Veuillez lire toutes les conditions.';
      if (!this.mandatoryCheckbox)
        message += '\n- La case de consentement obligatoire doit être cochée.';
      if (!this.signatureDataUrl) message += '\n- La signature est requise.';
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
      const pdfFileName = `Consentement_${this.lastName}_${this.firstName}_${this.currentPlayerId}.pdf`;
      formData.append('pdfFile', pdfBlob, pdfFileName);
      formData.append('playerId', this.currentPlayerId || 'unknown');
      formData.append('consentId', this.consentId);

      const uploadUrl = 'http://localhost:4000/upload-pdf';

      this.http.post(uploadUrl, formData).subscribe({
        next: (response) => {
          this.buttonState = 'success';
          this.navigationTimer = setTimeout(() => {
            this.router.navigate(['/logo']);
            this.buttonState = 'idle';
          }, 3000);
        },
        error: (err) => {
          console.error("Erreur lors de l'envoi du PDF au serveur:", err);
          alert(
            "Erreur lors de l'envoi du PDF au serveur. Vérifiez la console pour plus de détails."
          );
          this.buttonState = 'idle';
        },
      });
    } catch (error) {
      console.error('Erreur lors de la génération du PDF :', error);
      alert('Erreur lors de la génération du PDF.');
      this.buttonState = 'idle';
    }
  }

  private async generateConsentPdfAsBlob(): Promise<Blob> {
    const templateString = await this.http
      .get('assets/template/template.html', { responseType: 'text' })
      .toPromise();

    if (!templateString) {
      throw new Error("Le template HTML n'a pas pu être chargé.");
    }

    const template = Handlebars.compile(templateString);
    const now = new Date();
    const consentDate = now.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const generationDate = consentDate;

    const data = {
      lastName: this.lastName,
      firstName: this.firstName,
      birthDate: this.birthDate,
      playerId: this.currentPlayerId || 'N/A',
      playerPhotoUrl: this.playerPhotoUrl,
      consentText: this.rulesText,
      mandatoryCheckboxChecked: this.mandatoryCheckbox,
      optionalCheckboxChecked: this.optionalCheckbox,
      signatureImageUrl: this.signatureDataUrl,
      consentDate: consentDate,
      generationDate: generationDate,
      consentFormId: this.consentId,
    };

    const processedHtml = template(data);
    const printableElement = document.createElement('div');
    printableElement.style.position = 'absolute';
    printableElement.style.left = '-9999px';
    printableElement.style.top = '0px';
    printableElement.innerHTML = processedHtml;
    document.body.appendChild(printableElement);

    await new Promise((resolve) => setTimeout(resolve, 300));

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
          data.playerPhotoUrl &&
          data.playerPhotoUrl.startsWith('data:image')
        ) {
          playerPhotoImg.src = data.playerPhotoUrl;
        }
        const signatureImg = clonedDoc.querySelector(
          '.signature-image'
        ) as HTMLImageElement;
        if (signatureImg && data.signatureImageUrl) {
          signatureImg.src = data.signatureImageUrl;
        }
        const preElementClone = clonedDoc.querySelector(
          '.conditions-content pre'
        ) as HTMLElement;
        if (preElementClone) {
          preElementClone.style.fontSize = this.currentTextSizeInPx + 'px';
        }
        const checkboxLabelSpans = clonedDoc.querySelectorAll(
          '.checkbox-group label span'
        ) as NodeListOf<HTMLElement>;
        checkboxLabelSpans.forEach((span) => {
          span.style.fontSize = this.getScaledCheckboxLabelSize() + 'px';
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
