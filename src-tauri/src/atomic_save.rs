use crate::error::{Error, Result};
use std::path::Path;

pub fn persist(output: tempfile::NamedTempFile, target: &Path) -> Result<()> {
    #[cfg(windows)]
    if target.exists() {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;
        // ReplaceFile opens the old file without write access, respecting the held save lock.
        // Close the temporary handle because ReplaceFile requires exclusive access to it.
        let temporary = output.into_temp_path();
        let old: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
        let new: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
        let replaced = unsafe {
            ReplaceFileW(
                old.as_ptr(),
                new.as_ptr(),
                std::ptr::null(),
                0,
                std::ptr::null(),
                std::ptr::null(),
            )
        };
        if replaced == 0 {
            return Err(Error::Io(std::io::Error::last_os_error()));
        }
        return Ok(());
    }
    output
        .persist(target)
        .map_err(|error| Error::Io(error.error))?;
    Ok(())
}
