import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  id,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <RadixCheckbox.Root
      id={id}
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      disabled={disabled}
      className={cn(
        "size-[18px] shrink-0 rounded-[4px] border border-border bg-surface transition-colors",
        "hover:border-muted-foreground",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        "disabled:opacity-50 disabled:pointer-events-none",
        className,
      )}
    >
      <RadixCheckbox.Indicator className="flex items-center justify-center text-accent-foreground">
        <Check className="size-3" strokeWidth={3} />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
