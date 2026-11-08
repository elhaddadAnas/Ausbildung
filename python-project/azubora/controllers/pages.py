"""Page controller: serves the compiled React pages (the UI) and redirects
signed-out visitors from protected pages to /login."""
from urllib.parse import urlencode

from django.conf import settings
from django.http import FileResponse, HttpRequest, HttpResponse, HttpResponseRedirect
from django.shortcuts import render

from azubora.controllers.session import clear_token_cookie
from azubora.services.authentication import TOKEN_COOKIE, verify_jwt

PUBLIC_PAGES = {'', 'login', 'register'}
PROTECTED_PAGES = {'dashboard', 'search', 'ai-matching', 'applications', 'messages', 'profile', 'calendar',
                   'settings', 'subscription', 'admin'}


def _page_file(name: str):
    candidates = ['index.html'] if not name else [f'{name}.html', f'{name}/index.html']
    for candidate in candidates:
        path = settings.FRONTEND_DIST / candidate
        if path.is_file():
            return path
    return None


def page(request: HttpRequest, name: str = '') -> HttpResponse:
    name = name.strip('/')
    if name not in PUBLIC_PAGES and name not in PROTECTED_PAGES:
        not_found = _page_file('404')
        if not_found:
            return FileResponse(open(not_found, 'rb'), content_type='text/html; charset=utf-8', status=404)
        return render(request, 'azubora/not_found.html', status=404)

    if name in PROTECTED_PAGES:
        token = request.COOKIES.get(TOKEN_COOKIE)
        if not token or not settings.JWT_SECRET:
            return HttpResponseRedirect('/login?' + urlencode({'next': request.path}))
        if verify_jwt(token) is None:
            response = HttpResponseRedirect('/login')
            clear_token_cookie(response)
            return response

    path = _page_file(name)
    if path is None:
        return render(request, 'azubora/frontend_missing.html', {'frontend_dist': settings.FRONTEND_DIST}, status=503)
    response = FileResponse(open(path, 'rb'), content_type='text/html; charset=utf-8')
    response['Cache-Control'] = 'no-cache'
    return response
