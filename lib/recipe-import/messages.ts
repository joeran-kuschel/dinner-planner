import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ImportErrorCode } from "@/lib/recipe-import/errors";

/** What the user is told for each failure; translated where it is shown (`i18n._(…)`). Safe for client code. */
export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, MessageDescriptor> = {
  "invalid-url": msg`Enter a web address starting with http:// or https://.`,
  blocked: msg`That address cannot be imported: it points to this computer or to a private network.`,
  timeout: msg`The page took too long to answer. Try again later.`,
  "too-large": msg`The page is too large to import.`,
  "not-html": msg`That address is not a web page.`,
  "not-image": msg`That address is not a picture.`,
  unreachable: msg`The page could not be fetched. Check the address and try again.`,
  "no-recipe": msg`No recipe was found on that page. Importing needs recipe data that the website publishes for search engines.`,
  cancelled: msg`The import was cancelled.`,
};
