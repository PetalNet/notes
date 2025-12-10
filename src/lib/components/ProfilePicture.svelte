<script lang="ts">
  interface Props {
    name: string;
  }

  const { name }: Props = $props();
</script>

<div
  class="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-content"
>
  {name.toUpperCase()}
</div>
