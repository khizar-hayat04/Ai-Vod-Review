import {
  Component, Input, ViewChild, ElementRef, AfterViewInit,
  OnDestroy, ChangeDetectorRef, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SafeResourceUrl } from '@angular/platform-browser';

type DrawTool = 'pen' | 'circle' | 'arrow' | 'square';
interface DrawPoint { x: number; y: number; }
interface Stroke { tool: DrawTool; points: DrawPoint[]; }
interface Note { id: string; timestamp: number; text: string; }
interface Flag { id: string; timestamp: number; }

@Component({
  selector: 'app-video-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './video-review.component.html',
  styleUrl: './video-review.component.css'
})
export class VideoReviewComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) videoUrl!: SafeResourceUrl;

  @ViewChild('videoStage') videoStageRef!: ElementRef<HTMLDivElement>;
  @ViewChild('videoEl') videoElRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasElRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('drawMenuWrapper') drawMenuWrapperRef?: ElementRef<HTMLDivElement>;

  isPlaying = false;
  currentTime = 0;
  duration = 0;
  playbackRate = 1;
  isDrawMode = false;
  isFullscreen = false;
  showDrawMenu = false;
  showSymbolsMenu = false;
  currentTool: DrawTool = 'pen';

  strokes: Stroke[] = [];
  redoStack: Stroke[] = [];
  notes: Note[] = [];
  flags: Flag[] = [];
  newNoteText = '';

  private resizeObserver: ResizeObserver | null = null;
  private isDrawing = false;
  private strokeStart: DrawPoint | null = null;
  private currentStroke: Stroke | null = null;
  private ctx!: CanvasRenderingContext2D;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasElRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
    this.resizeObserver.observe(this.videoElRef.nativeElement);
    this.syncCanvasSize();
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }

  private syncCanvasSize() {
    const video = this.videoElRef.nativeElement;
    const canvas = this.canvasElRef.nativeElement;
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    this.redrawStrokes();
  }

  // ---- Playback ----
  togglePlay() {
    const video = this.videoElRef.nativeElement;
    video.paused ? video.play() : video.pause();
  }
  onPlay() { this.isPlaying = true; this.cdr.markForCheck(); }
  onPause() { this.isPlaying = false; this.cdr.markForCheck(); }
  onTimeUpdate() {
    this.currentTime = this.videoElRef.nativeElement.currentTime;
    this.cdr.markForCheck();
  }
  onLoadedMetadata() {
    this.duration = this.videoElRef.nativeElement.duration;
    this.cdr.markForCheck();
  }
  seekTo(seconds: number) { this.videoElRef.nativeElement.currentTime = seconds; }
  onSeekBarInput(event: Event) { this.seekTo(+(event.target as HTMLInputElement).value); }
  setPlaybackRate(rate: number) {
    this.playbackRate = rate;
    this.videoElRef.nativeElement.playbackRate = rate;
  }
  stepFrame(direction: 1 | -1) {
    const video = this.videoElRef.nativeElement;
    video.pause();
    const FRAME_DURATION = 1 / 30;
    video.currentTime = Math.min(Math.max(video.currentTime + direction * FRAME_DURATION, 0), this.duration);
  }

  // ---- Draw menu (popup above the Draw button) ----
  toggleDrawMenu() {
    this.showDrawMenu = !this.showDrawMenu;
    this.isDrawMode = this.showDrawMenu;
    if (!this.showDrawMenu) this.showSymbolsMenu = false;
    if (this.isDrawMode) this.videoElRef.nativeElement.pause();
    this.cdr.markForCheck();
  }

  toggleSymbolsMenu() {
    this.showSymbolsMenu = !this.showSymbolsMenu;
  }

  selectTool(tool: DrawTool) {
    this.currentTool = tool;
    this.showSymbolsMenu = false;
    this.showDrawMenu = false;   // close menu, cursor is now ready to draw
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.showDrawMenu) return;
    const target = event.target as HTMLElement;
    if (!this.drawMenuWrapperRef?.nativeElement.contains(target)) {
      this.showDrawMenu = false;
      this.showSymbolsMenu = false;
      this.cdr.markForCheck();
    }
  }

  // ---- Drawing (pen = freehand path, shapes = two-point bounding box) ----
  onPointerDown(event: PointerEvent) {
    if (!this.isDrawMode) return;
    this.isDrawing = true;
    const point = this.toNormalizedPoint(event);
    this.strokeStart = point;
    this.currentStroke = { tool: this.currentTool, points: [point] };
  }

  onPointerMove(event: PointerEvent) {
    if (!this.isDrawing || !this.currentStroke || !this.strokeStart) return;
    const point = this.toNormalizedPoint(event);
    if (this.currentTool === 'pen') {
      this.currentStroke.points.push(point);
    } else {
      // Shapes only need start + live end point for a bounding-box preview
      this.currentStroke.points = [this.strokeStart, point];
    }
    this.redrawStrokes();
    this.drawStroke(this.currentStroke);
  }

  onPointerUp() {
    if (this.currentStroke && this.currentStroke.points.length >= 2) {
      this.strokes.push(this.currentStroke);
      this.redoStack = [];
    }
    this.currentStroke = null;
    this.strokeStart = null;
    this.isDrawing = false;
  }

  undo() {
    const last = this.strokes.pop();
    if (last) { this.redoStack.push(last); this.redrawStrokes(); this.cdr.markForCheck(); }
  }
  redo() {
    const restored = this.redoStack.pop();
    if (restored) { this.strokes.push(restored); this.redrawStrokes(); this.cdr.markForCheck(); }
  }
  clearDrawing() {
    this.strokes = [];
    this.redoStack = [];
    this.redrawStrokes();
    this.cdr.markForCheck();
  }

  private toNormalizedPoint(event: PointerEvent): DrawPoint {
    const canvas = this.canvasElRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    };
  }

  private redrawStrokes() {
    const canvas = this.canvasElRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of this.strokes) this.drawStroke(stroke);
  }

  private drawStroke(stroke: Stroke) {
    const canvas = this.canvasElRef.nativeElement;
    const toPx = (p: DrawPoint) => ({ x: p.x * canvas.width, y: p.y * canvas.height });

    this.ctx.strokeStyle = '#f5f5f5';
    this.ctx.lineWidth = 3;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';

    if (stroke.tool === 'pen') {
      if (stroke.points.length < 2) return;
      const start = toPx(stroke.points[0]);
      this.ctx.beginPath();
      this.ctx.moveTo(start.x, start.y);
      for (const p of stroke.points.slice(1)) {
        const px = toPx(p);
        this.ctx.lineTo(px.x, px.y);
      }
      this.ctx.stroke();
      return;
    }

    if (stroke.points.length < 2) return;
    const a = toPx(stroke.points[0]);
    const b = toPx(stroke.points[1]);

    if (stroke.tool === 'square') {
      this.ctx.strokeRect(
        Math.min(a.x, b.x), Math.min(a.y, b.y),
        Math.abs(b.x - a.x), Math.abs(b.y - a.y)
      );
    } else if (stroke.tool === 'circle') {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      this.ctx.beginPath();
      this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    } else if (stroke.tool === 'arrow') {
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.stroke();

      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const headLength = 14;
      this.ctx.beginPath();
      this.ctx.moveTo(b.x, b.y);
      this.ctx.lineTo(
        b.x - headLength * Math.cos(angle - Math.PI / 6),
        b.y - headLength * Math.sin(angle - Math.PI / 6)
      );
      this.ctx.moveTo(b.x, b.y);
      this.ctx.lineTo(
        b.x - headLength * Math.cos(angle + Math.PI / 6),
        b.y - headLength * Math.sin(angle + Math.PI / 6)
      );
      this.ctx.stroke();
    }
  }

  // ---- Notes ----
  addNote() {
    if (!this.newNoteText.trim()) return;
    this.notes.push({ id: crypto.randomUUID(), timestamp: this.currentTime, text: this.newNoteText.trim() });
    this.notes.sort((a, b) => a.timestamp - b.timestamp);
    this.newNoteText = '';
  }
  removeNote(id: string) { this.notes = this.notes.filter(n => n.id !== id); }

  // ---- Flags ----
  addFlag() {
    this.flags.push({ id: crypto.randomUUID(), timestamp: this.currentTime });
    this.flags.sort((a, b) => a.timestamp - b.timestamp);
    this.cdr.markForCheck();
  }
  removeFlag(id: string) {
    this.flags = this.flags.filter(f => f.id !== id);
  }
  flagPosition(timestamp: number): number {
    return this.duration > 0 ? (timestamp / this.duration) * 100 : 0;
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ---- Fullscreen ----
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.videoStageRef.nativeElement.requestFullscreen().catch((err) => console.error('Fullscreen request failed:', err));
    } else {
      document.exitFullscreen();
    }
  }
  private onFullscreenChange = () => {
    this.isFullscreen = !!document.fullscreenElement;
    this.cdr.markForCheck();
  };

  // ---- Keyboard shortcuts ----
  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    switch (event.key) {
      case ' ': event.preventDefault(); this.togglePlay(); break;
      case 'ArrowLeft': event.preventDefault(); this.stepFrame(-1); break;
      case 'ArrowRight': event.preventDefault(); this.stepFrame(1); break;
      case 'd': case 'D': this.toggleDrawMenu(); break;
      case 'z': case 'Z':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.shiftKey ? this.redo() : this.undo();
        }
        break;
      case 'y': case 'Y':
        if (event.ctrlKey || event.metaKey) { event.preventDefault(); this.redo(); }
        break;
      case 'f': case 'F': this.toggleFullscreen(); break;
    }
  }
}
