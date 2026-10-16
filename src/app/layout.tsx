import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Department · Audit de visibilité IA",
  description: "Découvrez en quelques minutes si ChatGPT, Google, Perplexity, Gemini et Claude recommandent votre entreprise, et qui ils citent à votre place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
