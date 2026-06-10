use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// The running API sidecar, kept so it can be killed when the app exits.
struct SidecarChild(Mutex<Option<CommandChild>>);

/// Ask the OS for an unused localhost port (bind to :0, read what we got, drop).
fn free_port() -> u16 {
  TcpListener::bind("127.0.0.1:0")
    .and_then(|l| l.local_addr())
    .map(|a| a.port())
    .expect("no free port available for the API sidecar")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Spawn the bundled API as a sidecar on a private free port, then hand that
      // port to the webview before it loads so the frontend talks to this process
      // (and only this one) — no fixed port to collide with another app.
      let port = free_port();
      let (mut rx, child) = app
        .shell()
        .sidecar("api")?
        .env("PORT", port.to_string())
        .spawn()?;
      app.manage(SidecarChild(Mutex::new(Some(child))));

      // Drain the sidecar's output so its pipe never fills and stalls it.
      tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
          if let CommandEvent::Stdout(line) | CommandEvent::Stderr(line) = event {
            log::info!("[api] {}", String::from_utf8_lossy(&line));
          }
        }
      });

      // Wait until the sidecar is actually accepting connections before opening
      // the window, so the frontend's first requests (incl. non-retried mutations
      // and the chat stream) don't race the API's cold start. Cap the wait so a
      // sidecar that never comes up doesn't hang launch — open anyway and let the
      // UI surface the failure.
      let addr = format!("127.0.0.1:{port}");
      let deadline = Instant::now() + Duration::from_secs(10);
      while TcpStream::connect(&addr).is_err() {
        if Instant::now() >= deadline {
          log::warn!("API sidecar not reachable on {addr} after 10s; opening window anyway");
          break;
        }
        std::thread::sleep(Duration::from_millis(50));
      }

      WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("Patrick")
        .inner_size(1200.0, 800.0)
        .resizable(true)
        .initialization_script(format!("window.__API_URL__ = 'http://127.0.0.1:{port}';"))
        .build()?;

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|handle, event| {
    if let RunEvent::ExitRequested { .. } = event {
      if let Some(state) = handle.try_state::<SidecarChild>() {
        if let Some(child) = state.0.lock().unwrap().take() {
          let _ = child.kill();
        }
      }
    }
  });
}
