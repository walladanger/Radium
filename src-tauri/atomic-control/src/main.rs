use atomic_control::{dispatch, http::router_with_origins, Store};
use tokio_util::sync::CancellationToken;
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let token = std::env::var("ATOMIC_CONTROL_TOKEN")?;
    if token.len() < 32 {
        return Err("ATOMIC_CONTROL_TOKEN must contain at least 32 bytes".into());
    }
    let path = std::env::var("ATOMIC_CONTROL_DATABASE")?;
    // Acquire the single-authority endpoint before startup recovery can fence work.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:17432").await?;
    let store = Store::open(path)?;
    store.recover_tools()?;
    store.recover_expired()?;
    let dispatch = match std::env::var_os("ATOMIC_CONTROL_DISPATCH_CONFIG") {
        Some(path) => Some(
            dispatch::config::DispatchConfig::load(std::path::Path::new(&path))?
                .provision(store.clone())
                .await?,
        ),
        None => {
            eprintln!("[atomic-dispatch] no trusted configuration; task execution disabled");
            None
        }
    };
    let origins = std::env::var("ATOMIC_CONTROL_ALLOWED_ORIGINS")
        .ok()
        .map(|v| v.split(',').map(|v| v.trim().to_owned()).collect())
        .unwrap_or_default();
    let maintenance_store = store.clone();
    let router = router_with_origins(store.clone(), token, origins)?;
    let stop = CancellationToken::new();
    let signal_stop = stop.clone();
    let signal = tokio::spawn(async move {
        shutdown_signal().await;
        signal_stop.cancel();
    });
    let dispatch_stop = stop.clone();
    let dispatch_store = store.clone();
    let mut dispatcher = tokio::spawn(async move {
        match dispatch {
            Some(executor) => dispatch::run(dispatch_store, executor, dispatch_stop).await,
            None => {
                dispatch_stop.cancelled().await;
                Ok(())
            }
        }
    });
    let service =
        axum::serve(listener, router).with_graceful_shutdown(stop.clone().cancelled_owned());
    let mut dispatcher_finished = false;
    let result: Result<(), Box<dyn std::error::Error>> = tokio::select! {
        result = service => result.map_err(Into::into),
        result = maintain_leases(maintenance_store) => result.map_err(Into::into),
        result = &mut dispatcher => {
            dispatcher_finished = true;
            match result { Ok(result) => result.map_err(Into::into), Err(error) => Err(error.into()) }
        },
    };
    stop.cancel();
    signal.abort();
    if !dispatcher_finished {
        dispatcher.await??;
    }
    result?;
    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut terminate) => {
                tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
            }
            Err(_) => {
                let _ = tokio::signal::ctrl_c().await;
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
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
