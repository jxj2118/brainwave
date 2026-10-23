import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// Keep signing credentials outside source control. CI can supply the same
// values through environment variables instead of a local properties file.
val keystoreProperties = Properties().apply {
    val path = System.getenv("BRAINWAVE_ANDROID_KEYSTORE_PROPERTIES")
        ?: "${System.getProperty("user.home")}/.config/brainwave-build/android/keystore.properties"
    // Match the repository-root working directory used by the build scripts.
    val propFile = rootProject.projectDir.resolve("../../..").resolve(path)
    if (propFile.exists()) {
        propFile.reader(Charsets.UTF_8).use { load(it) }
    }
}
fun signingValue(name: String, environment: String): String? =
    System.getenv(environment)?.takeIf { it.isNotBlank() }
        ?: keystoreProperties.getProperty(name)?.takeIf { it.isNotBlank() }
val releaseStore = signingValue("storeFile", "ANDROID_KEYSTORE_PATH")
val releasePassword = signingValue("storePassword", "ANDROID_KEYSTORE_PASSWORD")
val releaseAlias = signingValue("keyAlias", "ANDROID_KEY_ALIAS")
val releaseKeyPassword = signingValue("keyPassword", "ANDROID_KEY_PASSWORD") ?: releasePassword
val hasReleaseSigning = listOf(releaseStore, releasePassword, releaseAlias, releaseKeyPassword).all { it != null }
if (gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) }) {
    require(hasReleaseSigning) { "Release signing is missing. Run bun run android:keystore or configure ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD and ANDROID_KEY_ALIAS." }
    require(file(releaseStore!!).isFile) { "Android release keystore file does not exist." }
}

android {
    compileSdk = 37
    namespace = "com.lor4ai.brainwave"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.lor4ai.brainwave"
        minSdk = 24
        targetSdk = 37
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseStore!!)
                storePassword = releasePassword
                keyAlias = releaseAlias
                keyPassword = releaseKeyPassword
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
