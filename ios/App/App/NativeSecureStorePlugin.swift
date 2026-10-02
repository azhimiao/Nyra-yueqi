import Foundation
import Capacitor
import Security

@objc(NativeSecureStorePlugin)
public class NativeSecureStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeSecureStorePlugin"
    public let jsName = "NativeSecureStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let service = "app.yueqi.open.secure"

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve([
            "available": true,
            "backend": "keychain"
        ])
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("KEY_REQUIRED")
            return
        }
        var query: [String: Any] = baseQuery(key)
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecReturnData as String] = true
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
            return
        }
        guard status == errSecSuccess, let data = item as? Data else {
            call.reject("SECURE_STORE_UNAVAILABLE", "keychain status \(status)")
            return
        }
        call.resolve(["value": String(data: data, encoding: .utf8) ?? ""])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("KEY_REQUIRED")
            return
        }
        let value = call.getString("value") ?? ""
        if value.isEmpty {
            removeKey(key)
            call.resolve()
            return
        }
        guard let data = value.data(using: .utf8) else {
            call.reject("SECURE_STORE_WRITE_FAILED")
            return
        }
        removeKey(key)
        var query = baseQuery(key)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            call.reject("SECURE_STORE_WRITE_FAILED", "keychain status \(status)")
            return
        }
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("KEY_REQUIRED")
            return
        }
        removeKey(key)
        call.resolve()
    }

    private func baseQuery(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
    }

    private func removeKey(_ key: String) {
        SecItemDelete(baseQuery(key) as CFDictionary)
    }
}
