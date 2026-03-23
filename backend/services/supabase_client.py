from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
import httpx
import os


def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")

    # Disable keep-alive so httpx never reuses a connection
    # that Supabase's load balancer has silently killed (~10min idle timeout)
    http_client = httpx.Client(
        timeout=30,
        limits=httpx.Limits(
            max_keepalive_connections=0,  # no persistent connections
            max_connections=10,
        )
    )

    options = ClientOptions(postgrest_client_timeout=30)
    client = create_client(url, key, options=options)

    # Patch the postgrest session to use our no-keepalive transport
    client.postgrest.session = http_client

    return client