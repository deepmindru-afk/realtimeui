import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * Geist is Vercel's own typeface, which is the point of loading it here rather
 * than keeping Inter: the app is meant to read in the same register as the
 * product it is imitating. Both faces are variable, so the whole 100–900 range
 * is available without a single extra network request.
 *
 * `cyrillic` is the subset that matters. Without it every Russian glyph quietly
 * falls back to a system font, the two faces stop matching, and the change is
 * invisible in code review while being obvious on screen. `latin` is kept
 * alongside it for the identifiers and component names that stay in Latin
 * script — status codes, `SH-4471`, a file extension.
 *
 * The CSS variable *names* are deliberately left as `--font-inter` and
 * `--font-jetbrains-mono`. They are a contract, not a description: both
 * `styles/agents.css` and `app/globals.css` reference them, and the installed
 * vendor components pick up their typography through them. Renaming them to
 * match the new faces would silently reset the type of every third-party
 * component in the app.
 */
const geist = Geist({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Портал",
  description:
    "Голосовой и текстовый агент для работы с полевыми заметками: расшифровка интервью, сверка журналов, сводки по проекту.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
