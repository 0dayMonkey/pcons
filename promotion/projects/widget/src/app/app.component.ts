import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title = 'widget';
}

// import { Component, OnInit } from '@angular/core';
// import { RouterOutlet } from '@angular/router';
// import { NotificationService } from './services/notification.service';
// import { MatBadgeModule } from '@angular/material/badge';
// import { MatIconModule } from '@angular/material/icon';

// @Component({
//   selector: 'app-root',
//   standalone: true,
//   imports: [RouterOutlet, MatBadgeModule, MatIconModule],
//   templateUrl: './app.component.html',
//   styleUrl: './app.component.scss',
// })
// export class AppComponent implements OnInit {
//   notificationCount = 0;

//   constructor(private notificationService: NotificationService) {}

//   ngOnInit() {
//     this.notificationService.notifications$.subscribe((count) => {
//       this.notificationCount = count;
//     });
//   }

//   clearNotifications() {
//     this.notificationService.clearNotifications();
//   }

//   sendVideoData() {
//     window.parent.postMessage(
//       {
//         messageType: 'navigate',
//         url: 'landing-page',
//         appName: 'test app',
//       },
//       '*'
//     );
//   }
// }
