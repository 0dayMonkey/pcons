import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { WidgetComponent } from './components/widget/widget.component';

import { NotificationService } from './services/notification.service';
import { CommunicationService } from './services/communication.service';

import { ConfigService } from 'projects/common/services/config.service';
import { MboxInfoService } from 'projects/common/services/mbox-info.service';
import { ApiService } from 'projects/common/services/api.service';

@NgModule({
  declarations: [AppComponent, WidgetComponent],
  imports: [
    BrowserModule,
    CommonModule,
    MatIconModule,
    BrowserAnimationsModule,
    HttpClientModule,
  ],
  providers: [
    NotificationService,
    CommunicationService,
    ConfigService,
    MboxInfoService,
    ApiService,
  ],
  bootstrap: [AppComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppModule {}
