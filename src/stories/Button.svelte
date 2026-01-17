<script lang="ts">
  import "./button.css";

  interface Props {
    /** Is this the principal call to action on the page? */
    primary?: boolean | undefined;
    /** What background color to use */
    backgroundColor?: string | undefined;
    /** How large should the button be? */
    size?: "small" | "medium" | "large" | undefined;
    /** Button contents */
    label: string;
    /** The onclick event handler */
    onclick?: (() => void) | undefined;
  }

  const {
    primary = false,
    backgroundColor,
    size = "medium",
    label,
    ...props
  }: Props = $props();

  let mode = $derived(
    primary ? "storybook-button--primary" : "storybook-button--secondary",
  );
  let style = $derived(
    backgroundColor ? `background-color: ${backgroundColor}` : "",
  );
</script>

<button
  type="button"
  class={["storybook-button", `storybook-button--${size}`, mode].join(" ")}
  {style}
  {...props}
>
  {label}
</button>
