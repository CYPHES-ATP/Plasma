import type { JSX } from "solid-js"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"
import { PlasmaWordmark } from "@/components/plasma-mark"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-v2-background-bg-deep ">
      <div class="absolute inset-x-0 top-[25.375%] flex justify-center px-6">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          <PlasmaWordmark class="w-full text-[clamp(2rem,6vw,4.5rem)] text-v2-icon-icon-base" />
          <div class="mt-8">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
