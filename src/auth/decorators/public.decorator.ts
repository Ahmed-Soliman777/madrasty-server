import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** Marks a handler or controller to bypass both authentication and role checks. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
