import type { ComponentProps } from "solid-js"

export function PlasmaMark(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <path
        d="M32 4L54 12V29C54 43 44.5 53.5 32 60C19.5 53.5 10 43 10 29V12L32 4Z"
        fill="currentColor"
        fill-opacity="0.12"
        stroke="currentColor"
        stroke-width="3"
      />
      <path
        d="M34 13L21 35H31L28 51L44 27H34L34 13Z"
        fill="currentColor"
        stroke="currentColor"
        stroke-linejoin="round"
      />
    </svg>
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
