export function unawaited<T>(promise: Promise<T>): void {
  promise.catch((err: unknown) => {
    console.error(err);
  });
}
