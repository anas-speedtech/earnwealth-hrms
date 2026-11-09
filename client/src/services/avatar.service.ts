import api from './api';

export interface AvatarRecord {
  mimeType: string;
  /** base64 (no data-URL prefix) */
  data: string;
  updatedAt: string;
}

/**
 * Profile photos are stored in the database (user_avatars) and served back
 * through the API — never a static /uploads path — so UAT/Production behind
 * nginx need no extra location block, upload directory, or filesystem
 * permissions. The photo is compressed in the browser before upload so the
 * request stays small.
 */

const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.85;

/**
 * Downscale + re-encode a picked image to at most 512px on the long edge,
 * as a JPEG data URL. Keeps uploads around 50–250 KB regardless of the
 * original file's size.
 */
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  const source: ImageBitmap | HTMLImageElement =
    bitmap ??
    (await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that image file.'));
      };
      img.src = url;
    }));

  const width = source instanceof ImageBitmap ? source.width : source.naturalWidth;
  const height = source instanceof ImageBitmap ? source.height : source.naturalHeight;
  if (!width || !height) throw new Error('Could not read that image file.');

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image compression is not supported in this browser.');
  ctx.drawImage(source as CanvasImageSource, 0, 0, outWidth, outHeight);

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export const avatarService = {
  async getMine(): Promise<AvatarRecord | null> {
    try {
      const { data } = await api.get<AvatarRecord | null>('/me/avatar');
      return data;
    } catch {
      return null;
    }
  },

  /** Compress + upload a picked image. */
  async setMine(file: File): Promise<AvatarRecord> {
    const dataUrl = await compressImage(file);
    const { data } = await api.put<AvatarRecord>('/me/avatar', { image: dataUrl });
    return data;
  },

  async removeMine(): Promise<void> {
    await api.delete('/me/avatar');
  },

  /** Build the <img> src for a stored avatar, or null when none. */
  toImageUrl(record: AvatarRecord | null): string | null {
    return record ? `data:${record.mimeType};base64,${record.data}` : null;
  },
};
