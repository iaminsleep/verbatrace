import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export const Dialog = RadixDialog.Root;

interface ContentProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  className?: string;
  onCloseAutoFocus?: (event: Event) => void;
}

export function DialogContent({
  title,
  description,
  children,
  footer,
  closeLabel,
  className,
  onCloseAutoFocus,
}: ContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
      <RadixDialog.Content
        onCloseAutoFocus={onCloseAutoFocus}
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100vw-2rem))]",
          "-translate-x-1/2 -translate-y-1/2",
          "max-h-[calc(100dvh-2rem)] overflow-y-auto",
          "rounded-lg border border-border bg-surface p-4 sm:p-6 shadow-2xl",
          className,
        )}
      >
        <div className="mb-5 pr-8">
          <RadixDialog.Title className="text-lg font-semibold text-foreground">
            {title}
          </RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </RadixDialog.Description>
          ) : null}
        </div>

        {children}

        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}

        <RadixDialog.Close
          data-control=""
          data-icon-control=""
          aria-label={closeLabel}
          className={cn(
            "absolute right-2 top-2 grid size-9 place-items-center rounded-sm text-muted-foreground",
            "transition-colors hover:bg-elevated hover:text-foreground",
          )}
        >
          <X className="size-4" />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
