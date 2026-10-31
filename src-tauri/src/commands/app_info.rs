use serde::Serialize;

pub const PRODUCT_NAME: &str = "Flutter UI Studio";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub tauri_version: String,
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: PRODUCT_NAME.to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
        tauri_version: tauri::VERSION.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_product_metadata() {
        let info = app_info();

        assert_eq!(info.name, PRODUCT_NAME);
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert!(!info.tauri_version.is_empty());
    }
}
