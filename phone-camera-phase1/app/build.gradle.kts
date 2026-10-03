plugins {
    id("com.android.application")
}

android {
    namespace = "com.churchstudio.phonecamera"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.churchstudio.phonecamera"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.1.1-phase1"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.8.0")
    implementation("androidx.core:core:1.19.1")
    implementation("androidx.activity:activity:1.14.0")

    val cameraxVersion = "1.6.2"
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")
}
