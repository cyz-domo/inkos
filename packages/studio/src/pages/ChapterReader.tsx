import { useState } from "react";
import { fetchJson, useApi } from "../hooks/use-api";
import type { Theme } from "../hooks/use-theme";
import type { TFunction } from "../hooks/use-i18n";
import { useColors } from "../hooks/use-colors";
import { ChapterWorkspacePanel } from "../components/ChapterWorkspacePanel";
import { parseNovelParagraphs } from "../components/chat/BookSidebar";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  List,
  RotateCcw,
  BookOpen,
  Hash,
  Type,
  Clock,
  Pencil,
  Save,
  Eye,
} from "lucide-react";

interface ChapterData {
  readonly chapterNumber: number;
  readonly filename: string;
  readonly content: string;
}

interface Nav {
  toBook: (id: string) => void;
  toDashboard: () => void;
  toChapter: (bookId: string, chapterNumber: number) => void;
}

export function ChapterReader({ bookId, chapterNumber, nav, theme, t }: {
  bookId: string;
  chapterNumber: number;
  nav: Nav;
  theme: Theme;
  t: TFunction;
}) {
  const c = useColors(theme);
  const { data, loading, error, refetch } = useApi<ChapterData>(
    `/books/${bookId}/chapters/${chapterNumber}`,
  );
  const { data: bookMeta } = useApi<{ chapters: { number: number; title: string }[] }>(`/books/${bookId}`);
  const chapters = bookMeta?.chapters ?? [];
  const sortedChapterNumbers = chapters.map((c) => c.number).sort((a, b) => a - b);
  const currentIndex = sortedChapterNumbers.indexOf(chapterNumber);
  const hasPrev = currentIndex > 0 || (currentIndex === -1 && chapterNumber > 1);
  const hasNext = currentIndex >= 0 ? currentIndex < sortedChapterNumbers.length - 1 : true;
  const prevChapter = hasPrev ? (currentIndex > 0 ? sortedChapterNumbers[currentIndex - 1] : chapterNumber - 1) : null;
  const nextChapter = hasNext ? (currentIndex >= 0 && currentIndex < sortedChapterNumbers.length - 1 ? sortedChapterNumbers[currentIndex + 1] : chapterNumber + 1) : null;

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);

  const handleStartEdit = () => {
    if (!data) return;
    setEditContent(data.content);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditContent("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetchJson(`/books/${bookId}/chapters/${chapterNumber}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      setEditing(false);
      refetch();
      setWorkspaceRevision((revision) => revision + 1);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4">
      <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      <span className="text-sm text-muted-foreground">{t("reader.openingManuscript")}</span>
    </div>
  );

  if (error) return <div className="text-destructive p-8 bg-destructive/5 rounded-xl border border-destructive/20">Error: {error}</div>;
  if (!data) return null;

  // Split novel content into clean paragraphs with 2-em indent support
  const { title: parsedTitle, paragraphs } = parseNovelParagraphs(data.content);
  const title = parsedTitle || (data.filename?.replace(/\.md$/, "") ?? `Chapter ${chapterNumber}`);
  const bodyLength = paragraphs.reduce((sum, p) => sum + p.length, 0);

  return (
    <div className="w-full space-y-10 fade-in">
      {/* Navigation & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <nav className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          <button
            onClick={nav.toDashboard}
            className="hover:text-primary transition-colors flex items-center gap-1"
          >
            {t("bread.books")}
          </button>
          <span className="text-border">/</span>
          <button
            onClick={() => nav.toBook(bookId)}
            className="hover:text-primary transition-colors truncate max-w-[120px]"
          >
            {bookId}
          </button>
          <span className="text-border">/</span>
          <span className="text-foreground flex items-center gap-1">
            <Hash size={12} />
            {chapterNumber}
          </span>
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={() => prevChapter !== null && nav.toChapter(bookId, prevChapter)}
            disabled={!hasPrev}
            className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-secondary text-muted-foreground rounded-xl hover:text-foreground hover:bg-secondary/80 disabled:opacity-30 disabled:pointer-events-none transition-all border border-border/50"
            title="上一章"
          >
            <ChevronLeft size={14} />
            <span className="hidden sm:inline">上一章</span>
          </button>

          <button
            onClick={() => nav.toBook(bookId)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-secondary text-muted-foreground rounded-xl hover:text-foreground hover:bg-secondary/80 transition-all border border-border/50"
          >
            <List size={14} />
            {t("reader.backToList")}
          </button>

          <button
            onClick={() => nextChapter !== null && nav.toChapter(bookId, nextChapter)}
            disabled={!hasNext}
            className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-secondary text-muted-foreground rounded-xl hover:text-foreground hover:bg-secondary/80 disabled:opacity-30 disabled:pointer-events-none transition-all border border-border/50"
            title="下一章"
          >
            <span className="hidden sm:inline">下一章</span>
            <ChevronRight size={14} />
          </button>

          {/* Edit / Preview toggle */}
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:scale-105 active:scale-95 transition-all shadow-sm disabled:opacity-50"
              >
                {saving ? <div className="w-3.5 h-3.5 border-2 border-primary-foreground/20 border-t-primary-foreground rounded-full animate-spin" /> : <Save size={14} />}
                {saving ? t("book.saving") : t("book.save")}
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-secondary text-muted-foreground rounded-xl hover:text-foreground transition-all border border-border/50"
              >
                <Eye size={14} />
                {t("reader.preview")}
              </button>
            </>
          ) : (
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-secondary text-muted-foreground rounded-xl hover:text-primary hover:bg-primary/10 transition-all border border-border/50"
            >
              <Pencil size={14} />
              {t("reader.edit")}
            </button>
          )}

        </div>
      </div>

      <ChapterWorkspacePanel
        key={`${chapterNumber}-${workspaceRevision}`}
        bookId={bookId}
        chapterNumber={chapterNumber}
        t={t}
        onChapterChanged={refetch}
        onChapterDeleted={() => nav.toBook(bookId)}
      />

      {/* Manuscript Sheet */}
      <div className="paper-sheet rounded-2xl p-8 md:p-16 lg:p-24 shadow-2xl shadow-primary/5 min-h-[80vh] relative overflow-hidden">
        {/* Physical Paper Details */}
        <div className="absolute top-0 left-8 w-px h-full bg-primary/5 hidden md:block" />
        <div className="absolute top-0 right-8 w-px h-full bg-primary/5 hidden md:block" />

        <header className="mb-16 text-center">
          <div className="flex items-center justify-center gap-2 text-muted-foreground/30 mb-8 select-none">
            <div className="h-px w-12 bg-border/40" />
            <BookOpen size={20} />
            <div className="h-px w-12 bg-border/40" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-medium italic text-foreground tracking-tight leading-tight">
            {title}
          </h1>
          <div className="mt-8 flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
            <span>{t("reader.manuscriptPage")}</span>
            <span className="text-border">·</span>
            <span>{chapterNumber.toString().padStart(2, '0')}</span>
          </div>
        </header>

        {editing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full min-h-[60vh] bg-transparent font-serif text-lg leading-[1.8] text-foreground/90 focus:outline-none resize-none border border-border/30 rounded-lg p-6 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            autoFocus
          />
        ) : (
          <article className="space-y-6 font-serif text-lg md:text-xl leading-[2] text-foreground/90 select-text max-w-none">
            {paragraphs.map((para, i) => (
              <p key={i} style={{ textIndent: "2em" }} className="tracking-wide">
                {para}
              </p>
            ))}
          </article>
        )}

        <footer className="mt-24 pt-12 border-t border-border/20 flex flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
             <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50">
               <Type size={14} className="text-primary/60" />
               <span>{bodyLength.toLocaleString()} {t("reader.characters")}</span>
             </div>
             <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50">
               <Clock size={14} className="text-primary/60" />
               <span>{Math.ceil(bodyLength / 500)} {t("reader.minRead")}</span>
             </div>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-bold">{t("reader.endOfChapter")}</p>
        </footer>
      </div>

      {/* Footer Navigation */}
      <div className="flex justify-between items-center py-8 gap-4">
        <button
          onClick={() => prevChapter !== null && nav.toChapter(bookId, prevChapter)}
          disabled={!hasPrev}
          className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <ChevronLeft size={16} />
          上一章
        </button>

        <button
          onClick={() => nav.toBook(bookId)}
          className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary transition-all group"
        >
          <RotateCcw size={16} className="group-hover:-rotate-45 transition-transform" />
          {t("reader.chapterList")}
        </button>

        <button
          onClick={() => nextChapter !== null && nav.toChapter(bookId, nextChapter)}
          disabled={!hasNext}
          className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          下一章
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
