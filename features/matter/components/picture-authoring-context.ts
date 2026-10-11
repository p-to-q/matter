"use client";

import { createContext } from "react";
import type { PictureAuthoring } from "./picture-authoring";

/**
 * The composition root provides the picture turn's dependencies. Without a
 * provider (a fixture that has no store behind it) there is nothing to draw
 * into, so the control never exists.
 */
export const PictureAuthoringContext = createContext<PictureAuthoring | null>(null);
