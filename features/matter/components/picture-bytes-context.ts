"use client";

import { createContext } from "react";
import {
  UNAVAILABLE_PICTURE_BYTES,
  type PictureBytesSource,
} from "../interaction/picture-bytes-source";

/**
 * The composition root provides the one bytes source. Without a provider no
 * store is known to exist, so every picture honestly reads as unavailable.
 */
export const PictureBytesContext = createContext<PictureBytesSource>(UNAVAILABLE_PICTURE_BYTES);
