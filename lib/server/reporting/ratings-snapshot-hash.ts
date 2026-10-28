import { createHash } from "node:crypto";

type RatingValue = {
  gtNumber: number;
  rating: number | null;
};

/** New or missing players alone do not count as a rating change. */
export function haveRatingsChanged(
  previous: RatingValue[],
  current: RatingValue[],
) {
  const previousByPlayer = new Map(
    previous.map(({ gtNumber, rating }) => [gtNumber, rating]),
  );
  return current.some(
    ({ gtNumber, rating }) =>
      previousByPlayer.has(gtNumber) &&
      previousByPlayer.get(gtNumber) !== rating,
  );
}

/** Hash only the player-to-rating mapping; rank and other display fields change more often. */
export function hashRatingValues(items: RatingValue[]) {
  const canonical = [...items]
    .sort((a, b) => a.gtNumber - b.gtNumber)
    .map(({ gtNumber, rating }) => [gtNumber, rating]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
