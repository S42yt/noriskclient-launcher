use dashmap::DashMap;
use std::sync::OnceLock;
use url::Url;
use uuid::Uuid;

const ALLOWED_RETURN_HOSTS: [&str; 3] = ["norisk.gg", "www.norisk.gg", "staging.norisk.gg"];

static SESSIONS: OnceLock<DashMap<Uuid, String>> = OnceLock::new();

fn sessions() -> &'static DashMap<Uuid, String> {
    SESSIONS.get_or_init(DashMap::new)
}

pub fn sanitize_return_url(raw: &str) -> Option<String> {
    let parsed = Url::parse(raw).ok()?;
    if parsed.scheme() != "https" {
        return None;
    }
    let host = parsed.host_str()?;
    if !ALLOWED_RETURN_HOSTS.contains(&host) {
        return None;
    }
    Some(parsed.to_string())
}

pub fn register(profile_id: Uuid, return_url: String) {
    sessions().insert(profile_id, return_url);
}

pub fn take(profile_id: &Uuid) -> Option<String> {
    sessions().remove(profile_id).map(|(_, url)| url)
}
