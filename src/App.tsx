import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, MonitorDown, XCircle } from "lucide-react";

import UrlInput from "./components/UrlInput";
import MediaSelector from "./components/MediaSelector";
import ProgressBar from "./components/ProgressBar";
import type {
  VideoInfo,
  ProgressPayload,
  DependencyStatus,
  DownloadType,
} from "./types";

export default function App() {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deps, setDeps] = useState<DependencyStatus | null>(null);
  const [defaultOutputDir, setDefaultOutputDir] = useState("");
  const [activeOutputDir, setActiveOutputDir] = useState("");

  // Check dependencies and get default Downloads folder on startup
  useEffect(() => {
    invoke<DependencyStatus>("check_dependencies")
      .then(setDeps)
      .catch(() => {});

    invoke<string>("get_default_download_dir")
      .then((dir) => {
        setDefaultOutputDir(dir);
        setActiveOutputDir(dir);
      })
      .catch(() => {});
  }, []);

  // Listen for download progress events
  useEffect(() => {
    const unlisten = listen<ProgressPayload>("download-progress", (event) => {
      setProgress(event.payload);
      if (
        event.payload.status === "done" ||
        event.payload.status === "error" ||
        event.payload.status === "cancelled"
      ) {
        setDownloading(false);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleAnalyze = async (url: string) => {
    setLoading(true);
    setError(null);
    setVideoInfo(null);
    setProgress(null);
    try {
      const info = await invoke<VideoInfo>("get_video_info", {
        url,
        browser: "",
      });
      setVideoInfo(info);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("Video unavailable") || msg.includes("Private video")) {
        setError(
          "Відео недоступне, приватне або видалене. Перевірте посилання або використайте опцію cookies у налаштуваннях."
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFolder = async (): Promise<string | null> => {
    const selected = await open({ directory: true, multiple: false });
    return selected as string | null;
  };

  const handleOpenFolder = async (dir?: string) => {
    try {
      const target = dir || activeOutputDir || defaultOutputDir;
      await invoke("open_folder", { path: target });
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  const handleCancel = async () => {
    try {
      await invoke("cancel_download");
    } catch (e) {
      console.error("Failed to cancel download:", e);
    }
  };

  const handleReset = () => {
    setVideoInfo(null);
    setProgress(null);
    setError(null);
    setDownloading(false);
  };

  const handleDownload = async (
    videoFormatId: string,
    audioFormatId: string,
    outputDir: string,
    allAudio: boolean,
    browser: string,
    downloadType: DownloadType,
    fileFormat: string,
    overwrite: boolean,
    title: string
  ) => {
    if (!videoInfo) return;
    const finalDir = outputDir || defaultOutputDir;
    setActiveOutputDir(finalDir);
    setDownloading(true);
    setProgress({
      percent: 0,
      speed: "",
      eta: "",
      downloaded: "",
      total: "",
      status: "downloading",
    });
    setError(null);

    try {
      await invoke("download_video", {
        url: `https://www.youtube.com/watch?v=${videoInfo.id}`,
        title: title || videoInfo.title,
        videoFormatId,
        audioFormatId,
        outputDir: finalDir,
        allAudio,
        browser,
        downloadType,
        fileFormat,
        overwrite,
      });
    } catch (e) {
      const msg = String(e);
      if (!msg.includes("скасовано")) {
        setError(msg);
      }
      setDownloading(false);
    }
  };

  const missingDeps = deps && (!deps.yt_dlp || !deps.ffmpeg);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-500 border border-blue-500/30">
            <MonitorDown size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              YT Downloader
            </h1>
            <p className="text-xs text-zinc-400">
              Швидке та зручне завантаження відео й аудіо
            </p>
          </div>
        </div>

        {defaultOutputDir && (
          <button
            type="button"
            onClick={() => handleOpenFolder(defaultOutputDir)}
            title="Відкрити стандартну папку Downloads"
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition"
          >
            <span>Папка Downloads</span>
          </button>
        )}
      </div>

      {/* Dependency warnings */}
      {missingDeps && (
        <div className="mb-5 rounded-2xl border border-yellow-700/50 bg-yellow-900/20 p-4">
          <div className="flex items-start gap-2.5 text-sm text-yellow-300">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-yellow-400" />
            <div>
              <p className="font-semibold">Необхідні системні компоненти не знайдено:</p>
              {!deps.yt_dlp && (
                <p className="mt-1 text-xs">
                  • <strong>yt-dlp</strong> не встановлено. Встановіть через термінал:{" "}
                  <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">
                    sudo pacman -S yt-dlp
                  </code>{" "}
                  або{" "}
                  <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">
                    pip install yt-dlp
                  </code>
                </p>
              )}
              {!deps.ffmpeg && (
                <p className="mt-1 text-xs">
                  • <strong>ffmpeg</strong> не встановлено. Потрібен для конвертації та зведення:{" "}
                  <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">
                    sudo pacman -S ffmpeg
                  </code>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* URL Input */}
      <UrlInput onSubmit={handleAnalyze} loading={loading} />

      {/* Error display */}
      {error && (
        <div className="mt-4 flex items-start justify-between rounded-xl border border-red-800/50 bg-red-900/25 p-3.5 text-xs text-red-300 sm:text-sm">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-red-400 hover:text-red-200"
          >
            <XCircle size={16} />
          </button>
        </div>
      )}

      {/* Video info + selectors */}
      {videoInfo && (
        <div className="mt-6">
          <MediaSelector
            videoInfo={videoInfo}
            defaultOutputDir={defaultOutputDir}
            onDownload={handleDownload}
            onSelectFolder={handleSelectFolder}
            onOpenFolder={handleOpenFolder}
            downloading={downloading}
          />
        </div>
      )}

      {/* Progress bar */}
      {progress && (
        <div className="mt-5">
          <ProgressBar
            progress={progress}
            onCancel={handleCancel}
            onOpenFolder={() => handleOpenFolder(activeOutputDir || defaultOutputDir)}
            onReset={handleReset}
          />
        </div>
      )}
    </div>
  );
}
