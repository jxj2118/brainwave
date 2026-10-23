fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        cc::Build::new()
            .cpp(true)
            .file("mobile/ios/Attachments.mm")
            .flag("-fobjc-arc")
            .compile("brainwave_attachments");
        println!("cargo:rustc-link-lib=framework=QuickLook");
        println!("cargo:rerun-if-changed=mobile/ios/Attachments.mm");
    }
    tauri_build::build()
}
