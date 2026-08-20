# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import Page

from .base import BaseSerializer


class PageAPISerializer(BaseSerializer):
    """Serializer for pages on the public API surface."""

    class Meta:
        model = Page
        fields = [
            "id",
            "name",
            "description_html",
            "parent",
            "sort_order",
            "access",
            "logo_props",
            "is_locked",
            "archived_at",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "is_locked",
            "archived_at",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]


class PageLiteAPISerializer(PageAPISerializer):
    """Page serializer without the document body — used for list responses."""

    class Meta(PageAPISerializer.Meta):
        fields = [field for field in PageAPISerializer.Meta.fields if field != "description_html"]
