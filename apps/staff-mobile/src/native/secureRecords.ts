export interface SecureStoreAdapter {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
/** Small encrypted chunks; commit the pointer only after every chunk is readable. */
export async function readRecord<T>(
  store: SecureStoreAdapter,
  key: string,
): Promise<T | null> {
  const raw = await store.getItemAsync(key);
  if (!raw) return null;
  const pointer = JSON.parse(raw);
  if (
    !/^[a-zA-Z0-9_-]+$/.test(pointer.id) ||
    !Number.isInteger(pointer.count) ||
    pointer.count < 1 ||
    pointer.count > 250
  )
    throw new Error("Saved order reference is damaged.");
  let text = "";
  for (let i = 0; i < pointer.count; i++) {
    const part = await store.getItemAsync(key + "_" + pointer.id + "_" + i);
    if (part === null) throw new Error("Saved order reference is incomplete.");
    text += part;
  }
  if (text.length !== pointer.length)
    throw new Error("Saved order reference is incomplete.");
  return JSON.parse(text) as T;
}
export async function writeRecord(
  store: SecureStoreAdapter,
  key: string,
  value: unknown,
  id: string,
) {
  const previous = await store.getItemAsync(key);
  const text = JSON.stringify(value),
    parts = text.match(/[\s\S]{1,450}/g) || [""];
  if (parts.length > 250)
    throw new Error("This order reference is too large to save.");
  for (let i = 0; i < parts.length; i++) {
    await store.setItemAsync(key + "_" + id + "_" + i, parts[i]);
    if ((await store.getItemAsync(key + "_" + id + "_" + i)) !== parts[i])
      throw new Error(
        "Order reference could not be verified. No new order was sent.",
      );
  }
  const pointer = JSON.stringify({
    id,
    count: parts.length,
    length: text.length,
  });
  await store.setItemAsync(key, pointer);
  if ((await store.getItemAsync(key)) !== pointer)
    throw new Error("Order reference could not be saved.");
  if (previous) {
    try {
      const old = JSON.parse(previous);
      if (old.id !== id)
        for (let i = 0; i < Math.min(old.count, 250); i++)
          await store.deleteItemAsync(key + "_" + old.id + "_" + i);
    } catch {
      /* Current committed record remains readable. */
    }
  }
}
export async function removeRecord(store: SecureStoreAdapter, key: string) {
  const raw = await store.getItemAsync(key);
  await store.deleteItemAsync(key);
  if (await store.getItemAsync(key))
    throw new Error("Saved order could not be cleared.");
  if (raw) {
    try {
      const p = JSON.parse(raw);
      for (let i = 0; i < Math.min(p.count, 250); i++)
        await store.deleteItemAsync(key + "_" + p.id + "_" + i);
    } catch {
      /* Pointer is already removed; harmless orphan chunks are inaccessible. */
    }
  }
}
