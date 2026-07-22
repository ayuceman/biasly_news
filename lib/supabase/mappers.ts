import type { ArticleWithAnalysis } from "@/lib/supabase/types";

// Maps single-article-analysis DB rows onto the existing UI component shapes.
// The mock UI assumed multi-source aggregation; the real schema does not have
// category/region/multi-source data, so we feed best-fit values and omit what
// the DB cannot provide (rather than fabricate it). A §19-faithful card/detail
// redesign is a separate UI task.

function pct(value: number | null): number {
  return typeof value === "number" ? Math.round(value) : 0;
}

function capitalize(value: string | null | undefined): string {
  if (!value) return "News";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export type NewsCardData = {
  id: string;
  imageUrl: string;
  category: string;
  region: string;
  title: string;
  leftPercentage: number;
  centerPercentage: number;
  rightPercentage: number;
  sourcesCount: number;
};

export function toNewsCardData(row: ArticleWithAnalysis): NewsCardData {
  return {
    id: row.id,
    imageUrl: row.image_url,
    category: capitalize(row.analysis.bias_label), // closest available signal
    region: row.source?.name ?? "Unknown source",
    title: row.title,
    leftPercentage: pct(row.analysis.left_percentage),
    centerPercentage: pct(row.analysis.center_percentage),
    rightPercentage: pct(row.analysis.right_percentage),
    sourcesCount: 1, // single-source model; placeholder until §19 redesign
  };
}

export type DominantBias = { label: "Left" | "Center" | "Right"; percentage: number };

export function dominantBias(row: ArticleWithAnalysis): DominantBias {
  const left = pct(row.analysis.left_percentage);
  const center = pct(row.analysis.center_percentage);
  const right = pct(row.analysis.right_percentage);
  const max = Math.max(left, center, right);
  if (max === left) return { label: "Left", percentage: left };
  if (max === right) return { label: "Right", percentage: right };
  return { label: "Center", percentage: center };
}

export function bodyParagraphs(raw: string | null): string[] {
  if (!raw) return [];
  // Prefer blank-line separated blocks; fall back to single-newline; then one block.
  const byBlank = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  const byLine = raw
    .split(/\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byLine.length > 1) return byLine;
  const single = raw.trim();
  return single ? [single] : [];
}
