use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Use the OS app config dir as PatrickOS config directory.
            // On macOS: ~/Library/Application Support/com.patrickos.desktop
            // On Linux: ~/.config/com.patrickos.desktop
            let config_dir = app
                .path()
                .app_config_dir()
                .expect("failed to resolve app config dir");
            std::fs::create_dir_all(&config_dir)?;

            // Start the API sidecar, passing config dir so it knows where
            // to read/write settings.yaml and projects.yaml
            app.shell()
                .sidecar("api")
                .expect("api sidecar not found")
                .env("CONFIG_DIR", config_dir.to_string_lossy().as_ref())
                .env("PORT", "3000")
                .spawn()
                .expect("failed to spawn api sidecar");

            // WSLg/X11 reports 96 DPI regardless of actual display scale,
            // so WebKitGTK renders tiny on high-DPI displays. Apply a zoom factor.
            let window = app.get_webview_window("main").expect("main window not found");
            window.set_zoom(1.5).expect("failed to set zoom");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
