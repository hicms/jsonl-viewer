mod atomic_save;
#[cfg(feature = "desktop")]
mod desktop;
pub mod discovery;
pub mod documents;
pub mod error;
mod json_document;
#[cfg(feature = "desktop")]
mod menus;
pub mod open_requests;
pub mod reader;
pub mod traces;
#[cfg(feature = "desktop")]
pub use desktop::run;
