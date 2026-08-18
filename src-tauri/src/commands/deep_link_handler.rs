use crate::commands::profile_command::{spawn_temp_profile, TempLaunchArgs};
use crate::error::AppError;
use crate::minecraft::api::norisk_api::NoRiskApi;
use crate::state::state_manager::State;
use crate::utils::deep_link_utils::{AuthBridgeResult, TestLaunchRequest};
use crate::utils::testing_session;
use log::{info, warn};
use tauri::Manager;

/// Tauri command called by the frontend after user confirms the auth bridge request.
#[tauri::command]
pub async fn confirm_auth_bridge(session_id: String) -> Result<AuthBridgeResult, crate::error::CommandError> {
    info!(
        "[DeepLink] User confirmed auth bridge for sessionId: {}",
        crate::utils::security_utils::mask_identifier(&session_id)
    );

    let state = State::get().await?;
    let is_experimental = state.config_manager.is_experimental_mode().await;

    let account = state
        .minecraft_account_manager_v2
        .get_active_account()
        .await?
        .ok_or(AppError::AccountError(
            "No active account found".to_string(),
        ))?;

    let token = account
        .norisk_credentials
        .get_token_for_mode(is_experimental)?;

    NoRiskApi::confirm_auth_bridge(&token, &session_id, is_experimental).await?;

    Ok(AuthBridgeResult {
        success: true,
        message: "success".to_string(),
    })
}

#[tauri::command]
pub async fn confirm_test_launch<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: TestLaunchRequest,
) -> Result<AuthBridgeResult, crate::error::CommandError> {
    let Some(return_url) = testing_session::sanitize_return_url(&request.return_url) else {
        return Err(AppError::Other("Invalid return URL".to_string()).into());
    };

    info!(
        "[DeepLink] Starting test instance for issue {} ({} {} pack={:?})",
        request.issue_id, request.game_version, request.loader, request.pack
    );

    let profile_id = spawn_temp_profile(TempLaunchArgs {
        game_version: request.game_version.clone(),
        loader: request.loader.clone(),
        loader_version: request.loader_version.clone(),
        pack: request.pack.clone(),
        name: Some(format!("Test: {}", request.title)),
        quick_play_singleplayer: None,
        quick_play_multiplayer: None,
        local_mods: Vec::new(),
        account: None,
    })
    .await?;

    testing_session::register(profile_id, return_url);

    let query = format!(
        "?title={}&pack={}&version={}",
        urlencoding::encode(&request.title),
        urlencoding::encode(request.pack.as_deref().unwrap_or("")),
        urlencoding::encode(&request.game_version),
    );

    if let Err(e) = tauri::WebviewWindowBuilder::new(
        &app,
        testing_session::SESSION_WINDOW_LABEL,
        tauri::WebviewUrl::App(format!("test-session.html{}", query).into()),
    )
    .title("NoRisk Test Session")
    .inner_size(460.0, 280.0)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(false)
    .visible(false)
    .build()
    {
        warn!("[DeepLink] Could not open the test session window: {}", e);
    }

    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.hide() {
            warn!("[DeepLink] Could not hide main window for test session: {}", e);
        }
    }

    Ok(AuthBridgeResult {
        success: true,
        message: "success".to_string(),
    })
}
