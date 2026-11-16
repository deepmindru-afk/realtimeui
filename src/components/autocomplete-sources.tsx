"use client"

import {
  bundledSources,
  parseSources,
  sourcesWithFallback,
  type AutocompleteSources,
} from "@/lib/completion/sources"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

/**
 * Where the browser is told what the composer may complete toward.
 *
 * The service is named by a server-side environment variable, so the client
 * cannot read it and the corpora have to arrive over HTTP — from `/api/
 * autocomplete`, which reads the variable and proxies. Mounted at the root of the
 * app for the same reason `FeatureFlagsProvider` is: one request per page load
 * rather than one per composer, and the empty state and the suggestion list
 * cannot end up describing different sets of questions.
 *
 * Starting at the bundled corpora rather than empty is the load-bearing part.
 * The request resolves after the first paint, and a composer that starts with
 * nothing to offer flickers from empty to populated on every page load — a menu
 * appearing under the caret as the operator reaches for it. So the app's own
 * questions are on screen first and the service's replace them if and when it
 * answers. The two are the same shape, so nothing downstream can tell which one
 * it is holding, and the swap is a re-render rather than a special case.
 */
const SOURCES_URL = "/api/autocomplete"

/**
 * The bundled corpora until the service says otherwise.
 *
 * A constant rather than a call per render: the arrays are the ones every
 * consumer would otherwise read straight from their own module, and handing out
 * a fresh object each time would make this provider a source of new references
 * on every render of the tree below it.
 */
const BUNDLED = bundledSources()

const AutocompleteSourcesContext = createContext<AutocompleteSources>(BUNDLED)

export function AutocompleteSourcesProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<AutocompleteSources>(BUNDLED)

  useEffect(() => {
    /* Never abandoned, unlike the model completion: this is the menu itself, and
     * a request that can be cancelled by a blur means a menu that empties
     * mid-conversation. It is one request per page load and it is cheap. */
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const response = await fetch(SOURCES_URL, {
          signal: controller.signal,
          cache: "no-store",
        })
        if (!response.ok) return
        const payload = (await response.json()) as unknown
        /* Through the same reader the route used, so a response that is not the
         * shape this app expects cannot install a corpus of undefined. The route
         * already guarantees both keys are present and non-empty; this is what
         * makes that guarantee not something to take on trust, and it is why the
         * two sides cannot drift apart about what a valid sample is. */
        const parsed = sourcesWithFallback(parseSources(payload))
        if (active) setSources(parsed)
      } catch {
        /* Silent, and that is the whole design. The route answers the bundled
         * corpora for every failure it can see, so the only way to reach here
         * is the app itself being unreachable or the request being cancelled on
         * unmount — either way the questions already on screen are the right
         * ones. */
      }
    })()
    return () => {
      /* Unmount before the response: the write is disarmed, so a late answer
       * cannot reach a provider that is gone. */
      active = false
      controller.abort()
    }
  }, [])

  return (
    <AutocompleteSourcesContext.Provider value={sources}>
      {children}
    </AutocompleteSourcesContext.Provider>
  )
}

/** The corpora to complete against. The bundled ones if the service is silent. */
export function useAutocompleteSources(): AutocompleteSources {
  return useContext(AutocompleteSourcesContext)
}
