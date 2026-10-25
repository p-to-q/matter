"use client";

import { lazy, memo, Suspense } from "react";
import type { MatterLocale } from "../config/locales";
import type { ImagePointer } from "../tree/image-pointer";
import { PicturePlaceholder } from "./PicturePlaceholder";

// Picture code (the loader, the five-locale copy, the frame) is needed only by
// a passage that carries a picture, so it stays out of the initial bundle.
const PassagePicture = lazy(() =>
  import("./PassagePicture").then((module) => ({ default: module.PassagePicture })));

/** Renders the passage picture; until its code arrives, the same fixed-size box. */
export const LazyPassagePicture = memo(function LazyPassagePicture({
  locale,
  pointer,
}: Readonly<{ locale: MatterLocale; pointer: ImagePointer }>) {
  return (
    <Suspense fallback={<PicturePlaceholder pointer={pointer} />}>
      <PassagePicture locale={locale} pointer={pointer} />
    </Suspense>
  );
});
