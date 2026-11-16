"use client"

import { Button } from "@/components/boardui/base/buttons/button"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

const emptySubscribe = () => () => {}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
  if (!mounted) return <span aria-hidden className="inline-block size-8" />
  const dark = resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="small"
      iconOnly
      leadingIcon={dark ? Sun : Moon}
      aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    />
  )
}
