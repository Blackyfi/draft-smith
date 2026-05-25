import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useUiStore } from "@/store/ui";

/**
 * App toast surface (PROJECT_SPEC §6.4). Themed off the Zustand UI store and mapped to the design
 * tokens so toasts match the rest of the window in both dark and light mode.
 */
function Toaster(props: ToasterProps) {
  const theme = useUiStore((s) => s.theme);
  return (
    <Sonner
      theme={theme}
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "!bg-popover !text-popover-foreground !border-border !rounded-md",
          description: "!text-muted-foreground",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
