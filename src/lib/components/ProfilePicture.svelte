<script lang="ts">
  interface Props {
    name: string;
  }

  const { name }: Props = $props();
</script>

<div
  class="flex size-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600"
>
  {name[0]?.toUpperCase()}
</div>
