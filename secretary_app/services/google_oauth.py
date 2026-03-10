import os
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
from google_auth_oauthlib.flow import Flow, InstalledAppFlow

_DEFAULT_REDIRECT_URI = 'https://127.0.0.1:5000/oauth-callback'
_DEFAULT_AUTH_URI = 'https://accounts.google.com/o/oauth2/auth'
_DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
_DEFAULT_CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs'


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f'{name} 環境変数を設定してください。')
    return value


def get_google_redirect_uri() -> str:
    return os.getenv('GOOGLE_REDIRECT_URI', _DEFAULT_REDIRECT_URI)


def get_google_client_config() -> dict:
    redirect_uri = get_google_redirect_uri()
    return {
        'web': {
            'client_id': _require_env('GOOGLE_CLIENT_ID'),
            'project_id': os.getenv('GOOGLE_PROJECT_ID', 'secretary-app'),
            'auth_uri': os.getenv('GOOGLE_AUTH_URI', _DEFAULT_AUTH_URI),
            'token_uri': os.getenv('GOOGLE_TOKEN_URI', _DEFAULT_TOKEN_URI),
            'auth_provider_x509_cert_url': os.getenv('GOOGLE_CERTS_URL', _DEFAULT_CERTS_URL),
            'client_secret': _require_env('GOOGLE_CLIENT_SECRET'),
            'redirect_uris': [redirect_uri],
        }
    }


def build_web_flow(scopes, state=None, redirect_uri=None) -> Flow:
    config = get_google_client_config()
    redirect_uri = redirect_uri or config['web']['redirect_uris'][0]
    return Flow.from_client_config(
        config,
        scopes=scopes,
        state=state,
        redirect_uri=redirect_uri,
    )


def build_installed_app_flow(scopes) -> InstalledAppFlow:
    return InstalledAppFlow.from_client_config(get_google_client_config(), scopes=scopes)
