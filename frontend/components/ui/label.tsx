import * as React from "react"
import { Label } from "radix-ui"
import { cn } from "@/lib/utils"

function LabelComponent({
  className,
  ...props
}: React.ComponentProps<typeof Label.Root>) {
  return (
    <Label.Root
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  )
}

export { LabelComponent as Label }
