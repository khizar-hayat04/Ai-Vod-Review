import { Routes } from '@angular/router';
import { LandingComponent } from './landing.component';
import { HostComponent } from './host.component';
import { GuestUploadComponent } from './guest-upload.component';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'host', component: HostComponent },
  { path: 'host/:sessionId', component: HostComponent },
  { path: 'guest', component: GuestUploadComponent },
  { path: 'upload/:sessionId', component: GuestUploadComponent },
  { path: '**', redirectTo: '' }
];
