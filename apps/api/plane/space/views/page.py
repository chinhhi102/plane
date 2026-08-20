# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

# Module imports
from .base import BaseAPIView
from plane.db.models import DeployBoard, Page

PAGE_META_FIELDS = ["id", "name", "parent", "sort_order", "logo_props", "updated_at"]


def _public_pages_queryset(workspace_id):
    return Page.objects.filter(
        workspace_id=workspace_id,
        access=0,
        archived_at__isnull=True,
        project_pages__deleted_at__isnull=True,
    ).distinct()


def _get_page_board(anchor):
    return DeployBoard.objects.filter(anchor=anchor, entity_name="page", is_disabled=False).first()


def _collect_subtree(workspace_id, root_id):
    """Breadth-first collection of the published root and all its public descendants."""
    queryset = _public_pages_queryset(workspace_id)
    collected = list(queryset.filter(pk=root_id).values(*PAGE_META_FIELDS))
    if not collected:
        return []
    frontier = [collected[0]["id"]]
    guard = 0
    while frontier and guard < 50:
        children = list(queryset.filter(parent_id__in=frontier).values(*PAGE_META_FIELDS))
        collected.extend(children)
        frontier = [child["id"] for child in children]
        guard += 1
    return collected


class PagePublicMetaEndpoint(BaseAPIView):
    """Meta of a published page: the root page and its workspace."""

    permission_classes = [AllowAny]

    def get(self, request, anchor):
        board = _get_page_board(anchor)
        if not board:
            return Response({"error": "Page is not published"}, status=status.HTTP_404_NOT_FOUND)
        page = (
            _public_pages_queryset(board.workspace_id)
            .filter(pk=board.entity_identifier)
            .values("id", "name", "logo_props", "workspace")
            .first()
        )
        if not page:
            return Response({"error": "Page is not published"}, status=status.HTTP_404_NOT_FOUND)
        return Response(page, status=status.HTTP_200_OK)


class PagePublicTreeEndpoint(BaseAPIView):
    """Flat list of the published page and all its public sub-pages."""

    permission_classes = [AllowAny]

    def get(self, request, anchor):
        board = _get_page_board(anchor)
        if not board:
            return Response({"error": "Page is not published"}, status=status.HTTP_404_NOT_FOUND)
        pages = _collect_subtree(board.workspace_id, board.entity_identifier)
        if not pages:
            return Response({"error": "Page is not published"}, status=status.HTTP_404_NOT_FOUND)
        return Response(pages, status=status.HTTP_200_OK)


class PagePublicDetailEndpoint(BaseAPIView):
    """Full content of one page inside a published page's subtree."""

    permission_classes = [AllowAny]

    def get(self, request, anchor, page_id):
        board = _get_page_board(anchor)
        if not board:
            return Response({"error": "Page is not published"}, status=status.HTTP_404_NOT_FOUND)

        # the requested page must be the published root or one of its descendants
        queryset = _public_pages_queryset(board.workspace_id)
        ancestor_id = page_id
        is_in_subtree = False
        guard = 0
        while ancestor_id and guard < 100:
            if str(ancestor_id) == str(board.entity_identifier):
                is_in_subtree = True
                break
            ancestor_id = queryset.filter(pk=ancestor_id).values_list("parent_id", flat=True).first()
            guard += 1
        if not is_in_subtree:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        page = (
            queryset.filter(pk=page_id)
            .values("id", "name", "description_html", "parent", "logo_props", "workspace", "updated_at")
            .first()
        )
        if not page:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(page, status=status.HTTP_200_OK)
