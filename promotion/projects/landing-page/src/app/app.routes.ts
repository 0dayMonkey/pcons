import { Routes } from '@angular/router';
import { PromoListComponent } from './components/promo-list/promo-list.component';
import { TestComponent } from './components/test/test.component';

export const routes: Routes = [
  {
    path: 'LandingPage',
    component: TestComponent,
  },
  {
    path: '',
    redirectTo: 'LandingPage',
    pathMatch: 'full',
  },
];
