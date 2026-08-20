/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { ChevronRightIcon, PageIcon } from "@plane/propel/icons";
import { cn, getPageName } from "@plane/utils";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";

type TPagesTreeItemProps = {
  pageId: string;
  depth: number;
  workspaceSlug: string;
  projectId: string;
  handleNavigate?: () => void;
};

const PagesTreeItem = observer(function PagesTreeItem(props: TPagesTreeItemProps) {
  const { pageId, depth, workspaceSlug, projectId, handleNavigate } = props;
  // states
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasFetchedChildren, setHasFetchedChildren] = useState(false);
  // router
  const { pageId: pageIdFromRoute } = useParams();
  // store hooks
  const { fetchSubPages, getChildPageIds, getPageById } = usePageStore(EPageStoreType.PROJECT);
  // derived values
  const page = getPageById(pageId);
  const childPageIds = getChildPageIds(pageId);
  const isActive = pageIdFromRoute?.toString() === pageId;

  if (!page) return null;

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextExpanded = !isExpanded;
    setIsExpanded(nextExpanded);
    if (nextExpanded && !hasFetchedChildren) {
      setHasFetchedChildren(true);
      fetchSubPages(workspaceSlug, projectId, pageId).catch(() => setHasFetchedChildren(false));
    }
  };

  return (
    <>
      <Link href={`/${workspaceSlug}/projects/${projectId}/pages/${pageId}`} onClick={handleNavigate}>
        <div
          className={cn(
            "group flex w-full items-center gap-1 rounded-md py-1 pr-2 outline-none",
            isActive
              ? "bg-layer-transparent-active text-primary"
              : "text-secondary hover:bg-layer-transparent-hover active:bg-layer-transparent-active"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <button
            type="button"
            onClick={handleToggleExpand}
            className="grid size-4 flex-shrink-0 place-items-center rounded hover:bg-layer-transparent-hover"
            aria-label={isExpanded ? "Collapse sub-pages" : "Expand sub-pages"}
          >
            <ChevronRightIcon className={cn("size-3 text-tertiary transition-transform", isExpanded && "rotate-90")} />
          </button>
          <span className="grid size-4 flex-shrink-0 place-items-center">
            {page.logo_props?.in_use ? (
              <Logo logo={page.logo_props} size={13} type="lucide" />
            ) : (
              <PageIcon className="size-3.5 text-tertiary" />
            )}
          </span>
          <span className="truncate text-11 font-medium">{getPageName(page.name)}</span>
        </div>
      </Link>
      {isExpanded &&
        childPageIds.map((childPageId) => (
          <PagesTreeItem
            key={childPageId}
            pageId={childPageId}
            depth={depth + 1}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            handleNavigate={handleNavigate}
          />
        ))}
    </>
  );
});

type TSidebarPagesTreeProps = {
  workspaceSlug: string;
  projectId: string;
  handleNavigate?: () => void;
};

export const SidebarPagesTree = observer(function SidebarPagesTree(props: TSidebarPagesTreeProps) {
  const { workspaceSlug, projectId, handleNavigate } = props;
  // store hooks
  const { fetchPagesList, getRootPageIds } = usePageStore(EPageStoreType.PROJECT);
  // fetch the project's root pages
  useSWR(
    workspaceSlug && projectId ? `SIDEBAR_PAGES_TREE_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchPagesList(workspaceSlug, projectId) : null,
    { revalidateIfStale: false }
  );

  const rootPageIds = getRootPageIds(projectId);

  if (rootPageIds.length === 0) return null;

  return (
    <div className="flex flex-col">
      {rootPageIds.map((pageId) => (
        <PagesTreeItem
          key={pageId}
          pageId={pageId}
          depth={1}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          handleNavigate={handleNavigate}
        />
      ))}
    </div>
  );
});
