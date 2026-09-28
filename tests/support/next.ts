import { expect } from "vitest";

/** Thrown by the mocked `redirect` from next/navigation (see setup-server.ts). */
export class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

/** Run a server action that must end in `redirect(url)`. */
export async function expectRedirect(action: Promise<unknown>, url: string): Promise<void> {
  await expect(action).rejects.toMatchObject({ url });
}
