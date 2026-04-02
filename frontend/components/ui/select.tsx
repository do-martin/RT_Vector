"use client"

import * as React from "react"
import { Select } from "radix-ui"
import { ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const SelectRoot = Select.Root
const SelectGroup = Select.Group
const SelectValue = Select.Value

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Select.Trigger>) {
  return (
    <Select.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm",
        "placeholder:text-muted-foreground",
        "focus:outline-none focus:border-ring focus:ring-3 focus:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "[&>span]:line-clamp-1",
        className
      )}
      {...props}
    >
      {children}
      <Select.Icon asChild>
        <ChevronDown className="size-4 opacity-50 shrink-0" />
      </Select.Icon>
    </Select.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof Select.Content>) {
  return (
    <Select.Portal>
      <Select.Content
        data-slot="select-content"
        position={position}
        className={cn(
          "relative z-50 min-w-[8rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className
        )}
        {...props}
      >
        <Select.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
          )}
        >
          {children}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof Select.Label>) {
  return (
    <Select.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs font-semibold text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Select.Item>) {
  return (
    <Select.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none",
        "focus:bg-accent focus:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <Select.ItemIndicator>
          <Check className="size-4" />
        </Select.ItemIndicator>
      </span>
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Select.Separator>) {
  return (
    <Select.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  SelectRoot as Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
}
