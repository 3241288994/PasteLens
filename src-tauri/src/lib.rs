mod image_upload;
mod history_store;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Position, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn show_viewer(app: &AppHandle) -> Result<(), String> {
    let viewer = app
        .get_webview_window("viewer")
        .ok_or_else(|| "viewer window is unavailable".to_string())?;

    position_viewer(app)?;
    viewer.show().map_err(|error| error.to_string())?;
    viewer.set_focus().map_err(|error| error.to_string())?;
    viewer
        .emit("viewer-opened", ())
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn position_ball_for_windows(app: &AppHandle) -> Result<(), String> {
    let ball = app
        .get_webview_window("ball")
        .ok_or_else(|| "floating ball window is unavailable".to_string())?;
    let monitor = ball
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(app.primary_monitor().map_err(|error| error.to_string())?);

    let Some(monitor) = monitor else {
        return Ok(());
    };

    let work_area = monitor.work_area();
    let ball_size = ball.outer_size().map_err(|error| error.to_string())?;
    let margin = 16;
    let x = work_area.position.x + work_area.size.width as i32 - ball_size.width as i32 - margin;
    let y = work_area.position.y
        + ((work_area.size.height as i32 - ball_size.height as i32) / 2).max(0);

    ball.set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|error| error.to_string())
}

fn position_viewer(app: &AppHandle) -> Result<(), String> {
    let ball = app
        .get_webview_window("ball")
        .ok_or_else(|| "floating ball window is unavailable".to_string())?;
    let viewer = app
        .get_webview_window("viewer")
        .ok_or_else(|| "viewer window is unavailable".to_string())?;

    let ball_position = ball.outer_position().map_err(|error| error.to_string())?;
    let ball_size = ball.outer_size().map_err(|error| error.to_string())?;
    let viewer_size = viewer.outer_size().map_err(|error| error.to_string())?;
    let monitor = ball.current_monitor().map_err(|error| error.to_string())?;

    let Some(monitor) = monitor else {
        return Ok(());
    };
    let work_area = monitor.work_area();
    let work_left = work_area.position.x;
    let work_top = work_area.position.y;
    let work_right = work_left + work_area.size.width as i32;
    let work_bottom = work_top + work_area.size.height as i32;
    let viewer_width = viewer_size.width as i32;
    let viewer_height = viewer_size.height as i32;
    let margin = 12;

    let right_candidate = ball_position.x + ball_size.width as i32 + margin;
    let left_candidate = ball_position.x - viewer_width - margin;
    let x = if right_candidate + viewer_width <= work_right {
        right_candidate
    } else {
        left_candidate.max(work_left)
    };
    let max_y = (work_bottom - viewer_height).max(work_top);
    let y = (ball_position.y - 28).clamp(work_top, max_y);

    viewer
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn toggle_viewer(app: AppHandle) -> Result<(), String> {
    let viewer = app
        .get_webview_window("viewer")
        .ok_or_else(|| "viewer window is unavailable".to_string())?;

    // The floating ball can briefly alter macOS focus before this command runs,
    // so focus is not a stable signal for deciding whether to hide. Treat the
    // ball as a strict visibility toggle: one click shows, the next hides.
    if viewer.is_visible().map_err(|error| error.to_string())? {
        viewer.hide().map_err(|error| error.to_string())?;
        return Ok(());
    }

    show_viewer(&app)
}

#[tauri::command]
fn hide_viewer(app: AppHandle) -> Result<(), String> {
    let viewer = app
        .get_webview_window("viewer")
        .ok_or_else(|| "viewer window is unavailable".to_string())?;
    viewer.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_viewer_pinned(app: AppHandle, pinned: bool) -> Result<(), String> {
    let viewer = app
        .get_webview_window("viewer")
        .ok_or_else(|| "viewer window is unavailable".to_string())?;
    viewer
        .set_always_on_top(pinned)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn print_viewer(app: AppHandle) -> Result<(), String> {
    let viewer = app
        .get_webview_window("viewer")
        .ok_or_else(|| "viewer window is unavailable".to_string())?;
    viewer.print().map_err(|error| error.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = show_viewer(app);
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let reader = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::Space);
                    if shortcut.id() == reader.id() && event.state() == ShortcutState::Pressed {
                        let _ = toggle_viewer(app.clone());
                    }
                })
                .build(),
        )
        .setup(|app| {
            app.global_shortcut().register("Alt+Shift+Space")?;
            image_upload::initialize(app.handle()).map_err(std::io::Error::other)?;

            if let Some(viewer) = app.get_webview_window("viewer") {
                let window = viewer.clone();
                viewer.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                });
            }

            #[cfg(target_os = "windows")]
            let _ = position_ball_for_windows(app.handle());

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_viewer,
            hide_viewer,
            set_viewer_pinned,
            print_viewer,
            quit_app,
            history_store::load_history_workspace,
            history_store::save_history_workspace,
            history_store::update_history_scroll,
            history_store::load_drafts,
            history_store::save_drafts,
            image_upload::get_image_upload_snapshot,
            image_upload::set_image_upload_recording,
            image_upload::configure_image_upload,
            image_upload::check_image_upload_target,
            image_upload::start_image_upload,
            image_upload::cancel_image_upload,
            image_upload::dismiss_image_upload,
            image_upload::copy_image_upload_path,
            image_upload::open_image_upload_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running PasteLens");
}
