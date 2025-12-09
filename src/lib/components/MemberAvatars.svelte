<script lang="ts">
  interface Member {
    userId: string;
    role: string;
  }

  interface Props {
    members: Member[];
    maxVisible?: number;
    size?: "sm" | "md";
  }

  let { members, maxVisible = 3, size = "sm" }: Props = $props();

  // Generate a consistent color based on user handle
  function getAvatarColor(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Generate hue from hash (0-360)
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 65%, 50%)`;
  }

  // Get first letter of username (after @ if present)
  function getInitial(userId: string): string {
    const cleaned = userId.startsWith("@") ? userId.slice(1) : userId;
    return cleaned.charAt(0).toUpperCase();
  }

  // Format display name
  function formatName(userId: string, role: string): string {
    let name = userId;
    if (!userId.includes(":") && !userId.startsWith("@")) {
      name = `@${userId}`;
    }
    if (role === "owner") {
      return `${name} (owner)`;
    }
    if (role === "reader") {
      return `${name} (read-only)`;
    }
    return name;
  }

  const visibleMembers = $derived(members.slice(0, maxVisible));
  const remainingCount = $derived(Math.max(0, members.length - maxVisible));

  const sizeClasses = $derived(
    size === "sm" ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-xs",
  );
</script>

<div class="flex -space-x-1">
  {#each visibleMembers as member (member.userId)}
    <div
      class="flex cursor-default items-center justify-center rounded-full text-white ring-1 ring-base-100 {sizeClasses}"
      style="background-color: {getAvatarColor(member.userId)}"
      title={formatName(member.userId, member.role)}
    >
      {getInitial(member.userId)}
    </div>
  {/each}

  {#if remainingCount > 0}
    <div
      class="flex cursor-default items-center justify-center rounded-full bg-base-300 text-base-content ring-1 ring-base-100 {sizeClasses}"
      title="{remainingCount} more member{remainingCount > 1 ? 's' : ''}"
    >
      +{remainingCount}
    </div>
  {/if}
</div>
