# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.space.views import (
    PagePublicDetailEndpoint,
    PagePublicMetaEndpoint,
    PagePublicTreeEndpoint,
)


urlpatterns = [
    path(
        "anchor/<str:anchor>/pages/meta/",
        PagePublicMetaEndpoint.as_view(),
        name="public-page-meta",
    ),
    path(
        "anchor/<str:anchor>/pages/tree/",
        PagePublicTreeEndpoint.as_view(),
        name="public-page-tree",
    ),
    path(
        "anchor/<str:anchor>/pages/<uuid:page_id>/",
        PagePublicDetailEndpoint.as_view(),
        name="public-page-detail",
    ),
]
