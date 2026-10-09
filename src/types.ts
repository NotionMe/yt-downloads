// ── Types matching Rust backend serialization ───────────────────────────────

export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  duration_string: string;
  video_formats: VideoQuality[];
  audio_tracks: AudioTrack[];
}

export interface VideoQuality {
  format_id: string;
  ext: string;
  height: number | null;
  width: number | null;
  fps: number | null;
  vcodec: string;
  filesize: number | null;
  filesize_approx: number | null;
  label: string;
}

export interface AudioTrack {
  format_id: string;
  ext: string;
  acodec: string;
  abr: number | null;
  asr: number | null;
  language: string | null;
  language_preference: number | null;
  label: string;
  audio_channels: number | null;
}

export type DownloadType = "video" | "audio";
export type VideoContainer = "mp4" | "mkv" | "webm";
export type AudioContainer = "mp3" | "m4a" | "wav" | "flac" | "opus";

export interface ProgressPayload {
  percent: number;
  speed: string;
  eta: string;
  downloaded: string;
  total: string;
  status: "downloading" | "merging" | "converting" | "done" | "error" | "cancelled";
}

export interface DependencyStatus {
  yt_dlp: boolean;
  yt_dlp_version: string;
  ffmpeg: boolean;
  ffmpeg_version: string;
}
