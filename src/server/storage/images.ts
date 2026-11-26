import sharp from "sharp";

export class InvalidImageError extends Error {
  constructor(options?: ErrorOptions) {
    super("La imagen no es válida", options);
    this.name = "InvalidImageError";
  }
}

export const PHOTO_FULL_MAX_PX = 2000;
export const PHOTO_THUMB_MAX_PX = 400;

export async function processPhoto(input: Buffer): Promise<{
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}> {
  try {
    const metadata = await sharp(input).metadata();
    if (!metadata.format) throw new InvalidImageError();
    const full = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({
        width: PHOTO_FULL_MAX_PX,
        height: PHOTO_FULL_MAX_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({
        width: PHOTO_THUMB_MAX_PX,
        height: PHOTO_THUMB_MAX_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 70 })
      .toBuffer();
    return { full: full.data, thumb, width: full.info.width, height: full.info.height };
  } catch (error) {
    if (error instanceof InvalidImageError) throw error;
    throw new InvalidImageError({ cause: error });
  }
}

export async function processDocumentImage(
  input: Buffer,
): Promise<{ jpeg: Buffer; width: number; height: number }> {
  try {
    const metadata = await sharp(input).metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new InvalidImageError();
    const result = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({
        width: PHOTO_FULL_MAX_PX,
        height: PHOTO_FULL_MAX_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: result.data, width: result.info.width, height: result.info.height };
  } catch (error) {
    if (error instanceof InvalidImageError) throw error;
    throw new InvalidImageError({ cause: error });
  }
}
