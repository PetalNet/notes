```svelte file="App.svelte"
<script>
  import Demo from "./Demo.svelte";

  let visible = $state(true);
</script>

<button onclick={() => (visible = !visible)}> toggle </button>

{#if visible}
  <Demo />
{/if}
```

```svelte file="Demo.svelte"
<script>
  import { activeElement } from "./utils.svelte.js";

  // this deliberately doesn't create the listeners,
  // because this line of code will never re-run
  console.group("init");
  console.log(activeElement.current);
  console.groupEnd();

  $effect(() => {
    // this _does_ create the listeners. if you comment this out,
    // along with the `{...}` below, they will not be created
    console.group("effect");
    console.log(activeElement.current);
    console.groupEnd();
  });
</script>

<p>active: {activeElement.current?.placeholder ?? "..."}</p>
<input placeholder="1" />
<input placeholder="2" />
<input placeholder="3" />
<input placeholder="4" />
<input placeholder="5" />
<input placeholder="6" />

<style>
  input {
    display: block;
    margin: 0 0 0.5em;
  }
</style>
```

```svelte file="utils.svelte.js"
export const activeElement = readable(document.activeElement, (callback) => {
	console.log('creating listeners');

	const update = () => callback(document.activeElement);

	document.addEventListener('focusin', update);
	document.addEventListener('focusout', update);

	return () => {
		console.log('removing listeners');
		document.removeEventListener('focusin', update);
		document.removeEventListener('focusout', update);
	};
});

function readable(initial, start) {
	let value = $state(initial);

	let listeners = 0;
	let stop;

	return {
		get current() {
			console.log(`$effect.tracking() is ${$effect.tracking()}`)

			if ($effect.tracking()) {
				$effect(() => {
					if (listeners++ === 0) {
						stop = start((v) => {
							value = v;
						});
					}

					return () => {
						if (--listeners === 0) {
							stop?.();
						}
					}
				});
			}

			return value;
		}
	};
}
```
