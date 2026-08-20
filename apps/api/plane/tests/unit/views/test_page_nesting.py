# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Tests for nested-page navigation on the project pages API.

The pages list must return only root pages, while child pages remain
retrievable individually and enumerable through the ``sub-pages`` endpoint
(ordered by ``sort_order``).
"""

import pytest
from uuid import uuid4

from plane.db.models import Page, Project, ProjectMember, ProjectPage, Workspace, WorkspaceMember


@pytest.fixture
def project_with_member(db, create_user):
    workspace = Workspace.objects.create(name="Pages WS", slug="pages-ws", id=uuid4(), owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(name="Docs", identifier="DOCS", workspace=workspace)
    ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
    return workspace, project


def _create_page(workspace, project, user, name, parent=None, sort_order=65535):
    page = Page.objects.create(
        workspace=workspace,
        name=name,
        owned_by=user,
        access=0,
        parent=parent,
        sort_order=sort_order,
    )
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    return page


@pytest.mark.unit
class TestPageNesting:
    @pytest.mark.django_db
    def test_list_returns_only_root_pages(self, api_client, create_user, project_with_member):
        workspace, project = project_with_member
        root = _create_page(workspace, project, create_user, "Root")
        _create_page(workspace, project, create_user, "Child", parent=root)

        api_client.force_authenticate(user=create_user)
        response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/")

        assert response.status_code == 200
        names = [page["name"] for page in response.data]
        assert names == ["Root"]

    @pytest.mark.django_db
    def test_child_page_is_retrievable(self, api_client, create_user, project_with_member):
        workspace, project = project_with_member
        root = _create_page(workspace, project, create_user, "Root")
        child = _create_page(workspace, project, create_user, "Child", parent=root)

        api_client.force_authenticate(user=create_user)
        response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{child.id}/")

        assert response.status_code == 200
        assert response.data["name"] == "Child"
        assert str(response.data["parent"]) == str(root.id)

    @pytest.mark.django_db
    def test_sub_pages_returns_children_ordered_by_sort_order(self, api_client, create_user, project_with_member):
        workspace, project = project_with_member
        root = _create_page(workspace, project, create_user, "Root")
        _create_page(workspace, project, create_user, "Second", parent=root, sort_order=20000)
        _create_page(workspace, project, create_user, "First", parent=root, sort_order=10000)
        # a grandchild must not appear in the direct children of root
        first = Page.objects.get(name="First")
        _create_page(workspace, project, create_user, "Grandchild", parent=first, sort_order=10000)

        api_client.force_authenticate(user=create_user)
        response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{root.id}/sub-pages/")

        assert response.status_code == 200
        names = [page["name"] for page in response.data]
        assert names == ["First", "Second"]
