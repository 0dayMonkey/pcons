import { Component } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-logo',
  standalone: true,
  imports: [],
  templateUrl: './logo.component.html',
  styleUrls: ['./logo.component.scss'],
})
export class LogoComponent {
  iframeSrc: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {
    const unsafeIframeSrc = 'assets/logo_page/logo.png';
    this.iframeSrc =
      this.sanitizer.bypassSecurityTrustResourceUrl(unsafeIframeSrc);
  }
}
