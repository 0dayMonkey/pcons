import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../services/notification.service';
import { CommunicationService } from '../../services/communication.service';

@Component({
  selector: 'app-widget',
  templateUrl: './widget.component.html',
  styleUrls: ['./widget.component.scss'],
})
export class WidgetComponent implements OnInit, OnDestroy {
  notificationCount: number = 0;
  private notificationSubscription: Subscription | null = null;

  constructor(
    private notificationService: NotificationService,
    private communicationService: CommunicationService
  ) {}

  ngOnInit(): void {
    this.notificationSubscription =
      this.notificationService.notifications$.subscribe((count) => {
        this.notificationCount = count;
      });
  }

  ngOnDestroy(): void {
    if (this.notificationSubscription) {
      this.notificationSubscription.unsubscribe();
    }
  }

  handleWidgetClick(): void {
    console.log('clique op, notif :', this.notificationCount);

    if (this.notificationCount > 0) {
      this.communicationService.navigateToLandingPage();
    } else {
      this.communicationService.sendMessageToParent('widget-clicked', {
        message: 'Aucune promotion disponible',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
