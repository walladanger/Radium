//! Shared Radium engine implementation.
pub use atomic_agent_core::resource_class::*;

#[cfg(test)]
mod native_tests {
    use super::*;
    #[test]
    fn computer_diagnosis_reads_and_fixes_require_approval() {
        for tool in crate::core::agent::tools::sys::SYS_DIAGNOSE_TOOLS {
            assert_eq!(resource_class_for(tool), ResourceClass::PureRead, "{tool}");
        }
        for tool in crate::core::agent::tools::sys::SYS_FIX_TOOLS {
            assert_eq!(
                resource_class_for(tool),
                ResourceClass::ApprovalGated,
                "{tool}"
            );
        }
    }
    #[test]
    fn network_diagnosis_reads_and_every_network_fix_asks_first() {
        for tool in crate::core::agent::tools::net::NET_DIAGNOSE_TOOLS {
            assert_eq!(resource_class_for(tool), ResourceClass::PureRead, "{tool}");
        }
        for tool in crate::core::agent::tools::net::NET_FIX_TOOLS {
            assert_eq!(
                resource_class_for(tool),
                ResourceClass::ApprovalGated,
                "{tool}"
            );
        }
    }
}
