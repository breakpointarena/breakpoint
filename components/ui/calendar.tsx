"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils/cn"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-[#121212] group/calendar p-4 [--cell-size:2.2rem] select-none text-white",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit mx-auto", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1 z-20",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800 rounded-lg p-0 aria-disabled:opacity-30",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800 rounded-lg p-0 aria-disabled:opacity-30",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-8 w-full items-center justify-center px-8 font-black text-sm uppercase tracking-wide text-white",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-[--cell-size] w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "border-zinc-800 shadow-sm relative rounded-md border bg-zinc-950",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "bg-zinc-900 absolute inset-0 opacity-0 cursor-pointer",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-black text-sm uppercase tracking-wider text-zinc-200",
          captionLayout === "label"
            ? "text-sm"
            : "[&>svg]:text-zinc-400 flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        
        // 💡 FIXED PROPERTY NAME: Changed from 'table' to 'month_grid' to satisfy react-day-picker v9 typings
        month_grid: "w-full border-collapse space-y-1",
        
        weekdays: cn("flex justify-between border-b border-zinc-900 pb-2 mb-1", defaultClassNames.weekdays),
        weekday: cn(
          "text-zinc-400 flex-1 select-none rounded-md text-xs font-black uppercase text-center tracking-widest",
          defaultClassNames.weekday
        ),
        week: cn("mt-1 flex w-full justify-between gap-1", defaultClassNames.week),
        week_number_header: cn(
          "w-[--cell-size] select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-zinc-600 select-none text-[0.8rem]",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full select-none p-0 text-center",
          defaultClassNames.day
        ),
        range_start: cn(
          "bg-primary/20 rounded-l-md",
          defaultClassNames.range_start
        ),
        range_middle: cn("bg-zinc-900 text-white rounded-none", defaultClassNames.range_middle),
        range_end: cn("bg-primary/20 rounded-r-md", defaultClassNames.range_end),
        
        // Custom interactive visual matching your exact amber styling rules
        today: cn(
          "border border-primary text-primary rounded-md font-bold",
          defaultClassNames.today
        ),
        outside: cn(
          "text-zinc-700 aria-selected:text-zinc-400 pointer-events-none",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-zinc-800 opacity-40 pointer-events-none cursor-not-allowed",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-[--cell-size] items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        // Custom data selectors matching the Break Point Arena amber/gold look
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-black data-[selected-single=true]:font-black text-xs transition-all duration-200",
        "data-[range-start=true]:bg-primary data-[range-start=true]:text-black data-[range-end=true]:bg-primary data-[range-end=true]:text-black",
        "hover:bg-primary/20 hover:text-white rounded-md",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }