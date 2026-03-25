from supabase import create_client, Client, ClientOptions
import os

_client: Client | None = None

def get_supabase() -> Client:
    global _client
    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")

    # Create the singleton
    _client = create_client(url, key)
    
    try:
        import httpx
        old_session = _client.postgrest.session
        
        # Replace the session, bringing over all auth headers and the correct endpoint URL
        new_session = httpx.Client(
            base_url=old_session.base_url,
            headers=old_session.headers,
            timeout=old_session.timeout,
            http2=False, # Disable HTTP/2
            limits=httpx.Limits(keepalive_expiry=15.0) # aggressively close idle sockets
        )
        _client.postgrest.session = new_session
    except Exception as e:
        print(f"Warning: Could not patch Supabase httpx session: {e}")

    return _client
