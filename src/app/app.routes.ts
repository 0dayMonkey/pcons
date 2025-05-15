import { Routes } from '@angular/router';
import { LogoComponent } from './Components/Logo/logo.component';
import { ConsentComponent } from './Components/Consent/consent.component';

export const routes: Routes = [
  { path: 'logo', component: LogoComponent },
  { path: 'consent/:playerId', component: ConsentComponent }, // Modifié pour inclure playerId
  { path: '', redirectTo: '/logo', pathMatch: 'full' },
  { path: '**', redirectTo: '/logo' },
];
