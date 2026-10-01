import { t } from "@lingui/core/macro";
import Link from "next/link";
import { getServerI18n } from "@/lib/i18n/server";

/**
 * Unknown addresses, and recipes that were deleted (`notFound()`). Next.js
 * takes no metadata from this file, so the tab keeps the app's name.
 */
export default async function NotFound() {
  const { i18n } = await getServerI18n();

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="page-title">{t(i18n)`Page not found`}</h1>
      <p className="text-sm text-muted">{t(i18n)`This page does not exist, or the recipe was deleted.`}</p>
      <Link href="/" className="btn-secondary">
        {t(i18n)`Back to the plan`}
      </Link>
    </div>
  );
}
