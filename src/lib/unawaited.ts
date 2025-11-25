export function unawaited<T>(promise: Promise<T>) {
  promise.catch((err: unknown) => {
    console.error(err);
  });
}
