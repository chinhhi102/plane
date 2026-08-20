/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { CornerUpLeft } from "lucide-react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
import { getPageName } from "@plane/utils";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type TPageSubPagesSectionProps = {
  page: TPageInstance;
  storeType: EPageStoreType;
  workspaceSlug: string;
  projectId?: string;
};

export const PageSubPagesSection = observer(function PageSubPagesSection(props: TPageSubPagesSectionProps) {
  const { page, storeType, workspaceSlug, projectId } = props;
  // store hooks
  const pageStore = usePageStore(storeType);
  const { fetchSubPages, fetchPageDetails, getChildPageIds, getPageById } = pageStore;
  // derived values
  const pageId = page.id;
  const parentId = page.parent ?? undefined;
  const parentPage = parentId ? getPageById(parentId) : undefined;
  // fetch sub-pages of the current page
  useSWR(
    pageId && projectId ? `PAGE_SUB_PAGES_${pageId}` : null,
    pageId && projectId ? () => fetchSubPages(workspaceSlug, projectId, pageId) : null
  );
  // fetch the parent page details if not already in the store (e.g. on a deep link)
  useSWR(
    parentId && projectId && !parentPage ? `PAGE_PARENT_DETAILS_${parentId}` : null,
    parentId && projectId ? () => fetchPageDetails(workspaceSlug, projectId, parentId, { trackVisit: false }) : null
  );

  const childPageIds = pageId ? getChildPageIds(pageId) : [];

  if (!parentId && childPageIds.length === 0) return null;

  return (
    <div className="flex-shrink-0 space-y-2 px-page-x py-2">
      {parentId && (
        <Link
          href={parentPage?.getRedirectionLink?.() ?? `/${workspaceSlug}/projects/${projectId}/pages/${parentId}`}
          className="inline-flex items-center gap-1.5 text-13 text-secondary hover:text-primary"
        >
          <CornerUpLeft className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{getPageName(parentPage?.name)}</span>
        </Link>
      )}
      {childPageIds.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-13 font-medium text-tertiary">Sub-pages ({childPageIds.length})</p>
          <div className="flex flex-col">
            {childPageIds.map((childPageId) => {
              const childPage = getPageById(childPageId);
              if (!childPage) return null;
              return (
                <Link
                  key={childPageId}
                  href={
                    childPage.getRedirectionLink?.() ?? `/${workspaceSlug}/projects/${projectId}/pages/${childPageId}`
                  }
                  className="flex items-center gap-2 rounded px-1 py-0.5 text-14 text-secondary hover:text-primary"
                >
                  <span className="flex-shrink-0">
                    {childPage.logo_props?.in_use ? (
                      <Logo logo={childPage.logo_props} size={14} type="lucide" />
                    ) : (
                      <PageIcon className="h-3.5 w-3.5 text-tertiary" />
                    )}
                  </span>
                  <span className="truncate">{getPageName(childPage.name)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
