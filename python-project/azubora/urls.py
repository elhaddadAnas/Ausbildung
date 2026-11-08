"""Routes: every URL is mapped to a controller."""
from django.urls import path, re_path

from azubora.controllers import (
    admin,
    ai,
    applications,
    auth,
    messages,
    offers,
    pages,
    profile,
    settings,
    subscription,
    system,
)
from azubora.controllers.base import methods

api = [
    # Authentication
    path('api/auth/login', methods(POST=auth.login)),
    path('api/auth/logout', methods(POST=auth.logout)),
    path('api/auth/register', methods(POST=auth.register)),
    path('api/auth/me', methods(GET=auth.me)),
    # Profile & CV
    path('api/profile', profile.profile),
    path('api/profile/education', profile.education),
    path('api/profile/experience', profile.experience),
    path('api/profile/skills', profile.skills),
    path('api/profile/upload-cv', profile.cv),
    # Offers, applications & AI
    path('api/search', offers.search),
    path('api/favorites', offers.favorites),
    path('api/applications', applications.applications),
    path('api/dashboard', applications.dashboard_view),
    path('api/ai/match', ai.match),
    path('api/ai/cover-letter', ai.cover_letter),
    # Conversations
    path('api/messages', messages.messages_list),
    path('api/messages/sync', messages.messages_sync),
    path('api/messages/<str:application_id>', messages.messages_detail),
    # Settings
    path('api/settings/smtp', settings.smtp),
    path('api/settings/notifications', settings.notifications),
    path('api/settings/auto-apply', settings.auto_apply),
    # Billing & administration
    path('api/subscription', subscription.subscription),
    path('api/subscription/payment', subscription.payment),
    path('api/admin/overview', admin.admin_overview_view),
    path('api/admin/payments', admin.admin_payments),
    path('api/admin/users', admin.admin_users),
    # Operations
    path('api/health', system.health_view),
    path('api/cron/auto-apply', system.cron_view),
]

urlpatterns = api + [
    path('', pages.page),
    re_path(r'^(?P<name>[a-z-]+)/?$', pages.page),
]
