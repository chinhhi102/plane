# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db.models import Q

from rest_framework import status
from rest_framework.response import Response

from plane.api.serializers import PageAPISerializer, PageLiteAPISerializer
from plane.app.permissions import ProjectMemberPermission
from plane.db.models import Page, Project, ProjectPage

from .base import BaseAPIView


def _page_move_creates_cycle(page_id, new_parent_id):
    """Return True when setting new_parent_id as the parent of page_id would create a cycle."""
    ancestor_id = new_parent_id
    while ancestor_id:
        if str(ancestor_id) == str(page_id):
            return True
        ancestor_id = Page.objects.filter(pk=ancestor_id).values_list("parent_id", flat=True).first()
    return False


class PageBaseAPIView(BaseAPIView):
    serializer_class = PageAPISerializer
    model = Page
    permission_classes = [ProjectMemberPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            Page.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(projects__id=self.kwargs.get("project_id"))
            .filter(
                projects__project_projectmember__member=self.request.user,
                projects__project_projectmember__is_active=True,
                projects__archived_at__isnull=True,
            )
            .filter(project_pages__deleted_at__isnull=True)
            .filter(Q(owned_by=self.request.user) | Q(access=0))
            .filter(archived_at__isnull=True)
            .select_related("workspace")
            .distinct()
        )

    def _validate_parent(self, slug, project_id, parent_id):
        """Ensure the parent page exists in the same project."""
        return Page.objects.filter(
            pk=parent_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        ).exists()


class PageListCreateAPIEndpoint(PageBaseAPIView):
    """List root pages of a project and create pages.

    GET  — root pages by default; pass ?parent=<page_id> for the children of a page.
    POST — create a page (name, optional description_html, parent, sort_order, access).
    """

    def get(self, request, slug, project_id):
        parent_id = request.query_params.get("parent")
        queryset = self.get_queryset()
        queryset = queryset.filter(parent_id=parent_id) if parent_id else queryset.filter(parent__isnull=True)
        queryset = queryset.order_by("sort_order", "-created_at")
        return Response(PageLiteAPISerializer(queryset, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug, archived_at__isnull=True)

        parent_id = request.data.get("parent")
        if parent_id and not self._validate_parent(slug, project_id, parent_id):
            return Response(
                {"error": "Parent page does not exist in this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PageAPISerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        page = serializer.save(
            workspace_id=project.workspace_id,
            owned_by=request.user,
            created_by=request.user,
            updated_by=request.user,
        )
        ProjectPage.objects.create(
            workspace_id=project.workspace_id,
            project=project,
            page=page,
            created_by=request.user,
            updated_by=request.user,
        )
        return Response(PageAPISerializer(page).data, status=status.HTTP_201_CREATED)


class PageDetailAPIEndpoint(PageBaseAPIView):
    """Retrieve and update a single page (including its description_html)."""

    def get(self, request, slug, project_id, pk):
        page = self.get_queryset().filter(pk=pk).first()
        if not page:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(PageAPISerializer(page).data, status=status.HTTP_200_OK)

    def patch(self, request, slug, project_id, pk):
        page = self.get_queryset().filter(pk=pk).first()
        if not page:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
        if page.is_locked:
            return Response({"error": "Page is locked"}, status=status.HTTP_400_BAD_REQUEST)

        parent_id = request.data.get("parent")
        if parent_id:
            if not self._validate_parent(slug, project_id, parent_id):
                return Response(
                    {"error": "Parent page does not exist in this project"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if _page_move_creates_cycle(pk, parent_id):
                return Response(
                    {"error": "A page cannot be moved inside itself or its own sub-pages"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = PageAPISerializer(page, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        page = serializer.save(updated_by=request.user)
        # the collaborative editor state is derived from description_html on next
        # open; drop the stale binary/json so the live server regenerates them
        if "description_html" in request.data:
            page.description_binary = None
            page.description_json = {}
            page.save(update_fields=["description_binary", "description_json"])
        return Response(PageAPISerializer(page).data, status=status.HTTP_200_OK)


class PageSubPagesAPIEndpoint(PageBaseAPIView):
    """List the direct sub-pages of a page, ordered by sort_order."""

    def get(self, request, slug, project_id, pk):
        if not self.get_queryset().filter(pk=pk).exists():
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
        queryset = self.get_queryset().filter(parent_id=pk).order_by("sort_order", "-created_at")
        return Response(PageLiteAPISerializer(queryset, many=True).data, status=status.HTTP_200_OK)
