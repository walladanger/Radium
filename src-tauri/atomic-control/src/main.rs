use atomic_control::{http::router_with_origins, Store};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let token = std::env::var("ATOMIC_CONTROL_TOKEN")?;
    if token.len() < 32 {
        return Err("ATOMIC_CONTROL_TOKEN must contain at least 32 bytes".into());
    }
    let path = std::env::var("ATOMIC_CONTROL_DATABASE")?;
    let store = Store::open(path)?;
    store.recover_tools()?;
    store.recover_expired()?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:17432").await?;
    let origins = std::env::var("ATOMIC_CONTROL_ALLOWED_ORIGINS")
        .ok()
        .map(|v| v.split(',').map(|v| v.trim().to_owned()).collect())
        .unwrap_or_default();
    let maintenance_store = store.clone();
    let service = axum::serve(listener, router_with_origins(store, token, origins)?)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        });
    tokio::select! {
        result = service => result?,
        result = maintain_leases(maintenance_store) => result?,
    }
    Ok(())
}

async fn maintain_leases(store: Store) -> Result<(), atomic_control::Error> {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        // Recovery fences unknown outcomes; it never assumes a process stopped.
        // A database failure stops serving rather than silently losing recovery.
        store.recover_expired()?;
    }
}
