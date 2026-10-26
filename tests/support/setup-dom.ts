import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// A component test has no Next.js app router: `useRouter` would throw. A test that looks at the router mocks the module
// itself (and then wins over this).
vi.mock("next/navigation", () => {
  // One of each, so a component sees the same router on every render.
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
  const searchParams = new URLSearchParams();
  return { useRouter: () => router, usePathname: () => "/", useSearchParams: () => searchParams };
});

afterEach(cleanup);
