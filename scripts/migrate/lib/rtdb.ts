export type JsonObject = Record<string, unknown>;

export interface LegacyLedger {
  key: string;
  value: JsonObject;
}

const asObject = (value: unknown): JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};

export function* iterateLedgers(root: unknown): Generator<LegacyLedger> {
  const bookoo = asObject(root);
  const ledgers = asObject(bookoo.ledgers);
  for (const key of Object.keys(ledgers).sort()) {
    yield {key, value: asObject(ledgers[key])};
  }
}

export interface LegacyChild {
  key: string;
  value: JsonObject;
}

const readChildren = (value: unknown): LegacyChild[] => {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      child === null || child === undefined
        ? []
        : [{key: String(index), value: asObject(child)}],
    );
  }
  const object = asObject(value);
  return Object.keys(object)
    .sort()
    .flatMap((key) => {
      const child = object[key];
      return child === null || child === undefined
        ? []
        : [{key, value: asObject(child)}];
    });
};

export const readReviews = (item: JsonObject): LegacyChild[] =>
  readChildren(item.reviews);

export const readPictures = (item: JsonObject): LegacyChild[] =>
  readChildren(item.picture);

export const objectOf = asObject;
