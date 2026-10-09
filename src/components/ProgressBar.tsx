import {
  CheckCircle,
  AlertTriangle,
  Loader2,
  FolderOpen,
  XCircle,
  Ban,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { ProgressPayload } from "../types";

interface ProgressBarProps {
  progress: ProgressPayload | null;
  onCancel?: () => void;
  onOpenFolder?: () => void;
  onReset?: () => void;
}

export default function ProgressBar({
  progress,
  onCancel,
  onOpenFolder,
  onReset,
}: ProgressBarProps) {
  if (!progress) return null;

  const { percent, speed, eta, status, total } = progress;

  const statusLabel: Record<string, string> = {
    downloading: "Завантаження...",
    merging: "Об'єднання аудіо та відео потоків...",
    converting: "Конвертація аудіофайлу...",
    done: "Готово! Файл збережено",
    error: "Помилка під час завантаження",
    cancelled: "Завантаження скасовано",
  };

  const statusIcon = {
    downloading: <Loader2 size={18} className="animate-spin text-blue-400" />,
    merging: <Loader2 size={18} className="animate-spin text-amber-400" />,
    converting: <Loader2 size={18} className="animate-spin text-emerald-400" />,
    done: <CheckCircle size={18} className="text-emerald-400" />,
    error: <AlertTriangle size={18} className="text-red-400" />,
    cancelled: <Ban size={18} className="text-zinc-400" />,
  };

  const barColor: Record<string, string> = {
    downloading: "bg-blue-500",
    merging: "bg-amber-500 animate-pulse",
    converting: "bg-emerald-500 animate-pulse",
    done: "bg-emerald-500",
    error: "bg-red-500",
    cancelled: "bg-zinc-600",
  };

  const isWorking =
    status === "downloading" || status === "merging" || status === "converting";

  return (
    <div className="space-y-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-xl">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusIcon[status] ?? statusIcon.downloading}
          <span className="text-sm font-medium text-zinc-100">
            {statusLabel[status] ?? status}
          </span>
        </div>

        {isWorking && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 rounded-lg border border-red-800/40 bg-red-950/30 px-2.5 py-1 text-xs font-medium text-red-300 transition hover:bg-red-900/50 hover:text-white"
          >
            <XCircle size={14} />
            <span>Скасувати</span>
          </button>
        )}
      </div>

      {/* Progress Bar Container */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            barColor[status] ?? "bg-blue-500"
          }`}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>

      {/* Progress Stats */}
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <div>
          {status === "downloading" && (
            <div className="flex items-center gap-3">
              {total && <span>Розмір: ~{total}</span>}
              {speed && <span>Швидкість: {speed}</span>}
              {eta && <span>Залишилось: {eta}</span>}
            </div>
          )}
          {status === "merging" && (
            <span className="text-amber-400">
              Зведення потоків через FFmpeg...
            </span>
          )}
          {status === "converting" && (
            <span className="text-emerald-400">
              Конвертація у вибраний аудіокодек...
            </span>
          )}
          {status === "done" && (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <Sparkles size={14} />
              Файл успішно записано у вашу папку!
            </span>
          )}
        </div>

        <span className="font-mono text-zinc-300 font-medium">
          {percent.toFixed(1)}%
        </span>
      </div>

      {/* Actions when finished */}
      {status === "done" && (
        <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-zinc-800/60">
          {onOpenFolder && (
            <button
              type="button"
              onClick={onOpenFolder}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700 hover:text-white"
            >
              <FolderOpen size={15} />
              <span>Відкрити папку з файлом</span>
            </button>
          )}

          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-transparent px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
            >
              <RotateCcw size={14} />
              <span>Завантажити ще одне</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
