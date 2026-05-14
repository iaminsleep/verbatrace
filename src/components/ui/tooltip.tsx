import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export const TooltipProvider = RadixTooltip.Provider;

interface Props {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

export function Tooltip({ label, children, side = "top" }: Props) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 max-w-[18rem] rounded-sm border border-border bg-elevated",
            "px-2.5 py-1.5 text-[13px] leading-snug text-foreground shadow-lg",
            "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
          )}
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
