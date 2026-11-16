"use client";

import { ThemeProvider } from "next-themes";
import { AutocompleteSourcesProvider } from "@/components/autocomplete-sources";
import { FeatureFlagsProvider } from "@/components/feedback-visibility";
import { SuperApp } from "@/components/super-app/super-app";

export default function HomePage() {
  /* Dark is the default, not a preference: the product is built on a black
     canvas, and `enableSystem` would hand a light-mode operator a white app
     the moment their OS asked for one. The toggle still works, so light stays
     reachable — it is just no longer the resting state. */
  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      {/* Both providers come from the server, so something has to ask once. Above
         the app rather than inside a component: the answers land before any view
         that might read them, and every view reads the same request instead of
         making its own. */}
      <FeatureFlagsProvider>
        <AutocompleteSourcesProvider>
          <SuperApp />
        </AutocompleteSourcesProvider>
      </FeatureFlagsProvider>
    </ThemeProvider>
  );
}
