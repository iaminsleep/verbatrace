import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export const Menu = RadixMenu.Root;
export const MenuTrigger = RadixMenu.Trigger;

const surface =
  "z-50 min-w-[12rem] max-h-[var(--radix-dropdown-menu-content-available-height)] max-w-[var(--radix-dropdown-menu-content-available-width)] overflow-y-auto rounded-md border border-border bg-elevated p-1 shadow-xl";

export function MenuContent({
  children,
  align = "end",
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content align={align} sideOffset={6} className={surface}>
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

const itemClass =
  "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm " +
  "text-foreground outline-none transition-colors " +
  "data-[highlighted]:bg-accent-soft data-[highlighted]:text-foreground " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 " +
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export function MenuItem({
  children,
  onSelect,
  disabled,
  checked,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;

  checked?: boolean;
  className?: string;
}) {
  return (
    <RadixMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(itemClass, className)}
    >
      {children}
      {checked !== undefined ? (
        <Check className={cn("ml-auto", !checked && "invisible")} />
      ) : null}
    </RadixMenu.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <RadixMenu.Label className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </RadixMenu.Label>
  );
}

export function MenuSeparator() {
  return <RadixMenu.Separator className="my-1 h-px bg-border" />;
}

export function MenuToggle({
  children,
  checked,
  onCheckedChange,
}: {
  children: ReactNode;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <RadixMenu.CheckboxItem checked={checked} onCheckedChange={onCheckedChange}
      onSelect={(event) => event.preventDefault()} className={cn(itemClass, "justify-between")}>
      {children}
      <span aria-hidden className={cn("ml-3 h-5 w-9 shrink-0 rounded-full p-0.5", checked ? "bg-accent" : "bg-muted-foreground")}>
        <span className={cn("block size-4 rounded-full bg-surface transition-transform", checked && "translate-x-4")} />
      </span>
    </RadixMenu.CheckboxItem>
  );
}
