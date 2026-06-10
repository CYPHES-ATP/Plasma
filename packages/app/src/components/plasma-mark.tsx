import type { ComponentProps } from "solid-js"

export function PlasmaMark(props: ComponentProps<"img">) {
  return (
    <img
      {...props}
      src="/plasma-icon.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      class={`object-contain ${props.class ?? ""}`}
    />
  )
}

export function PlasmaWordmark(props: ComponentProps<"div">) {
  return (
    <div {...props} class={`flex items-center justify-center gap-4 ${props.class ?? ""}`}>
      <PlasmaMark class="size-[0.92em] shrink-0" />
      <span class="font-semibold tracking-[0.22em] leading-none">PLASMA</span>
    </div>
  )
}
