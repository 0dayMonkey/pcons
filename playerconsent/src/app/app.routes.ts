import { Routes } from '@angular/router';
import { LogoComponent } from './Components/Logo/logo.component';
import { ConsentComponent } from './Components/Consent/consent.component';

export const routes: Routes = [
  { path: 'logo', component: LogoComponent },
  { path: 'consent/:playerId', component: ConsentComponent },

  {
    path: '',

    component: LogoComponent,
  },
  {
    path: '**',
    redirectTo: '/logo',
  },
];
