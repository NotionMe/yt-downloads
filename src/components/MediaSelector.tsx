import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Video,
  Music,
  ChevronDown,
  FolderOpen,
  Download,
  Loader2,
  Clock,
  ListMusic,
  Headphones,
  CheckCircle2,
  FolderCheck,
  Settings2,
  RotateCcw,
  AlertCircle,
  FileCheck2,
} from "lucide-react";
import type {
  VideoInfo,
  VideoQuality,
  AudioTrack,
  DownloadType,
  VideoContainer,
  AudioContainer,
} from "../types";

interface MediaSelectorProps {
  videoInfo: VideoInfo;
  defaultOutputDir: string;
  onDownload: (
    videoFormatId: string,
    audioFormatId: string,
    outputDir: string,
    allAudio: boolean,
    browser: string,
    downloadType: DownloadType,
    fileFormat: string,
    overwrite: boolean,
    title: string
  ) => void;
  onSelectFolder: () => Promise<string | null>;
  onOpenFolder: (dir: string) => void;
  downloading: boolean;
}

export default function MediaSelector({
  videoInfo,
  defaultOutputDir,
  onDownload,
  onSelectFolder,
  onOpenFolder,
  downloading,
}: MediaSelectorProps) {
  const [downloadType, setDownloadType] = useState<DownloadType>("video");
  const [videoFormat, setVideoFormat] = useState<VideoContainer>("mp4");
  const [audioFormat, setAudioFormat] = useState<AudioContainer>("mp3");

  const [selectedVideo, setSelectedVideo] = useState<string>(
    videoInfo.video_formats[0]?.format_id ?? ""
  );
  const [selectedAudio, setSelectedAudio] = useState<string>(
    videoInfo.audio_tracks[0]?.format_id ?? ""
  );
  const [allAudio, setAllAudio] = useState(false);
  const [outputDir, setOutputDir] = useState(defaultOutputDir || "");
  const [browser, setBrowser] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fileExists, setFileExists] = useState(false);
  const [targetFileName, setTargetFileName] = useState("");
  const [overwrite, setOverwrite] = useState(false);

  // Sync defaultOutputDir when it loads from backend
  useEffect(() => {
    if (defaultOutputDir && !outputDir) {
      setOutputDir(defaultOutputDir);
    }
  }, [defaultOutputDir, outputDir]);

  const effectiveOutputDir = outputDir || defaultOutputDir;
  const isDefaultDir = !outputDir || outputDir === defaultOutputDir;
  const activeExt = downloadType === "video" ? videoFormat : audioFormat;

  // Check if file exists and get computed unique target filename
  useEffect(() => {
    if (!videoInfo?.title) return;
    const dir = effectiveOutputDir;

    invoke<boolean>("check_file_exists", {
      outputDir: dir,
      title: videoInfo.title,
      ext: activeExt,
    })
      .then(setFileExists)
      .catch(() => setFileExists(false));

    invoke<string>("get_target_filename", {
      outputDir: dir,
      title: videoInfo.title,
      ext: activeExt,
      overwrite,
    })
      .then(setTargetFileName)
      .catch(() => {});
  }, [
    videoInfo?.title,
    effectiveOutputDir,
    activeExt,
    overwrite,
  ]);

  const handleFolderSelect = async () => {
    const dir = await onSelectFolder();
    if (dir) setOutputDir(dir);
  };

  const handleResetFolder = () => {
    setOutputDir(defaultOutputDir);
  };

  const handleDownload = () => {
    const format = downloadType === "video" ? videoFormat : audioFormat;
    onDownload(
      selectedVideo,
      selectedAudio,
      effectiveOutputDir,
      allAudio && downloadType === "video",
      browser,
      downloadType,
      format,
      overwrite,
      videoInfo.title
    );
  };

  const formatFilesize = (bytes: number | null): string => {
    if (!bytes) return "";
    if (bytes > 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
    if (bytes > 1024 * 1024)
      return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const selectedVideoObj = videoInfo.video_formats.find(
    (v) => v.format_id === selectedVideo
  );

  return (
    <div className="space-y-4">
      {/* Video info card */}
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:flex-row sm:items-center">
        <div className="relative shrink-0 overflow-hidden rounded-xl border border-zinc-800">
          <img
            src={videoInfo.thumbnail}
            alt={videoInfo.title}
            className="h-28 w-full object-cover sm:w-48"
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-zinc-200 backdrop-blur-sm">
            <Clock size={11} />
            <span>{videoInfo.duration_string}</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <h2
            className="text-base font-semibold text-zinc-100 line-clamp-2"
            title={videoInfo.title}
          >
            {videoInfo.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-zinc-300">
              ID: {videoInfo.id}
            </span>
            {videoInfo.video_formats.length > 0 && (
              <span className="rounded-md bg-blue-950/60 px-2 py-0.5 text-blue-300 border border-blue-800/40">
                Макс: {videoInfo.video_formats[0].label}
              </span>
            )}
            {videoInfo.audio_tracks.length > 0 && (
              <span className="rounded-md bg-purple-950/60 px-2 py-0.5 text-purple-300 border border-purple-800/40">
                {videoInfo.audio_tracks.length}{" "}
                {videoInfo.audio_tracks.length === 1
                  ? "аудіодоріжка"
                  : "аудіодоріжок"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Mode Selector: Video vs Audio */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Тип збереження
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDownloadType("video")}
              className={`flex items-center justify-center gap-2.5 rounded-xl border py-3 px-4 text-sm font-medium transition ${
                downloadType === "video"
                  ? "border-blue-500 bg-blue-600/15 text-blue-400 shadow-sm"
                  : "border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              }`}
            >
              <Video size={18} />
              <span>Відео</span>
              {downloadType === "video" && (
                <CheckCircle2 size={16} className="ml-1 text-blue-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setDownloadType("audio")}
              className={`flex items-center justify-center gap-2.5 rounded-xl border py-3 px-4 text-sm font-medium transition ${
                downloadType === "audio"
                  ? "border-emerald-500 bg-emerald-600/15 text-emerald-400 shadow-sm"
                  : "border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              }`}
            >
              <Headphones size={18} />
              <span>Лише аудіо</span>
              {downloadType === "audio" && (
                <CheckCircle2 size={16} className="ml-1 text-emerald-500" />
              )}
            </button>
          </div>
        </div>

        {/* Format & Quality Options */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* File Format Selection */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
              {downloadType === "video" ? <Video size={14} /> : <Music size={14} />}
              Формат файлу
            </label>
            <div className="relative">
              {downloadType === "video" ? (
                <select
                  value={videoFormat}
                  onChange={(e) => setVideoFormat(e.target.value as VideoContainer)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-800/90 py-2.5 pl-3.5 pr-8 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
                >
                  <option value="mp4">MP4 (Рекомендовано / Універсальний)</option>
                  <option value="mkv">MKV (Підтримує всі кодеки і аудіо)</option>
                  <option value="webm">WEBM (Оригінальний потік)</option>
                </select>
              ) : (
                <select
                  value={audioFormat}
                  onChange={(e) => setAudioFormat(e.target.value as AudioContainer)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-800/90 py-2.5 pl-3.5 pr-8 text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
                >
                  <option value="mp3">MP3 (Найпопулярніший, 320 kbps)</option>
                  <option value="m4a">M4A (Оригінальний AAC без втрат)</option>
                  <option value="wav">WAV (Студійний нестиснений)</option>
                  <option value="flac">FLAC (Lossless стиснення)</option>
                  <option value="opus">OPUS (Сучасний кодек)</option>
                </select>
              )}
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
            </div>
          </div>

          {/* Quality / Resolution (if video) or Quality Info (if audio) */}
          {downloadType === "video" ? (
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-zinc-400">
                <span>Якість відео</span>
                {selectedVideoObj?.filesize || selectedVideoObj?.filesize_approx ? (
                  <span className="text-[11px] text-zinc-500 lowercase">
                    ~{formatFilesize(selectedVideoObj.filesize ?? selectedVideoObj.filesize_approx)}
                  </span>
                ) : null}
              </label>
              <div className="relative">
                <select
                  value={selectedVideo}
                  onChange={(e) => setSelectedVideo(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-800/90 py-2.5 pl-3.5 pr-8 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
                >
                  {videoInfo.video_formats.map((vf: VideoQuality) => (
                    <option key={vf.format_id} value={vf.format_id}>
                      {vf.label}
                      {vf.filesize || vf.filesize_approx
                        ? ` — ${formatFilesize(vf.filesize ?? vf.filesize_approx)}`
                        : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={15}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
                <Music size={14} />
                Якість аудіо
              </label>
              <div className="flex h-[42px] items-center rounded-xl border border-zinc-700/60 bg-zinc-800/50 px-3.5 text-xs text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  Найвища доступна якість джерела (Best Audio 320k)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Audio Track Selector (if video has multiple or user wants specific language) */}
        {videoInfo.audio_tracks.length > 0 && (
          <div>
            <label className="mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Music size={14} />
                Аудіодоріжка (Мова)
              </span>
              {downloadType === "video" && (
                <span className="text-[11px] text-zinc-500 lowercase">
                  для вибраного відео
                </span>
              )}
            </label>
            <div className="relative">
              <select
                value={selectedAudio}
                onChange={(e) => setSelectedAudio(e.target.value)}
                disabled={allAudio && downloadType === "video"}
                className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-800/90 py-2.5 pl-3.5 pr-8 text-sm text-zinc-100 outline-none transition focus:border-blue-500 disabled:opacity-50"
              >
                {videoInfo.audio_tracks.map((at: AudioTrack) => (
                  <option key={at.format_id} value={at.format_id}>
                    {at.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
            </div>
          </div>
        )}

        {/* Multi-audio streams checkbox (video only) */}
        {downloadType === "video" && videoInfo.audio_tracks.length > 1 && (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-800/30 p-2.5 text-sm text-zinc-300 transition hover:bg-zinc-800/50">
            <input
              type="checkbox"
              checked={allAudio}
              onChange={(e) => {
                setAllAudio(e.target.checked);
                if (e.target.checked && videoFormat !== "mkv") {
                  setVideoFormat("mkv");
                }
              }}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-0"
            />
            <ListMusic size={16} className="text-zinc-400" />
            <span className="text-xs sm:text-sm">
              Зберегти всі доступні аудіодоріжки (рекомендується MKV)
            </span>
          </label>
        )}
      </div>

      {/* Output directory section */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <FolderOpen size={14} />
            Папка збереження
          </label>
          <div className="flex items-center gap-2">
            {isDefaultDir ? (
              <span className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                <FolderCheck size={12} />
                Downloads (за замовчуванням)
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResetFolder}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition"
              >
                <RotateCcw size={11} />
                Скинути на Downloads
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={effectiveOutputDir}
              readOnly
              className="w-full truncate rounded-xl border border-zinc-700/80 bg-zinc-800/90 py-2.5 pl-3.5 pr-20 text-xs text-zinc-200 outline-none"
            />
            {effectiveOutputDir && (
              <button
                type="button"
                onClick={() => onOpenFolder(effectiveOutputDir)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-zinc-700/60 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
              >
                Відкрити
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleFolderSelect}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700 active:scale-[0.98]"
          >
            <FolderOpen size={14} />
            <span>Змінити</span>
          </button>
        </div>

        {/* Target file info and duplicate handling */}
        {fileExists ? (
          <div className="mt-3 rounded-xl border border-amber-800/50 bg-amber-950/25 p-3 text-xs text-amber-300 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-400" />
              <div className="space-y-1 flex-1">
                <p className="font-semibold text-amber-200">
                  Файл з такою назвою вже існує в цій папці!
                </p>
                <p className="text-zinc-300">
                  {overwrite ? (
                    <span>Існуючий файл буде <span className="text-amber-400 font-semibold">перезаписано</span> на новий.</span>
                  ) : (
                    <span>
                      Буде створено новий окремий файл:{" "}
                      <strong className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-zinc-100">
                        {targetFileName}
                      </strong>
                    </span>
                  )}
                </p>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 pt-1 border-t border-amber-800/30 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-0"
              />
              <span>Перезаписати старий файл замість створення нового</span>
            </label>
          </div>
        ) : (
          targetFileName && (
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <FileCheck2 size={13} className="text-emerald-400 shrink-0" />
              <span>
                Буде збережено як:{" "}
                <span className="font-mono text-zinc-300">{targetFileName}</span>
              </span>
            </div>
          )
        )}
      </div>

      {/* Advanced toggle (cookies for age-restricted / private videos) */}
      <div className="text-right">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400 transition"
        >
          <Settings2 size={13} />
          <span>{showAdvanced ? "Приховати налаштування" : "Додаткові налаштування (Cookies)"}</span>
        </button>
      </div>

      {showAdvanced && (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-3.5">
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">
            Браузер для передачі cookies (потрібно лише для відео 18+ або приватних):
          </label>
          <div className="relative">
            <select
              value={browser}
              onChange={(e) => setBrowser(e.target.value)}
              className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-800 py-2 pl-3 pr-8 text-xs text-zinc-200 outline-none"
            >
              <option value="">Без cookies (стандартно, рекомендовано)</option>
              <option value="chrome">Google Chrome</option>
              <option value="firefox">Mozilla Firefox</option>
              <option value="edge">Microsoft Edge</option>
              <option value="brave">Brave</option>
              <option value="opera">Opera</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            />
          </div>
        </div>
      )}

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className={`flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${
          downloadType === "video"
            ? "bg-blue-600 shadow-blue-600/20 hover:bg-blue-500"
            : "bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-500"
        }`}
      >
        {downloading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Download size={18} />
        )}
        <span>
          {downloading
            ? "Завантаження виконується..."
            : downloadType === "video"
            ? `Завантажити відео (${videoFormat.toUpperCase()})`
            : `Завантажити аудіо (${audioFormat.toUpperCase()})`}
        </span>
      </button>
    </div>
  );
}
