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

    @pytest.mark.django_db
    def test_move_page_updates_parent_and_sort_order(self, api_client, create_user, project_with_member):
        workspace, project = project_with_member
        root_a = _create_page(workspace, project, create_user, "Root A")
        root_b = _create_page(workspace, project, create_user, "Root B")
        child = _create_page(workspace, project, create_user, "Child", parent=root_a)

        api_client.force_authenticate(user=create_user)
        response = api_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{child.id}/",
            {"parent": str(root_b.id), "sort_order": 5000},
            format="json",
        )

        assert response.status_code == 200
        child.refresh_from_db()
        assert child.parent_id == root_b.id
        assert child.sort_order == 5000

    @pytest.mark.django_db
    def test_move_page_rejects_cycle(self, api_client, create_user, project_with_member):
        workspace, project = project_with_member
        root = _create_page(workspace, project, create_user, "Root")
        child = _create_page(workspace, project, create_user, "Child", parent=root)
        grandchild = _create_page(workspace, project, create_user, "Grandchild", parent=child)

        api_client.force_authenticate(user=create_user)
        # moving the root under its own grandchild must be rejected
        response = api_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{root.id}/",
            {"parent": str(grandchild.id)},
            format="json",
        )
        assert response.status_code == 400
        root.refresh_from_db()
        assert root.parent_id is None

        # moving a page under itself must be rejected
        response = api_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{child.id}/",
            {"parent": str(child.id)},
            format="json",
        )
        assert response.status_code == 400


@pytest.mark.unit
class TestPageExternalAPI:
    """The public /api/v1 pages surface, authenticated with an API key."""

    def _headers(self, api_token):
        return {"HTTP_X_API_KEY": api_token.token}

    @pytest.mark.django_db
    def test_v1_list_returns_roots_without_body(self, api_client, create_user, api_token, project_with_member):
        workspace, project = project_with_member
        root = _create_page(workspace, project, create_user, "Root")
        _create_page(workspace, project, create_user, "Child", parent=root)

        response = api_client.get(
            f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/pages/", **self._headers(api_token)
        )
        assert response.status_code == 200
        assert [p["name"] for p in response.data] == ["Root"]
        assert "description_html" not in response.data[0]

    @pytest.mark.django_db
    def test_v1_detail_and_sub_pages(self, api_client, create_user, api_token, project_with_member):
        workspace, project = project_with_member
        root = _create_page(workspace, project, create_user, "Root")
        child = _create_page(workspace, project, create_user, "Child", parent=root, sort_order=10000)
        child.description_html = "<h1>Child</h1>"
        child.save()

        response = api_client.get(
            f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/pages/{child.id}/",
            **self._headers(api_token),
        )
        assert response.status_code == 200
        assert response.data["description_html"] == "<h1>Child</h1>"

        response = api_client.get(
            f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/pages/{root.id}/sub-pages/",
            **self._headers(api_token),
        )
        assert response.status_code == 200
        assert [p["name"] for p in response.data] == ["Child"]

    @pytest.mark.django_db
    def test_v1_create_child_page(self, api_client, create_user, api_token, project_with_member):
        workspace, project = project_with_member
        root = _create_page(workspace, project, create_user, "Root")

        response = api_client.post(
            f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/pages/",
            {"name": "Bot page", "description_html": "<h1>Bot page</h1>", "parent": str(root.id)},
            format="json",
            **self._headers(api_token),
        )
        assert response.status_code == 201
        page = Page.objects.get(pk=response.data["id"])
        assert page.parent_id == root.id
        assert ProjectPage.objects.filter(page=page, project=project).exists()

    @pytest.mark.django_db
    def test_v1_update_body_clears_binary_and_rejects_cycle(
        self, api_client, create_user, api_token, project_with_member
    ):
        workspace, project = project_with_member
        root = _create_page(workspace, project, create_user, "Root")
        child = _create_page(workspace, project, create_user, "Child", parent=root)
        child.description_binary = b"stale-binary"
        child.save()

        response = api_client.patch(
            f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/pages/{child.id}/",
            {"description_html": "<h1>Updated</h1>"},
            format="json",
            **self._headers(api_token),
        )
        assert response.status_code == 200
        child.refresh_from_db()
        assert child.description_html == "<h1>Updated</h1>"
        assert child.description_binary is None

        response = api_client.patch(
            f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/pages/{root.id}/",
            {"parent": str(child.id)},
            format="json",
            **self._headers(api_token),
        )
        assert response.status_code == 400


@pytest.mark.unit
class TestPagePublish:
    """Publishing a page to the web and the anonymous public endpoints."""

    @pytest.mark.django_db
    def test_publish_and_public_access(self, api_client, create_user, project_with_member):
        workspace, project = project_with_member
        root = _create_page(workspace, project, create_user, "Handbook")
        child = _create_page(workspace, project, create_user, "Chapter", parent=root, sort_order=10000)
        child.description_html = "<h1>Chapter</h1>"
        child.save()
        outside = _create_page(workspace, project, create_user, "Unrelated")

        base = f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{root.id}/publish/"
        api_client.force_authenticate(user=create_user)
        response = api_client.get(base)
        assert response.status_code == 200
        assert response.data["anchor"] is None

        response = api_client.post(base)
        assert response.status_code == 200
        anchor = response.data["anchor"]
        assert anchor

        # anonymous access from a fresh client
        api_client.force_authenticate(user=None)
        response = api_client.get(f"/api/public/anchor/{anchor}/pages/meta/")
        assert response.status_code == 200
        assert response.data["name"] == "Handbook"

        response = api_client.get(f"/api/public/anchor/{anchor}/pages/tree/")
        assert response.status_code == 200
        assert sorted(p["name"] for p in response.data) == ["Chapter", "Handbook"]

        response = api_client.get(f"/api/public/anchor/{anchor}/pages/{child.id}/")
        assert response.status_code == 200
        assert response.data["description_html"] == "<h1>Chapter</h1>"

        # a page outside the published subtree stays hidden
        response = api_client.get(f"/api/public/anchor/{anchor}/pages/{outside.id}/")
        assert response.status_code == 404

    @pytest.mark.django_db
    def test_unpublish_revokes_public_access(self, api_client, create_user, project_with_member):
        workspace, project = project_with_member
        root = _create_page(workspace, project, create_user, "Handbook")

        base = f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{root.id}/publish/"
        api_client.force_authenticate(user=create_user)
        anchor = api_client.post(base).data["anchor"]
        assert api_client.delete(base).status_code == 204

        api_client.force_authenticate(user=None)
        assert api_client.get(f"/api/public/anchor/{anchor}/pages/meta/").status_code == 404
