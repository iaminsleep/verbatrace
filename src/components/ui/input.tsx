import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const field =
  "w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground transition-colors " +
  "hover:border-muted-foreground focus:border-accent focus:outline-none " +
  "disabled:opacity-50 disabled:pointer-events-none";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(field, "h-10", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, "resize-none py-2 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";
