import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, HttpEventType, HttpEvent } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { timeout, catchError, switchMap } from 'rxjs/operators';
import { throwError, Subscription, of } from 'rxjs';

@Component({
  selector: 'app-guest-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './guest-upload.component.html',
  styleUrl: './guest-upload.component.css'
})
export class GuestUploadComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  sessionId: string | null = null;
  isNewSessionMode = false;
  selectedFile: File | null = null;
  uploadState: 'idle' | 'uploading' | 'done' | 'error' = 'idle';
  uploadProgress = 0;
  errorMessage = '';
  resultingHostLink = '';
  private uploadSub: Subscription | null = null;
  private readonly apiBaseUrl = 'https://ai-vod-review-backend-1.onrender.com/api';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const routeSessionId = this.route.snapshot.paramMap.get('sessionId');
    if (routeSessionId) {
      this.sessionId = routeSessionId;
      this.isNewSessionMode = false;
    } else {
      this.isNewSessionMode = true;
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  upload() {
    if (!this.selectedFile) return;
    this.uploadState = 'uploading';
    this.uploadProgress = 0;

    const sessionId$ = this.sessionId
      ? of(this.sessionId)
      : this.http.post<{ session_id: string }>(`${this.apiBaseUrl}/sessions`, {}).pipe(
          switchMap((res) => {
            this.sessionId = res.session_id;
            return of(res.session_id);
          })
        );

    this.uploadSub = sessionId$.pipe(
      switchMap((sessionId) => {
        const formData = new FormData();
        formData.append('file', this.selectedFile as File);
        return this.http.post(
          `${this.apiBaseUrl}/sessions/${sessionId}/upload`,
          formData,
          { reportProgress: true, observe: 'events' }
        );
      }),
      timeout(120000),
      catchError((err) => {
        console.error('Upload failed or timed out', err);
        return throwError(() => err);
      })
    ).subscribe({
      next: (event: HttpEvent<any>) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress = Math.round((event.loaded / event.total) * 100);
          this.cdr.markForCheck();
        } else if (event.type === HttpEventType.Response) {
          this.uploadState = 'done';
          this.uploadSub = null;
          if (this.isNewSessionMode && this.sessionId) {
            this.resultingHostLink = `${window.location.origin}/host/${this.sessionId}`;
          }
          this.cdr.markForCheck();
        }
      },
      error: (err) => {
        this.uploadState = 'error';
        this.uploadSub = null;
        this.errorMessage = err.name === 'TimeoutError'
          ? 'Upload timed out. Check your connection and try again.'
          : err.status === 410
            ? 'This session has ended.'
            : err.status === 404
              ? 'Session not found.'
              : 'Upload failed. Try again.';
        this.cdr.markForCheck();
      }
    });
  }

  cancelUpload() {
    this.uploadSub?.unsubscribe();
    this.uploadSub = null;
    this.uploadState = 'idle';
    this.uploadProgress = 0;
    this.selectedFile = null;

    // Required: browsers do not fire a 'change' event if the same file is
    // re-selected, because the input's value is unchanged from the DOM's
    // perspective. Resetting the native input's value explicitly ensures a
    // retry (even of the identical file) correctly re-triggers selection.
    if (this.fileInputRef) {
      this.fileInputRef.nativeElement.value = '';
    }
    this.cdr.markForCheck();
  }

  ngOnDestroy() {
    this.uploadSub?.unsubscribe();
  }
}
