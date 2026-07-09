import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { VideoSkeletonComponent } from './video-skeleton.component';
import { VideoReviewComponent } from './video-review.component';

@Component({
  selector: 'app-host',
  standalone: true,
  imports: [CommonModule, VideoSkeletonComponent, VideoReviewComponent],
  templateUrl: './host.component.html',
  styleUrl: './host.component.css'
})
export class HostComponent implements OnInit, OnDestroy {
  sessionId: string | null = null;
  shareLink = '';
  videoUrl: SafeResourceUrl | null = null;
  pollingInterval: ReturnType<typeof setInterval> | null = null;
  private readonly apiBaseUrl = '/api';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const routeSessionId = this.route.snapshot.paramMap.get('sessionId');
    if (routeSessionId) {
      // Joining a session a Guest already created and uploaded into.
      this.sessionId = routeSessionId;
      this.shareLink = `${window.location.origin}/upload/${this.sessionId}`;
      this.startPolling();
    }
    // If no route param, wait for the user to click "Create Session".
  }

  createSession() {
    this.http.post<{ session_id: string }>(`${this.apiBaseUrl}/sessions`, {}).subscribe({
      next: (response) => {
        this.sessionId = response.session_id;
        this.shareLink = `${window.location.origin}/upload/${this.sessionId}`;
        this.videoUrl = null;
        this.startPolling();
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to create session', error);
        alert('Could not create a session. Check the backend connection and try again.');
      }
    });
  }

  startPolling() {
    if (!this.sessionId) return;
    this.clearPolling();
    // Check immediately so joining an existing session with a ready video
    // renders the player without flashing the skeleton state.
    this.checkSessionStatus();
    this.pollingInterval = setInterval(() => this.checkSessionStatus(), 3000);
  }

  private checkSessionStatus() {
    this.http.get<{ status: string; filename?: string }>(
      `${this.apiBaseUrl}/sessions/${this.sessionId}/status`
    ).subscribe({
      next: (response) => {
        if (response.status === 'ready' && response.filename) {
          const rawUrl = `${this.apiBaseUrl}/sessions/${this.sessionId}/video/${response.filename}`;
          this.videoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(rawUrl);
          this.clearPolling();
        }
        this.cdr.markForCheck();
      },
      error: (error) => console.error('Session polling failed', error)
    });
  }

  private clearPolling() {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  ngOnDestroy() {
    this.clearPolling();
  }
}
