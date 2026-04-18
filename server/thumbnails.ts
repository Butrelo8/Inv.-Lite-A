import fsPromises from "fs/promises";
import path from "path";
import sharp from "sharp";

const uploadsPath = path.join(process.cwd(), "uploads");
export const thumbsPath = path.join(uploadsPath, "thumbs");

export async function ensureThumbsDir(): Promise<void> {
  await fsPromises.mkdir(thumbsPath, { recursive: true });
}

/**
 * Given an original image path (absolute), generates a 200px-wide WebP thumbnail
 * in uploads/thumbs/ if one does not already exist.
 * Returns the thumb filename (e.g. "42-171234.webp").
 */
export async function ensureThumbnail(originalPath: string): Promise<string> {
  await ensureThumbsDir();
  const base = path.basename(originalPath, path.extname(originalPath));
  const thumbFilename = `${base}.webp`;
  const thumbFilePath = path.join(thumbsPath, thumbFilename);

  let hasThumb = false;
  try {
    const st = await fsPromises.stat(thumbFilePath);
    hasThumb = st.isFile();
  } catch {
    hasThumb = false;
  }

  if (!hasThumb) {
    await sharp(originalPath)
      .resize(200, 200, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(thumbFilePath);
  }

  return thumbFilename;
}

/**
 * Derives the thumb URL from a stored imageUrl (e.g. "/uploads/42-171234.jpg")
 * Returns "/uploads/thumbs/42-171234.webp"
 */
export function toThumbUrl(imageUrl: string): string {
  const base = path.basename(imageUrl, path.extname(imageUrl));
  return `/uploads/thumbs/${base}.webp`;
}
