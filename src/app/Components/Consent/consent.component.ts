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
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  PlayerDataService,
  PlayerData,
} from '../../Services/player-data.service';
import { ErrorHandlerService } from '../../Services/error-handler.service';
import { PdfService, ConsentPdfData } from '../../Services/pdf.service';
import { Subscription, take } from 'rxjs';

const PDF_UPLOAD_URL = 'http://localhost:4000/upload-pdf';
const SUCCESS_REDIRECT_DELAY_MS = 3000;

@Component({
  selector: 'app-consent',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, TranslateModule],
  templateUrl: './consent.component.html',
  styleUrls: ['./consent.component.scss'],
})
export class ConsentComponent implements OnInit, AfterViewInit, OnDestroy {
  consentId: string = 'CONSENT_FORM_ID';
  player: PlayerData | undefined;
  private currentPlayerId: string | null = null;
  private dataSubscription: Subscription | undefined;
  private uploadSubscription: Subscription | undefined;

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
  minTextSize: number = 12;
  maxTextSize: number = 30;
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
    private renderer: Renderer2,
    private translate: TranslateService,
    private playerDataService: PlayerDataService,
    private pdfService: PdfService,
    private errorHandlerService: ErrorHandlerService
  ) {
    this.player = this.playerDataService.getLoadingPlayerData();
  }

  ngOnInit(): void {
    this.currentPlayerId = this.route.snapshot.paramMap.get('playerId');
    if (this.currentPlayerId) {
      this.consentId = `CONSENT_${
        this.currentPlayerId
      }_${new Date().getTime()}`;
      this.loadPlayerData(this.currentPlayerId);
    } else {
      this.player = this.playerDataService.getFallbackPlayerData(null);
      this.errorHandlerService.handlePlayerIdError();
    }
  }

  private loadPlayerData(playerId: string): void {
    this.dataSubscription = this.playerDataService
      .fetchPlayerData(playerId)
      .subscribe((data) => {
        if (data) {
          this.player = data;
        } else {
          this.player = this.playerDataService.getFallbackPlayerData(playerId);
          this.errorHandlerService.handleApiError();
        }
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
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
    }
    if (this.uploadSubscription) {
      this.uploadSubscription.unsubscribe();
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

      this.signaturePad.clear();
      this.signatureDataUrl = null;
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

  decreaseTextSize(): void {
    if (this.currentTextSizeInPx > this.minTextSize) {
      this.currentTextSizeInPx--;
      this.applyTextSizeChangeSideEffects();
    }
  }

  increaseTextSize(): void {
    if (this.currentTextSizeInPx < this.maxTextSize) {
      this.currentTextSizeInPx++;
      this.applyTextSizeChangeSideEffects();
    }
  }

  onTextSizeSliderChange(): void {
    this.currentTextSizeInPx = Math.max(
      this.minTextSize,
      Math.min(this.maxTextSize, this.currentTextSizeInPx)
    );
    this.applyTextSizeChangeSideEffects();
  }

  private applyTextSizeChangeSideEffects(): void {
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
    this.clearSignature();
    setTimeout(() => {
      this.resizeSignaturePad();
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
    if (
      !this.player ||
      !this.isSubmitEnabled() ||
      this.buttonState !== 'idle'
    ) {
      if (this.buttonState !== 'idle') return;
      this.errorHandlerService.displayValidationAlert(
        this.hasScrolledToBottom,
        this.mandatoryCheckbox,
        this.signatureDataUrl
      );
      return;
    }

    this.buttonState = 'loading';

    const consentResponse: WebSocketMessage = {
      Action: 'Consent',
      PlayerId: this.currentPlayerId || undefined,
      Status: true,
    };
    this.webSocketService.sendMessage(consentResponse);

    const now = new Date();
    const consentDate = now.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const pdfData: ConsentPdfData = {
      playerData: this.player,
      rulesText: this.rulesText,
      mandatoryCheckboxChecked: this.mandatoryCheckbox,
      optionalCheckboxChecked: this.optionalCheckbox,
      signatureImageUrl: this.signatureDataUrl,
      consentDate: consentDate,
      generationDate: consentDate,
      consentFormId: this.consentId,
      currentTextSizeInPx: this.currentTextSizeInPx,
      scaledCheckboxLabelSize: this.getScaledCheckboxLabelSize(),
    };

    try {
      const pdfBlob = await this.pdfService.generateConsentPdfAsBlob(pdfData);
      const formData = new FormData();
      const pdfFileName = `Consentement_${this.player.lastName}_${this.player.firstName}_${this.currentPlayerId}.pdf`;
      formData.append('pdfFile', pdfBlob, pdfFileName);
      formData.append('playerId', this.currentPlayerId || 'unknown');
      formData.append('consentId', this.consentId);

      this.uploadSubscription = this.http
        .post(PDF_UPLOAD_URL, formData)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.buttonState = 'success';
            this.navigationTimer = setTimeout(() => {
              this.router.navigate(['/logo'], { skipLocationChange: true });
              this.buttonState = 'idle';
            }, SUCCESS_REDIRECT_DELAY_MS);
          },
          error: () => {
            this.errorHandlerService.handlePdfUploadError();
            this.buttonState = 'idle';
          },
        });
    } catch (error) {
      this.errorHandlerService.handlePdfGenerationError();
      this.buttonState = 'idle';
    }
  }

  get playerLastName(): string {
    return this.player
      ? this.player.lastName
      : this.translate.instant('generic.loading');
  }

  get playerFirstName(): string {
    return this.player
      ? this.player.firstName
      : this.translate.instant('generic.loading');
  }

  get playerBirthDate(): string {
    return this.player
      ? this.player.birthDate
      : this.translate.instant('generic.loading');
  }

  get playerCardIdNumber(): string {
    return this.player
      ? this.player.id
      : this.translate.instant('generic.loading');
  }

  get playerPhotoUrl(): string {
    return this.player
      ? this.player.photoUrl
      : `https://placehold.co/100x100/E0E0E0/757575?text=${this.translate.instant(
          'generic.loading'
        )}`;
  }
}
