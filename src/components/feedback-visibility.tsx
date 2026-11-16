"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

/**
 * Where the browser is told which flags are on.
 *
 * The server owns the answer — it is the only side that can read the
 * environment — so the client asks for it once, here, and every component
 * below the provider reads the same value instead of fetching its own. Mounted
 * at the root of the app, which is what makes it one request per page load
 * rather than one per rating button.
 */
const FLAGS_URL = "/api/feature-flags"

type FeatureFlags = {
  showFeedback: boolean
}

/**
 * The context's own value is the answer when there is no provider above: off.
 *
 * That default is the reason this module can hand out a boolean to any client
 * component without ceremony — a component rendered outside the provider, or
 * before the request lands, gets a feature that is hidden, never one that is
 * revealed by accident.
 */
const FeatureFlagsContext = createContext<FeatureFlags>({ showFeedback: false })

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [showFeedback, setShowFeedback] = useState(false)

  useEffect(() => {
    /* One request, and it is never abandoned. `no-store` on the fetch keeps the
     * browser from answering its own question from a previous visit, which is
     * what would otherwise hide a flip until someone hard-reloaded. */
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const response = await fetch(FLAGS_URL, {
          signal: controller.signal,
          cache: "no-store",
        })
        if (!response.ok) return
        const payload = (await response.json()) as Partial<FeatureFlags>
        /* Strictly `true`, so a renamed or misspelled key reads as off rather
         * than as whatever the server happened to send in that slot. */
        if (active && payload.showFeedback === true) setShowFeedback(true)
      } catch {
        /* Silent, and that is the whole design: an unconfigured deployment fails
         * this request the same way an operator who wants nothing sees the
         * feature, and a flag being off is not an error worth a banner or a
         * console line. The abort below lands here too, on unmount. */
      }
    })()
    return () => {
      /* Unmount before the response: the request is cancelled and the write is
       * disarmed, so a late answer cannot reach a component that is gone. */
      active = false
      controller.abort()
    }
  }, [])

  return (
    <FeatureFlagsContext.Provider value={{ showFeedback }}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

/** Whether the like/dislike controls should be on. False until proven otherwise. */
export function useShowFeedback(): boolean {
  return useContext(FeatureFlagsContext).showFeedback
}
