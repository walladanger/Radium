//! Shared Radium engine implementation.
pub use atomic_agent_core::resource_class::*;

#[cfg(test)]
mod tests {
    use super::*;

    /// The `net.*` and `sys.*` tools live in the desktop, so their resource
    /// classes are checked here rather than in the shared crate.
    #[test]
    fn diagnosis_reads_and_every_network_or_computer_fix_asks_first() {
        use crate::core::agent::tools::{net, sys};
        for tool in net::NET_DIAGNOSE_TOOLS
            .iter()
            .chain(sys::SYS_DIAGNOSE_TOOLS.iter())
        {
            assert_eq!(resource_class_for(tool), ResourceClass::PureRead, "{tool}");
        }
        for tool in net::NET_FIX_TOOLS.iter().chain(sys::SYS_FIX_TOOLS.iter()) {
            assert_eq!(
                resource_class_for(tool),
                ResourceClass::ApprovalGated,
                "{tool}"
            );
        }
    }
}
