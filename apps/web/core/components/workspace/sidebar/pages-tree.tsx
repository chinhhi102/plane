/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachInstruction, extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { ChevronRightIcon, PageIcon } from "@plane/propel/icons";
import type { InstructionType } from "@plane/types";
import { DropIndicator } from "@plane/ui";
import { cn, getPageName } from "@plane/utils";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";

const PAGE_TREE_DRAG_TYPE = "PROJECT_PAGE_TREE_ITEM";

type TPageDragData = {
  dragType: string;
  id: string;
  parentId: string | null;
  projectId: string;
};

type TPagesTreeItemProps = {
  pageId: string;
  depth: number;
  workspaceSlug: string;
  projectId: string;
  parentId: string | null;
  isLastChild: boolean;
  activeAncestorIds: string[];
  handleNavigate?: () => void;
};

const PagesTreeItem = observer(function PagesTreeItem(props: TPagesTreeItemProps) {
  const { pageId, depth, workspaceSlug, projectId, parentId, isLastChild, activeAncestorIds, handleNavigate } = props;
  // states
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [hasFetchedChildren, setHasFetchedChildren] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | undefined>(undefined);
  // refs
  const elementRef = useRef<HTMLDivElement>(null);
  // router
  const { pageId: pageIdFromRoute } = useParams();
  // store hooks
  const { fetchSubPages, getChildPageIds, getRootPageIds, getPageById, movePageInHierarchy } = usePageStore(
    EPageStoreType.PROJECT
  );
  // derived values
  const page = getPageById(pageId);
  const childPageIds = getChildPageIds(pageId);
  const isActive = pageIdFromRoute?.toString() === pageId;
  // auto-expand ancestors of the active page; a manual toggle always wins
  const isExpanded = manualExpanded ?? activeAncestorIds.includes(pageId);

  // make sure children are loaded whenever the node is expanded (incl. auto-expansion)
  useEffect(() => {
    if (isExpanded && !hasFetchedChildren) {
      setHasFetchedChildren(true);
      fetchSubPages(workspaceSlug, projectId, pageId).catch(() => setHasFetchedChildren(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, hasFetchedChildren, pageId]);

  // returns true if `candidateId` is `ancestorId` or one of its descendants
  const isInSubtreeOf = (candidateId: string, ancestorId: string) => {
    let currentId: string | null | undefined = candidateId;
    let guard = 0;
    while (currentId && guard < 100) {
      if (currentId === ancestorId) return true;
      currentId = getPageById(currentId)?.parent ?? null;
      guard += 1;
    }
    return false;
  };

  const computeSortOrder = (siblingIds: string[], insertIndex: number) => {
    const orderAt = (index: number) => {
      const sibling = index >= 0 && index < siblingIds.length ? getPageById(siblingIds[index]) : undefined;
      return sibling?.sort_order;
    };
    const prevOrder = orderAt(insertIndex - 1);
    const nextOrder = orderAt(insertIndex);
    if (prevOrder !== undefined && nextOrder !== undefined) return (prevOrder + nextOrder) / 2;
    if (nextOrder !== undefined) return nextOrder - 10000;
    if (prevOrder !== undefined) return prevOrder + 10000;
    return 10000;
  };

  const handleDropOnThisItem = (sourceId: string, dropInstruction: InstructionType) => {
    let newParent: string | null;
    let newSortOrder: number;
    if (dropInstruction === "make-child") {
      newParent = pageId;
      const siblings = getChildPageIds(pageId).filter((id) => id !== sourceId);
      newSortOrder = computeSortOrder(siblings, siblings.length);
    } else {
      newParent = parentId;
      const siblings = (parentId ? getChildPageIds(parentId) : getRootPageIds(projectId)).filter(
        (id) => id !== sourceId
      );
      const targetIndex = siblings.indexOf(pageId);
      if (targetIndex === -1) return;
      const insertIndex = dropInstruction === "reorder-above" ? targetIndex : targetIndex + 1;
      newSortOrder = computeSortOrder(siblings, insertIndex);
    }
    movePageInHierarchy(workspaceSlug, projectId, sourceId, { parent: newParent, sort_order: newSortOrder }).catch(
      (error) => console.error("Failed to move page", error)
    );
  };

  // drag and drop
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const initialData: TPageDragData = { dragType: PAGE_TREE_DRAG_TYPE, id: pageId, parentId, projectId };

    return combine(
      draggable({
        element,
        canDrag: () => page?.canCurrentUserEditPage !== false,
        getInitialData: () => ({ ...initialData }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => {
          const sourceData = source.data as Partial<TPageDragData>;
          if (sourceData.dragType !== PAGE_TREE_DRAG_TYPE || !sourceData.id) return false;
          if (sourceData.projectId !== projectId) return false;
          if (sourceData.id === pageId) return false;
          // cannot drop a page inside its own subtree
          if (isInSubtreeOf(pageId, sourceData.id)) return false;
          return true;
        },
        getData: ({ input, element: targetElement }) =>
          attachInstruction(
            { ...initialData },
            {
              input,
              element: targetElement,
              currentLevel: depth,
              indentPerLevel: 12,
              mode: isLastChild ? "last-in-group" : "standard",
            }
          ),
        onDrag: ({ self }) => {
          const extracted = extractInstruction(self.data)?.type;
          setInstruction(extracted === "instruction-blocked" ? undefined : extracted);
        },
        onDragLeave: () => setInstruction(undefined),
        onDrop: ({ self, source }) => {
          setInstruction(undefined);
          const sourceData = source.data as Partial<TPageDragData>;
          const extracted = extractInstruction(self.data)?.type;
          if (!sourceData.id || !extracted || extracted === "instruction-blocked") return;
          handleDropOnThisItem(sourceData.id, extracted);
        },
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, parentId, projectId, depth, isLastChild, page, isExpanded]);

  if (!page) return null;

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setManualExpanded(!isExpanded);
  };

  return (
    <>
      <div>
        <DropIndicator isVisible={instruction === "reorder-above"} />
        <Link href={`/${workspaceSlug}/projects/${projectId}/pages/${pageId}`} onClick={handleNavigate}>
          <div
            ref={elementRef}
            className={cn(
              "group flex w-full items-center gap-1 rounded-md py-1 pr-2 outline-none",
              isActive
                ? "bg-layer-transparent-active text-primary"
                : "text-secondary hover:bg-layer-transparent-hover active:bg-layer-transparent-active",
              instruction === "make-child" && "bg-layer-transparent-active",
              isDragging && "opacity-50"
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <button
              type="button"
              onClick={handleToggleExpand}
              className="grid size-4 flex-shrink-0 place-items-center rounded hover:bg-layer-transparent-hover"
              aria-label={isExpanded ? "Collapse sub-pages" : "Expand sub-pages"}
            >
              <ChevronRightIcon
                className={cn("size-3 text-tertiary transition-transform", isExpanded && "rotate-90")}
              />
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
        {isLastChild && <DropIndicator isVisible={instruction === "reorder-below"} />}
      </div>
      {isExpanded &&
        childPageIds.map((childPageId, index) => (
          <PagesTreeItem
            key={childPageId}
            pageId={childPageId}
            depth={depth + 1}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            parentId={pageId}
            isLastChild={index === childPageIds.length - 1}
            activeAncestorIds={activeAncestorIds}
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
  // router
  const { pageId: activePageIdParam } = useParams();
  // store hooks
  const { fetchPagesList, fetchPageDetails, getRootPageIds, getPageById } = usePageStore(EPageStoreType.PROJECT);
  // fetch the project's root pages
  useSWR(
    workspaceSlug && projectId ? `SIDEBAR_PAGES_TREE_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchPagesList(workspaceSlug, projectId) : null,
    { revalidateIfStale: false }
  );

  // walk up from the active page collecting its ancestors so they auto-expand;
  // stop at the first ancestor that is not in the store yet and fetch it
  const activePageId = activePageIdParam?.toString();
  const activePage = activePageId ? getPageById(activePageId) : undefined;
  const isActivePageInProject = !!activePage?.project_ids?.includes(projectId);
  const activeAncestorIds: string[] = [];
  let missingAncestorId: string | undefined;
  if (isActivePageInProject) {
    let currentId = activePage?.parent ?? undefined;
    let guard = 0;
    while (currentId && guard < 100) {
      activeAncestorIds.push(currentId);
      const currentPage = getPageById(currentId);
      if (!currentPage) {
        missingAncestorId = currentId;
        break;
      }
      currentId = currentPage.parent ?? undefined;
      guard += 1;
    }
  }
  // load the missing ancestor; the walk above re-runs reactively as it arrives
  useSWR(
    missingAncestorId ? `SIDEBAR_PAGES_TREE_ANCESTOR_${missingAncestorId}` : null,
    missingAncestorId
      ? () => fetchPageDetails(workspaceSlug, projectId, missingAncestorId, { trackVisit: false })
      : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const rootPageIds = getRootPageIds(projectId);

  if (rootPageIds.length === 0) return null;

  return (
    <div className="flex flex-col">
      {rootPageIds.map((pageId, index) => (
        <PagesTreeItem
          key={pageId}
          pageId={pageId}
          depth={1}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          parentId={null}
          isLastChild={index === rootPageIds.length - 1}
          activeAncestorIds={activeAncestorIds}
          handleNavigate={handleNavigate}
        />
      ))}
    </div>
  );
});
