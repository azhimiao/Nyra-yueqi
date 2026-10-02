# Yueqi L1 release shrinking. Keep Capacitor bridges and manifest components;
# do not ship a second copy of the default Android keep file here.

-keepattributes *Annotation*
-keepattributes InnerClasses
-keepattributes Signature
-keepattributes Exceptions
-keepattributes EnclosingMethod

# Capacitor runtime + plugin reflection.
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-dontwarn com.getcapacitor.**
-dontwarn org.apache.cordova.**

-keep @com.getcapacitor.annotation.CapacitorPlugin class * {
    <init>(...);
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
}

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keepclasseswithmembernames class * {
    native <methods>;
}

# Community SQLite / optional SQLCipher bits pulled by the plugin.
-keep class com.getcapacitor.community.database.sqlite.** { *; }
-dontwarn com.getcapacitor.community.database.sqlite.**
-keep class net.sqlcipher.** { *; }
-dontwarn net.sqlcipher.**

# App plugins and overlay/capability services referenced from the manifest.
-keep class app.yueqi.open.MainActivity { *; }
-keep class app.yueqi.open.overlay.** { *; }
-keep class app.yueqi.open.capability.** { *; }
-keep class app.yueqi.open.secure.** { *; }

# EncryptedSharedPreferences / Tink used by NativeSecureStore.
-keep class androidx.security.crypto.** { *; }
-keep class com.google.crypto.tink.** { *; }

# FileProvider paths stay reachable after resource shrinking.
-keep class androidx.core.content.FileProvider { *; }

# Optional annotation / HTTP / Joda classes referenced by Tink, not shipped.
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-dontwarn javax.annotation.concurrent.**
-dontwarn com.google.api.client.**
-dontwarn org.joda.time.**
