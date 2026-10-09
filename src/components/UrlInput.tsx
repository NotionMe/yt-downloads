import { useState, useRef } from "react";
import { Link2, Loader2, Search, ClipboardPaste, X } from "lucide-react";

interface UrlInputProps {
  onSubmit: (url: string) => void;
  loading: boolean;
}

export default function UrlInput({ onSubmit, loading }: UrlInputProps) {
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanUrl = (input: string) => {
    let trimmed = input.trim();
    try {
      if (trimmed.includes("youtube.com/") || trimmed.includes("youtu.be/")) {
        const parsed = new URL(
          trimmed.startsWith("http://") || trimmed.startsWith("https://")
            ? trimmed
            : `https://${trimmed}`
        );
        parsed.searchParams.delete("si");
        parsed.searchParams.delete("feature");
        return parsed.toString();
      }
    } catch {
      // ignore
    }
    return trimmed;
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const cleaned = cleanUrl(text);
        setUrl(cleaned);
        inputRef.current?.focus();
      }
    } catch {
      inputRef.current?.focus();
    }
  };

  const handleClear = () => {
    setUrl("");
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = cleanUrl(url);
    if (cleaned) {
      onSubmit(cleaned);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 sm:flex-row">
      <div className="relative flex-1">
        <Link2
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
          size={18}
        />
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Вставте посилання на YouTube відео..."
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900/90 py-3 pl-10 pr-24 text-sm text-zinc-100 placeholder-zinc-500 shadow-inner outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          disabled={loading}
        />
        <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {url && !loading && (
            <button
              type="button"
              onClick={handleClear}
              title="Очистити"
              className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
            >
              <X size={15} />
            </button>
          )}
          {!url && !loading && (
            <button
              type="button"
              onClick={handlePaste}
              title="Вставити з буфера обміну"
              className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
            >
              <ClipboardPaste size={13} />
              <span>Вставити</span>
            </button>
          )}
        </div>
      </div>
      <button
        type="submit"
        disabled={loading || !url.trim()}
        className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Search size={16} />
        )}
        <span>{loading ? "Аналіз..." : "Отримати інформацію"}</span>
      </button>
    </form>
  );
}
