"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const SheetDismissContext = React.createContext<(() => void) | null>(null);

function Sheet({ onOpenChange, ...props }: DialogPrimitive.Root.Props) {
  const actionsRef = React.useRef<DialogPrimitive.Root.Actions | null>(null);
  const dismiss = React.useCallback(() => {
    actionsRef.current?.close();
  }, []);

  return (
    <SheetDismissContext.Provider value={dismiss}>
      <DialogPrimitive.Root actionsRef={actionsRef} onOpenChange={onOpenChange} {...props} />
    </SheetDismissContext.Provider>
  );
}

function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, onPointerDown, ...props }: DialogPrimitive.Backdrop.Props) {
  const dismiss = React.useContext(SheetDismissContext);

  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/20 duration-150 supports-backdrop-filter:backdrop-blur-[2px]",
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        dismiss?.();
      }}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showClose = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left";
  showClose?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-background text-foreground shadow-xl ring-1 ring-border duration-200 outline-none",
          "data-open:animate-in data-closed:animate-out",
          "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:max-h-[85dvh] data-[side=top]:rounded-b-2xl data-[side=top]:border-b",
          "data-[side=top]:data-open:slide-in-from-top-8 data-[side=top]:data-closed:slide-out-to-top-8",
          "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:max-h-[85dvh] data-[side=bottom]:rounded-t-2xl data-[side=bottom]:border-t",
          "data-[side=bottom]:data-open:slide-in-from-bottom-8 data-[side=bottom]:data-closed:slide-out-to-bottom-8",
          "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-dvh data-[side=left]:w-[min(22rem,calc(100vw-1.5rem))] data-[side=left]:border-r",
          "data-[side=left]:data-open:slide-in-from-left-8 data-[side=left]:data-closed:slide-out-to-left-8",
          "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-dvh data-[side=right]:w-[min(22rem,calc(100vw-1.5rem))] data-[side=right]:border-l",
          "data-[side=right]:data-open:slide-in-from-right-8 data-[side=right]:data-closed:slide-out-to-right-8",
          className,
        )}
        {...props}
      >
        {showClose ? (
          <DialogPrimitive.Close
            data-slot="sheet-close"
            className={cn(
              "absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
        {children}
      </DialogPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 px-5 pt-5 pr-14", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 px-5 pb-5", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function SheetClose({ className, ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" className={cn(className)} {...props} />;
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
