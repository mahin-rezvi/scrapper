import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DIUBoard — Notices and class routines",
  description:
    "Find Daffodil International University department notices and class routines in one place.",
};

// Runs before hydration — sets data-theme immediately so there's no flash
// from default (dark) to the user's actual saved/preferred theme.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("notice-tracker-theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Read cookie on the server to render a matching `data-theme` attribute
  // and avoid hydration mismatches. `cookies()` must be awaited in this
  // runtime according to Next.js warnings.
  let ssrTheme: "light" | "dark" | undefined;
  try {
    const cookieStore = await cookies();
    const themeCookie = cookieStore.get("notice-tracker-theme")?.value;
    if (themeCookie === "dark" || themeCookie === "light") {
      ssrTheme = themeCookie;
    }
  } catch {
    // ignore and fall back to client-side init
  }

  return (
    <html
      lang="en"
      className={inter.variable}
      data-theme={ssrTheme || "dark"}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
