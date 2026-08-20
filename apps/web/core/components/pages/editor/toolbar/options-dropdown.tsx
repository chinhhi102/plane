/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowUpToLine, Clipboard, Globe, History, Link2 } from "lucide-react";
// plane imports
import { SPACE_BASE_PATH, SPACE_BASE_URL } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ToggleSwitch } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
import { usePageFilters } from "@/hooks/use-page-filters";
import { useQueryParams } from "@/hooks/use-query-params";
// plane web imports
import type { TPageNavigationPaneTab } from "@/components/pages/navigation-pane/tab-panels";
import type { EPageStoreType } from "@/hooks/store";
// services
import { ProjectPageService } from "@/services/page";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageActions } from "../../dropdowns";
import { ExportPageModal } from "../../modals/export-page-modal";
import { PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM } from "../../navigation-pane";

const projectPageService = new ProjectPageService();

type Props = {
  page: TPageInstance;
  storeType: EPageStoreType;
};

export const PageOptionsDropdown = observer(function PageOptionsDropdown(props: Props) {
  const { page, storeType } = props;
  // states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  // navigation
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  // store values
  const {
    id: pageId,
    name,
    isContentEditable,
    canCurrentUserChangeAccess,
    editor: { editorRef },
  } = page;
  // publish status
  const { data: publishStatus, mutate: mutatePublishStatus } = useSWR(
    workspaceSlug && projectId && pageId && canCurrentUserChangeAccess ? `PAGE_PUBLISH_STATUS_${pageId}` : null,
    workspaceSlug && projectId && pageId
      ? () => projectPageService.getPagePublishStatus(workspaceSlug.toString(), projectId.toString(), pageId)
      : null
  );
  const publishedAnchor = publishStatus?.anchor ?? null;
  const getPublicPageLink = (anchor: string) => {
    const spaceAppUrl = (SPACE_BASE_URL.trim() === "" ? window.location.origin : SPACE_BASE_URL) + SPACE_BASE_PATH;
    return `${spaceAppUrl}/pages/${anchor}`;
  };
  const copyPublicLink = (anchor: string) =>
    copyTextToClipboard(getPublicPageLink(anchor)).then(() =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Public page link copied to clipboard.",
      })
    );
  // page filters
  const { isFullWidth, handleFullWidth, isStickyToolbarEnabled, handleStickyToolbar } = usePageFilters();
  // query params
  const { updateQueryParams } = useQueryParams();
  // menu items list
  const EXTRA_MENU_OPTIONS = useMemo(
    function EXTRA_MENU_OPTIONS(): React.ComponentProps<typeof PageActions>["extraOptions"] {
      return [
        {
          key: "full-screen",
          action: () => handleFullWidth(!isFullWidth),
          customContent: (
            <>
              Full width
              <ToggleSwitch value={isFullWidth} onChange={() => {}} />
            </>
          ),
          className: "flex items-center justify-between gap-2",
        },
        {
          key: "sticky-toolbar",
          action: () => handleStickyToolbar(!isStickyToolbarEnabled),
          customContent: (
            <>
              Sticky toolbar
              <ToggleSwitch value={isStickyToolbarEnabled} onChange={() => {}} />
            </>
          ),
          className: "flex items-center justify-between gap-2",
          shouldRender: isContentEditable,
        },
        {
          key: "copy-markdown",
          action: () => {
            if (!editorRef) return;
            editorRef.copyMarkdownToClipboard();
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: "Success!",
              message: "Markdown copied to clipboard.",
            });
          },
          title: "Copy markdown",
          icon: Clipboard,
          shouldRender: true,
        },
        {
          key: "version-history",
          action: () => {
            // update query param to show info tab in navigation pane
            const updatedRoute = updateQueryParams({
              paramsToAdd: {
                [PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM]: "info" satisfies TPageNavigationPaneTab,
              },
            });
            router.push(updatedRoute);
          },
          title: "Version history",
          icon: History,
          shouldRender: true,
        },
        {
          key: "export",
          action: () => setIsExportModalOpen(true),
          title: "Export",
          icon: ArrowUpToLine,
          shouldRender: true,
        },
        {
          key: "publish",
          action: () => {
            if (!workspaceSlug || !projectId || !pageId) return;
            projectPageService
              .publishPage(workspaceSlug.toString(), projectId.toString(), pageId)
              .then((response) => {
                mutatePublishStatus({ anchor: response.anchor }, { revalidate: false });
                return copyPublicLink(response.anchor);
              })
              .catch(() =>
                setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to publish the page." })
              );
          },
          title: "Publish to web",
          icon: Globe,
          shouldRender: canCurrentUserChangeAccess && !publishedAnchor,
        },
        {
          key: "copy-public-link",
          action: () => {
            if (publishedAnchor) copyPublicLink(publishedAnchor);
          },
          title: "Copy public link",
          icon: Link2,
          shouldRender: canCurrentUserChangeAccess && !!publishedAnchor,
        },
        {
          key: "unpublish",
          action: () => {
            if (!workspaceSlug || !projectId || !pageId) return;
            projectPageService
              .unpublishPage(workspaceSlug.toString(), projectId.toString(), pageId)
              .then(() => {
                mutatePublishStatus({ anchor: null }, { revalidate: false });
                return setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Page unpublished." });
              })
              .catch(() =>
                setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to unpublish the page." })
              );
          },
          title: "Unpublish",
          icon: Globe,
          shouldRender: canCurrentUserChangeAccess && !!publishedAnchor,
        },
      ];
    },
    [
      handleFullWidth,
      isFullWidth,
      handleStickyToolbar,
      isStickyToolbarEnabled,
      isContentEditable,
      editorRef,
      updateQueryParams,
      router,
      setIsExportModalOpen,
      workspaceSlug,
      projectId,
      pageId,
      canCurrentUserChangeAccess,
      publishedAnchor,
      mutatePublishStatus,
    ]
  );

  return (
    <>
      <ExportPageModal
        editorRef={editorRef}
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        pageTitle={name ?? ""}
      />
      <PageActions
        extraOptions={EXTRA_MENU_OPTIONS}
        optionsOrder={[
          "full-screen",
          "sticky-toolbar",
          "copy-markdown",
          "version-history",
          "make-a-copy",
          "archive-restore",
          "delete",
          "toggle-access",
          "export",
          "publish",
          "copy-public-link",
          "unpublish",
        ]}
        page={page}
        storeType={storeType}
      />
    </>
  );
});
