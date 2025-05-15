import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  Renderer2,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import SignaturePad from 'signature_pad';

// (Interfaces pour la réponse de l'API - inchangées)
interface RandomUserName {
  title: string;
  first: string;
  last: string;
}

interface RandomUserDob {
  date: string;
  age: number;
}

interface RandomUser {
  name: RandomUserName;
  dob: RandomUserDob;
}

interface RandomUserResponse {
  results: RandomUser[];
}

@Component({
  selector: 'app-consent',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './consent.component.html',
  styleUrls: ['./consent.component.scss'],
})
export class ConsentComponent implements OnInit, AfterViewInit, OnDestroy {
  consentId: string = 'CONSENT12345';
  firstName: string = 'Chargement...';
  lastName: string = 'Chargement...';
  birthDate: string = 'YYYY-MM-DD';
  cardIdType: string = 'National ID';
  // Valeur initiale pour cardIdNumber, sera remplacée dans ngOnInit
  cardIdNumber: string = 'Génération...';
  playerPhotoUrl: string = 'https://thispersondoesnotexist.com/';

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
  currentTextSize: 'small' | 'medium' | 'large' = 'medium';

  @ViewChild('signaturePadCanvas')
  signaturePadCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('rulesBody') rulesBody!: ElementRef<HTMLDivElement>;
  private signaturePad!: SignaturePad;
  private resizeObserver!: ResizeObserver;

  constructor(private renderer: Renderer2, private http: HttpClient) {}

  ngOnInit(): void {
    this.fetchAndSetUserData();
    // Générer et assigner le cardIdNumber aléatoire
    this.cardIdNumber = this.generateRandomCardIdNumber();
  }

  private generateRandomCardIdNumber(): string {
    const min = 1111111;
    const max = 9999999;
    // Génère un nombre entier aléatoire entre min et max (inclus)
    const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
    return randomNumber.toString(); // Convertit en chaîne de caractères
  }

  fetchAndSetUserData(): void {
    const apiUrl = 'https://randomuser.me/api/?inc=name,dob&noinfo';
    this.http.get<RandomUserResponse>(apiUrl).subscribe({
      next: (apiData) => {
        if (apiData.results && apiData.results.length > 0) {
          const userFromApi = apiData.results[0];

          this.firstName = userFromApi.name.first;
          this.lastName = userFromApi.name.last;

          const birthDateFromApi = new Date(userFromApi.dob.date);
          this.birthDate = birthDateFromApi.toISOString().split('T')[0];
        } else {
          console.warn(
            "API randomuser.me n'a pas retourné les données attendues. Utilisation des valeurs par défaut pour nom/date."
          );
          this.firstName = 'John';
          this.lastName = 'Doe';
          this.birthDate = '1990-01-01';
        }
      },
      error: (err) => {
        console.error(
          'Erreur lors de la récupération des données utilisateur :',
          err
        );
        this.firstName = 'John';
        this.lastName = 'Doe';
        this.birthDate = '1990-01-01';
      },
    });
  }

  // ... (ngAfterViewInit, ngOnDestroy, et toutes vos autres méthodes restent ici)
  // initializeSignaturePad, resizeSignaturePad, clearSignature, onRulesScroll, checkScroll, setTextSize, isSubmitEnabled, onSubmit

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
      this.resizeSignaturePad();
    });
    if (
      this.signaturePadCanvas &&
      this.signaturePadCanvas.nativeElement.parentElement
    ) {
      this.resizeObserver.observe(
        this.signaturePadCanvas.nativeElement.parentElement
      );
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
      this.signaturePadCanvas &&
      this.signaturePadCanvas.nativeElement.parentElement
    ) {
      this.resizeObserver.unobserve(
        this.signaturePadCanvas.nativeElement.parentElement
      );
    }
    if (this.signaturePad) {
      this.signaturePad.off();
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
        if (!this.signaturePad.isEmpty()) {
          this.signatureDataUrl = this.signaturePad.toDataURL();
        } else {
          this.signatureDataUrl = null;
        }
      });
      this.resizeSignaturePad();
    }
  }

  resizeSignaturePad(): void {
    if (this.signaturePad && this.signaturePadCanvas) {
      const canvas = this.signaturePadCanvas.nativeElement;
      const parent = canvas.parentElement;
      if (parent) {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const currentData = this.signaturePad.isEmpty()
          ? null
          : this.signaturePad.toDataURL();

        canvas.width = parent.offsetWidth * ratio;
        canvas.height = parent.offsetHeight * ratio;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(ratio, ratio);
        }

        if (currentData) {
          this.signaturePad.fromDataURL(currentData);
          this.signatureDataUrl = currentData;
        } else {
          this.signaturePad.clear();
          this.signatureDataUrl = null;
        }
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
    if (this.rulesBody) {
      const el = this.rulesBody.nativeElement;
      const threshold = 10;
      if (el.scrollHeight - el.scrollTop <= el.clientHeight + threshold) {
        this.hasScrolledToBottom = true;
      }
    }
  }

  setTextSize(size: 'small' | 'medium' | 'large'): void {
    this.currentTextSize = size;
    this.hasScrolledToBottom = false;
    setTimeout(() => this.checkScroll(), 0);
  }

  isSubmitEnabled(): boolean {
    return (
      this.mandatoryCheckbox &&
      !!this.signatureDataUrl &&
      this.hasScrolledToBottom
    );
  }

  onSubmit(): void {
    if (this.isSubmitEnabled()) {
      console.log('Consentement soumis');
      console.log('ID Consentement:', this.consentId);
      console.log('Prénom:', this.firstName); // Modifié pour correspondre aux propriétés
      console.log('Nom:', this.lastName); // Modifié pour correspondre aux propriétés
      console.log('Date de naissance:', this.birthDate);
      console.log('Type ID Carte:', this.cardIdType); // Ajout pour voir la valeur
      console.log('Numéro ID Carte:', this.cardIdNumber); // Ajout pour voir la valeur
      console.log('Checkbox Obligatoire:', this.mandatoryCheckbox);
      console.log('Checkbox Optionnelle:', this.optionalCheckbox);
      console.log('Signature:', this.signatureDataUrl ? 'Présente' : 'Absente');
      console.log("Défilé jusqu'en bas:", this.hasScrolledToBottom);
      alert('Consentement soumis (simulation)');
    } else {
      let message = 'Validation impossible:';
      if (!this.hasScrolledToBottom)
        message += '\n- Veuillez lire toutes les conditions.';
      if (!this.mandatoryCheckbox)
        message += '\n- La case de consentement obligatoire doit être cochée.';
      if (!this.signatureDataUrl) message += '\n- La signature est requise.';
      alert(message);
    }
  }
}
