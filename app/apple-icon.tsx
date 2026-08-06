import { matterIconImage } from "@/features/matter/brand/icon-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS masks its own corners, so the shared full-bleed tile is already correct. */
export default function appleIcon() {
  return matterIconImage(size.width);
}
