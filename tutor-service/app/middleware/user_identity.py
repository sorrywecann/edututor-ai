"""Anonymous-by-default user identity middleware.

Resolution priority on every request:
    1. ``X-EduTutor-User-Id`` header — primary path. The frontend's existing
       ``getPersistentUserId()`` (``core/src/lib/api.ts``) generates and
       stores a UUID in localStorage under key ``edututor_user_id`` and
       sends it as this header on every API call. Preserving this path is
       what keeps pre-Phase-8 users from being orphaned from their
       conversations and flashcards.
    2. ``edu_uid`` cookie — server-issued backup written on first request
       when neither the header nor a valid cookie was present. Survives a
       localStorage clear as long as the same browser is reused.
    3. Generate a new UUID, create an anonymous ``User`` row, set the
       cookie on the response.

After this middleware runs, ``request.state.user_id`` is always set to a
non-empty UUID string and the corresponding ``users`` row exists.

Failure mode: if the database is unavailable, the middleware sets
``request.state.user_id`` to a freshly-generated UUID *without* a DB row
and continues. Downstream handlers that need a real user row will fail at
their own write site — the chat endpoint specifically degrades gracefully
when skills are not enabled, so the Slovak tutor flow keeps working even
in this edge case.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.database import AsyncSessionLocal
from app.services.user_service import get_or_create_anon_user

logger = logging.getLogger(__name__)

COOKIE_NAME = "edu_uid"
HEADER_NAME = "x-edututor-user-id"
COOKIE_MAX_AGE = 10 * 365 * 24 * 3600


def _is_valid_uuid(value: Optional[str]) -> bool:
    if not value:
        return False
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


class UserIdentityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        header_id = request.headers.get(HEADER_NAME)
        cookie_id = request.cookies.get(COOKIE_NAME)

        resolved_id: Optional[str] = None
        if _is_valid_uuid(header_id):
            resolved_id = header_id
        elif _is_valid_uuid(cookie_id):
            resolved_id = cookie_id

        set_cookie_value: Optional[str] = None
        if resolved_id is None:
            resolved_id = str(uuid.uuid4())
            set_cookie_value = resolved_id
        elif not _is_valid_uuid(cookie_id) or cookie_id != resolved_id:
            set_cookie_value = resolved_id

        try:
            async with AsyncSessionLocal() as session:
                await get_or_create_anon_user(resolved_id, session)
                await session.commit()
        except Exception as exc:  # noqa: BLE001 — identity must never crash a request
            logger.warning(
                "user_identity_middleware: DB upsert failed for %s: %s",
                resolved_id, exc,
            )

        request.state.user_id = resolved_id

        response: Response = await call_next(request)

        if set_cookie_value is not None:
            response.set_cookie(
                key=COOKIE_NAME,
                value=set_cookie_value,
                max_age=COOKIE_MAX_AGE,
                httponly=True,
                samesite="lax",
                secure=False,
                path="/",
            )

        return response
