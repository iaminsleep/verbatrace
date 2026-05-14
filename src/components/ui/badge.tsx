import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const badge = cva(
  "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 " +
    "text-[11px] font-medium leading-5 whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-elevated text-muted-foreground border border-border",
        accent: "bg-accent-soft text-accent",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-destructive/15 text-destructive",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badge({ variant }), className)} {...props} />;
}
