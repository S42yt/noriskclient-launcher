use crate::state::state_manager::State;
use crate::utils::testing_session;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use url::Url;

#[derive(Clone, Serialize)]
pub struct AuthBridgeRequest {
    pub session_id: String,
    pub username: String,
}

#[derive(Clone, Serialize)]
pub struct AuthBridgeResult {
    pub success: bool,
    pub message: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct TestLaunchRequest {
    pub issue_id: String,
    pub title: String,
    pub username: String,
    pub game_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub pack: Option<String>,
    pub return_url: String,
}

/// Handles incoming deep link URLs.
/// Parses the URL scheme and dispatches to the appropriate handler.
pub async fn handle_deep_link(app_handle: &AppHandle, urls: Vec<Url>) {
    for url in urls {
        info!("[DeepLink] Received URL: {}", url);

        if url.scheme() != "norisk" {
            warn!("[DeepLink] Ignoring URL with unknown scheme: {}", url.scheme());
            continue;
        }

        match url.host_str() {
            Some("auth") => {
                if url.path() == "/bridge" {
                    handle_auth_bridge(app_handle, &url).await;
                } else {
                    warn!("[DeepLink] Unknown auth path: {}", url.path());
                }
            }
            Some("test") => {
                if url.path() == "/start" {
                    handle_test_start(app_handle, &url).await;
                } else {
                    warn!("[DeepLink] Unknown test path: {}", url.path());
                }
            }
            Some(host) => {
                warn!("[DeepLink] Unknown deep link host: {}", host);
            }
            None => {
                warn!("[DeepLink] Deep link URL has no host: {}", url);
            }
        }
    }
}

async fn handle_test_start(app_handle: &AppHandle, url: &Url) {
    let param = |key: &str| {
        url.query_pairs()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.to_string())
            .filter(|v| !v.is_empty())
    };

    let fail = |message: &str| {
        let _ = app_handle.emit(
            "deep-link-test-result",
            AuthBridgeResult {
                success: false,
                message: message.to_string(),
            },
        );
    };

    let (Some(issue_id), Some(game_version), Some(loader), Some(raw_return)) = (
        param("issue"),
        param("mc"),
        param("loader"),
        param("return"),
    ) else {
        error!("[DeepLink] test/start is missing issue, mc, loader or return");
        fail("invalid_request");
        return;
    };

    let Some(return_url) = testing_session::sanitize_return_url(&raw_return) else {
        error!("[DeepLink] test/start return URL rejected: {}", raw_return);
        fail("invalid_return_url");
        return;
    };

    let state = match State::get().await {
        Ok(s) => s,
        Err(e) => {
            error!("[DeepLink] Failed to get state: {}", e);
            fail("internal_error");
            return;
        }
    };

    let account = match state.minecraft_account_manager_v2.get_active_account().await {
        Ok(Some(acc)) => acc,
        Ok(None) => {
            warn!("[DeepLink] No active account for test launch");
            fail("not_logged_in");
            return;
        }
        Err(e) => {
            error!("[DeepLink] Failed to get active account: {}", e);
            fail("internal_error");
            return;
        }
    };

    let request = TestLaunchRequest {
        issue_id,
        title: param("title").unwrap_or_else(|| "NoRisk Test".to_string()),
        username: account.username.clone(),
        game_version,
        loader,
        loader_version: param("loaderVersion"),
        pack: param("pack"),
        return_url,
    };

    info!(
        "[DeepLink] Emitting test launch request for issue {} ({} {})",
        request.issue_id, request.game_version, request.loader
    );
    let _ = app_handle.emit("deep-link-test-request", request);
}

/// Handles `norisk://auth/bridge?sessionId=xxx` deep links.
/// Emits a confirmation request to the frontend before proceeding.
async fn handle_auth_bridge(app_handle: &AppHandle, url: &Url) {
    let session_id = match url
        .query_pairs()
        .find(|(key, _)| key == "sessionId")
        .map(|(_, value)| value.to_string())
    {
        Some(id) if !id.is_empty() => id,
        _ => {
            error!("[DeepLink] Auth bridge URL missing sessionId parameter");
            let _ = app_handle.emit("deep-link-auth-result", AuthBridgeResult {
                success: false,
                message: "Missing sessionId parameter".to_string(),
            });
            return;
        }
    };

    info!(
        "[DeepLink] Auth bridge request with sessionId: {}",
        crate::utils::security_utils::mask_identifier(&session_id)
    );

    // Check if user is logged in
    let state = match State::get().await {
        Ok(s) => s,
        Err(e) => {
            error!("[DeepLink] Failed to get state: {}", e);
            let _ = app_handle.emit("deep-link-auth-result", AuthBridgeResult {
                success: false,
                message: "Internal error".to_string(),
            });
            return;
        }
    };

    let account = match state
        .minecraft_account_manager_v2
        .get_active_account()
        .await
    {
        Ok(Some(acc)) => acc,
        Ok(None) => {
            warn!("[DeepLink] No active account for auth bridge");
            let _ = app_handle.emit("deep-link-auth-result", AuthBridgeResult {
                success: false,
                message: "not_logged_in".to_string(),
            });
            return;
        }
        Err(e) => {
            error!("[DeepLink] Failed to get active account: {}", e);
            let _ = app_handle.emit("deep-link-auth-result", AuthBridgeResult {
                success: false,
                message: "Failed to get account".to_string(),
            });
            return;
        }
    };

    // Emit confirmation request to the frontend
    info!(
        "[DeepLink] Emitting auth bridge confirmation request for user: {}",
        account.username
    );
    let _ = app_handle.emit(
        "deep-link-auth-request",
        AuthBridgeRequest {
            session_id: session_id.clone(),
            username: account.username.clone(),
        },
    );
}
