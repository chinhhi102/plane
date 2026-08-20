/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
import useSWR from "swr";
// plane imports
import { API_BASE_URL } from "@plane/constants";
import { cn } from "@plane/utils";
// components
import { RichTextEditor } from "@/components/editor/rich-text-editor";

type TPublicPageNode = {
  id: string;
  name: string;
  parent: string | null;
  sort_order: number;
  logo_props: { in_use?: string; emoji?: { value?: string } } | null;
};

type TPublicPageMeta = {
  id: string;
  name: string;
  logo_props: TPublicPageNode["logo_props"];
  workspace: string;
};

type TPublicPageDetail = TPublicPageMeta & {
  description_html: string | null;
  parent: string | null;
  updated_at: string;
};

const fetchPublic = async <T,>(path: string): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

const PageEmoji = ({ logoProps }: { logoProps: TPublicPageNode["logo_props"] }) => {
  const emoji = logoProps?.in_use === "emoji" ? logoProps?.emoji?.value : undefined;
  return <span className="w-5 flex-shrink-0 text-center">{emoji ?? "📄"}</span>;
};

const PublicPageTreeNode = (props: {
  node: TPublicPageNode;
  childrenMap: Map<string | null, TPublicPageNode[]>;
  anchor: string;
  activePageId: string;
  depth: number;
}) => {
  const { node, childrenMap, anchor, activePageId, depth } = props;
  const children = childrenMap.get(node.id) ?? [];
  return (
    <>
      <Link to={`/pages/${anchor}/${node.id}`}>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-md py-1.5 pr-2 text-13",
            node.id === activePageId
              ? "bg-layer-transparent-active font-medium text-primary"
              : "text-secondary hover:bg-layer-transparent-hover"
          )}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <PageEmoji logoProps={node.logo_props} />
          <span className="truncate">{node.name || "Untitled"}</span>
        </div>
      </Link>
      {children.map((child) => (
        <PublicPageTreeNode
          key={child.id}
          node={child}
          childrenMap={childrenMap}
          anchor={anchor}
          activePageId={activePageId}
          depth={depth + 1}
        />
      ))}
    </>
  );
};

const PublicPageView = () => {
  // params
  const params = useParams<{ anchor: string; pageId?: string }>();
  const { anchor, pageId } = params;
  // fetch the published tree
  const { data: tree, error: treeError } = useSWR(
    anchor ? `PUBLIC_PAGE_TREE_${anchor}` : null,
    anchor ? () => fetchPublic<TPublicPageNode[]>(`/api/public/anchor/${anchor}/pages/tree/`) : null,
    { revalidateOnFocus: false }
  );
  // derived values
  const rootId = useMemo(() => tree?.find((node) => !tree.some((p) => p.id === node.parent))?.id, [tree]);
  const activePageId = pageId ?? rootId;
  // fetch the active page's content
  const { data: pageDetail, error: pageError } = useSWR(
    anchor && activePageId ? `PUBLIC_PAGE_DETAIL_${anchor}_${activePageId}` : null,
    anchor && activePageId
      ? () => fetchPublic<TPublicPageDetail>(`/api/public/anchor/${anchor}/pages/${activePageId}/`)
      : null,
    { revalidateOnFocus: false }
  );

  const childrenMap = useMemo(() => {
    const map = new Map<string | null, TPublicPageNode[]>();
    for (const node of tree ?? []) {
      const key = node.parent ?? null;
      const siblings = map.get(key) ?? [];
      siblings.push(node);
      map.set(key, siblings);
    }
    for (const nodes of map.values()) nodes.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return map;
  }, [tree]);

  const rootNode = tree?.find((node) => node.id === rootId);

  if (treeError || pageError)
    return (
      <div className="grid h-screen place-items-center px-5">
        <div className="text-center">
          <h3 className="text-18 font-semibold">This page is not available</h3>
          <p className="mt-2 text-13 text-secondary">
            The page you are looking for does not exist or is no longer published.
          </p>
        </div>
      </div>
    );

  if (!tree || !rootNode || !activePageId) return null;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="hidden h-full w-72 flex-shrink-0 flex-col overflow-y-auto border-r border-subtle bg-surface-1 px-3 py-4 md:flex">
        <Link to={`/pages/${anchor}`}>
          <div className="mb-3 flex items-center gap-2 px-2 text-14 font-semibold">
            <PageEmoji logoProps={rootNode.logo_props} />
            <span className="truncate">{rootNode.name || "Untitled"}</span>
          </div>
        </Link>
        <div className="flex flex-col gap-0.5">
          {(childrenMap.get(rootNode.id) ?? []).map((node) => (
            <PublicPageTreeNode
              key={node.id}
              node={node}
              childrenMap={childrenMap}
              anchor={anchor}
              activePageId={activePageId}
              depth={0}
            />
          ))}
        </div>
      </aside>
      <main className="h-full flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-6 py-10">
          {pageDetail ? (
            <>
              <h1 className="mb-6 flex items-center gap-3 text-28 font-bold">
                <PageEmoji logoProps={pageDetail.logo_props} />
                <span className="break-words">{pageDetail.name || "Untitled"}</span>
              </h1>
              {pageDetail.description_html && pageDetail.description_html !== "<p></p>" && (
                <RichTextEditor
                  editable={false}
                  anchor={anchor}
                  id={pageDetail.id}
                  initialValue={pageDetail.description_html}
                  workspaceId={pageDetail.workspace ?? ""}
                />
              )}
            </>
          ) : (
            <div className="animate-pulse space-y-3">
              <div className="h-8 w-2/3 rounded bg-layer-transparent-hover" />
              <div className="h-4 w-full rounded bg-layer-transparent-hover" />
              <div className="h-4 w-5/6 rounded bg-layer-transparent-hover" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PublicPageView;
