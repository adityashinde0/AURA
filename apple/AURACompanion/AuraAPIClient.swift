// AURACompanion/AuraAPIClient.swift
// URLSession-based HTTP client for the AURA API Gateway.
//
// Features:
//   • OAuth 2.0 PKCE — builds the authorization URL, exchanges the code for
//     tokens, and stores tokens in the iOS Keychain via KeychainStore.
//   • Attaches Bearer token to every outbound request.
//   • Maps relay_envelope.json payloads for the /relay endpoint.
//   • Registers APNs device tokens with the backend.
//   • Automatic token refresh on 401.
//   • Zero logging of tokens, health data, or meeting content.
//
// Copyright © 2024 Project AURA. All rights reserved.
// Author: Aditya Shinde

import Foundation
import AuthenticationServices
import CryptoKit

// ---------------------------------------------------------------------------
// MARK: - Configuration
// ---------------------------------------------------------------------------

public struct AuraAPIConfig: Sendable {
    /// Base URL of the AURA API Gateway, e.g. "https://api.aura.example.com".
    public let baseURL: URL
    /// OAuth 2.0 Authorization Server endpoint.
    public let authorizationEndpoint: URL
    /// OAuth 2.0 Token endpoint.
    public let tokenEndpoint: URL
    /// OAuth 2.0 client identifier (public, no secret).
    public let clientID: String
    /// Registered redirect URI for PKCE.
    public let redirectURI: URL

    /// Default config loaded from Info.plist keys:
    ///   AURAAPIBaseURL, AURAAuthorizationEndpoint, AURATokenEndpoint,
    ///   AURAClientID, AURARedirectURI.
    public static let `default`: AuraAPIConfig = {
        let info = Bundle.main.infoDictionary ?? [:]
        func require(_ key: String) -> URL {
            guard
                let raw = info[key] as? String,
                let url = URL(string: raw)
            else {
                fatalError("Missing or invalid Info.plist key: \(key)")
            }
            return url
        }
        let clientID = info["AURAClientID"] as? String ?? ""
        return AuraAPIConfig(
            baseURL: require("AURAAPIBaseURL"),
            authorizationEndpoint: require("AURAAuthorizationEndpoint"),
            tokenEndpoint: require("AURATokenEndpoint"),
            clientID: clientID,
            redirectURI: require("AURARedirectURI")
        )
    }()
}

// ---------------------------------------------------------------------------
// MARK: - Errors
// ---------------------------------------------------------------------------

public enum AuraAPIError: LocalizedError {
    case notAuthenticated
    case httpError(statusCode: Int, body: Data?)
    case decodingError(underlying: Error)
    case tokenRefreshFailed

    public var errorDescription: String? {
        switch self {
        case .notAuthenticated:         return "Not authenticated. Please sign in."
        case .httpError(let code, _):   return "HTTP \(code)"
        case .decodingError(let e):     return "Decoding failed: \(e.localizedDescription)"
        case .tokenRefreshFailed:       return "Token refresh failed."
        }
    }
}

// ---------------------------------------------------------------------------
// MARK: - Keychain store (token persistence)
// ---------------------------------------------------------------------------

private struct KeychainStore {

    private static let accessTokenKey  = "com.aura.oauth.access_token"
    private static let refreshTokenKey = "com.aura.oauth.refresh_token"
    private static let userIDKey       = "com.aura.oauth.user_id"

    static func save(accessToken: String, refreshToken: String, userID: String) {
        set(value: accessToken,  forKey: accessTokenKey)
        set(value: refreshToken, forKey: refreshTokenKey)
        set(value: userID,       forKey: userIDKey)
    }

    static func accessToken()  -> String? { get(forKey: accessTokenKey) }
    static func refreshToken() -> String? { get(forKey: refreshTokenKey) }
    static func userID()       -> String? { get(forKey: userIDKey) }

    static func clear() {
        delete(forKey: accessTokenKey)
        delete(forKey: refreshTokenKey)
        delete(forKey: userIDKey)
    }

    // MARK: Low-level Keychain helpers

    private static func set(value: String, forKey key: String) {
        guard let data = value.data(using: .utf8) else { return }
        // kSecAttrSynchronizable: kCFBooleanFalse — tokens must NEVER sync to
        // iCloud Keychain. Without this explicit attribute the system default
        // allows syncing, which would propagate OAuth tokens to other devices
        // that share the same Apple ID — a token exfiltration path.
        //
        // kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly —
        // storage is device-bound (Secure Enclave-backed on supported hardware)
        // and survives the first unlock after reboot, enabling background tasks.
        let query: [CFString: Any] = [
            kSecClass:               kSecClassGenericPassword,
            kSecAttrAccount:         key,
            kSecAttrAccessible:      kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecAttrSynchronizable:  kCFBooleanFalse as CFBoolean
        ]
        // Try update first, then add.
        let attributes: [CFString: Any] = [kSecValueData: data]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insertQuery = query
            insertQuery[kSecValueData] = data
            SecItemAdd(insertQuery as CFDictionary, nil)
        }
    }

    private static func get(forKey key: String) -> String? {
        // kSecAttrSynchronizable: kCFBooleanFalse scopes the lookup to
        // device-local items only, preventing accidental reads from a
        // cloud-synced item that should not exist but could if a prior
        // build omitted the flag.
        let query: [CFString: Any] = [
            kSecClass:              kSecClassGenericPassword,
            kSecAttrAccount:        key,
            kSecAttrSynchronizable: kCFBooleanFalse as CFBoolean,
            kSecReturnData:         true,
            kSecMatchLimit:         kSecMatchLimitOne
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func delete(forKey key: String) {
        // Scope deletion to device-local items only (matches the write query).
        let query: [CFString: Any] = [
            kSecClass:              kSecClassGenericPassword,
            kSecAttrAccount:        key,
            kSecAttrSynchronizable: kCFBooleanFalse as CFBoolean
        ]
        SecItemDelete(query as CFDictionary)
    }
}

// ---------------------------------------------------------------------------
// MARK: - PKCE helpers
// ---------------------------------------------------------------------------

private enum PKCE {
    /// Generates a cryptographically random code verifier (43–128 characters).
    static func codeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 64)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded()
    }

    /// SHA-256 challenge derived from the verifier.
    static func codeChallenge(from verifier: String) -> String {
        let data   = Data(verifier.utf8)
        let digest = SHA256.hash(data: data)
        return Data(digest).base64URLEncoded()
    }
}

private extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

// ---------------------------------------------------------------------------
// MARK: - Token response
// ---------------------------------------------------------------------------

private struct OAuthTokenResponse: Decodable {
    let accessToken:  String
    let refreshToken: String
    let userID:       String

    private enum CodingKeys: String, CodingKey {
        case accessToken  = "access_token"
        case refreshToken = "refresh_token"
        case userID       = "user_id"
    }
}

// ---------------------------------------------------------------------------
// MARK: - AuraAPIClient
// ---------------------------------------------------------------------------

@MainActor
public final class AuraAPIClient: NSObject, ObservableObject {

    // MARK: Singleton
    public static let shared = AuraAPIClient()

    // MARK: Config
    private let config: AuraAPIConfig

    // MARK: State
    @Published public private(set) var isSignedIn: Bool = false
    @Published public private(set) var userID: String? = nil

    // MARK: Private
    private let urlSession: URLSession
    private let jsonEncoder: JSONEncoder
    private let jsonDecoder: JSONDecoder
    /// Stored in-memory during active session; persisted in Keychain.
    private var accessToken: String? = nil
    /// In-flight code verifier for the current OAuth exchange.
    private var pendingCodeVerifier: String? = nil

    private override init() {
        self.config      = .default
        self.urlSession  = URLSession(configuration: .default)
        self.jsonEncoder = JSONEncoder()
        self.jsonDecoder = JSONDecoder()
        super.init()
        // Restore token from Keychain (e.g. app relaunch).
        accessToken = KeychainStore.accessToken()
        userID      = KeychainStore.userID()
        isSignedIn  = accessToken != nil
    }

    // MARK: - OAuth 2.0 PKCE sign-in

    /// Builds the authorization URL and starts the ASWebAuthenticationSession flow.
    ///
    /// Call from the sign-in button action. Completion updates `isSignedIn`.
    public func signIn(presentationAnchor: ASPresentationAnchor) async throws {
        let verifier   = PKCE.codeVerifier()
        let challenge  = PKCE.codeChallenge(from: verifier)
        let state      = UUID().uuidString

        pendingCodeVerifier = verifier

        // Replaced force-unwrap with a guarded construction. A malformed
        // authorizationEndpoint URL (e.g. misconfigured Info.plist) must not
        // crash the app at runtime; instead we fail with a typed error.
        guard var components = URLComponents(url: config.authorizationEndpoint, resolvingAgainstBaseURL: false) else {
            throw AuraAPIError.notAuthenticated
        }
        components.queryItems = [
            .init(name: "response_type",          value: "code"),
            .init(name: "client_id",              value: config.clientID),
            .init(name: "redirect_uri",           value: config.redirectURI.absoluteString),
            .init(name: "code_challenge",         value: challenge),
            .init(name: "code_challenge_method",  value: "S256"),
            .init(name: "state",                  value: state),
            .init(name: "scope",                  value: "openid profile calendar:read focus:write safety:write")
        ]

        guard let authURL = components.url else {
            throw AuraAPIError.notAuthenticated
        }

        let callbackURL = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
            let authSession = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: config.redirectURI.scheme
            ) { url, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let url {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(throwing: AuraAPIError.notAuthenticated)
                }
            }
            authSession.presentationContextProvider = self
            authSession.prefersEphemeralWebBrowserSession = true
            authSession.start()
        }

        // Exchange code for tokens.
        guard
            let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
            let code = components.queryItems?.first(where: { $0.name == "code" })?.value
        else {
            throw AuraAPIError.notAuthenticated
        }

        try await exchangeCode(code, verifier: verifier)
    }

    private func exchangeCode(_ code: String, verifier: String) async throws {
        var request = URLRequest(url: config.tokenEndpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = [
            "grant_type":     "authorization_code",
            "code":           code,
            "redirect_uri":   config.redirectURI.absoluteString,
            "client_id":      config.clientID,
            "code_verifier":  verifier
        ]
        .map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")" }
        .joined(separator: "&")

        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await urlSession.data(for: request)
        try validate(response: response, data: data)

        let tokenResponse = try jsonDecoder.decode(OAuthTokenResponse.self, from: data)
        storeTokens(access: tokenResponse.accessToken, refresh: tokenResponse.refreshToken, uid: tokenResponse.userID)
    }

    private func refreshAccessToken() async throws {
        guard let refresh = KeychainStore.refreshToken() else {
            throw AuraAPIError.tokenRefreshFailed
        }

        var request = URLRequest(url: config.tokenEndpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = "grant_type=refresh_token&refresh_token=\(refresh)&client_id=\(config.clientID)"
        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            signOut()
            throw AuraAPIError.tokenRefreshFailed
        }

        let tokenResponse = try jsonDecoder.decode(OAuthTokenResponse.self, from: data)
        storeTokens(access: tokenResponse.accessToken, refresh: tokenResponse.refreshToken, uid: tokenResponse.userID)
    }

    public func signOut() {
        KeychainStore.clear()
        accessToken = nil
        userID      = nil
        isSignedIn  = false
    }

    private func storeTokens(access: String, refresh: String, uid: String) {
        accessToken = access
        userID      = uid
        isSignedIn  = true
        KeychainStore.save(accessToken: access, refreshToken: refresh, userID: uid)
    }

    // MARK: - API requests

    /// POST /relay — forwards a RelayEnvelope to the AURA API Gateway.
    func postRelay(envelope: RelayEnvelope) async throws -> BackendRelayResponse {
        let url  = config.baseURL.appendingPathComponent("relay")
        let data = try jsonEncoder.encode(envelope)
        return try await authorizedRequest(url: url, method: "POST", body: data)
    }

    /// POST /apns/register — registers an APNs device token with the backend.
    func registerAPNsToken(token: String, userID: String, sessionID: String) async {
        struct APNsRegistration: Encodable {
            let deviceToken: String
            let userID: String
            let sessionID: String
            private enum CodingKeys: String, CodingKey {
                case deviceToken = "device_token"
                case userID      = "user_id"
                case sessionID   = "session_id"
            }
        }

        let url = config.baseURL.appendingPathComponent("apns/register")
        let body = APNsRegistration(deviceToken: token, userID: userID, sessionID: sessionID)
        guard let data = try? jsonEncoder.encode(body) else { return }

        _ = try? await authorizedRequest(url: url, method: "POST", body: data) as BackendRelayResponse
    }

    // MARK: - Authorized request helper

    private func authorizedRequest<T: Decodable>(
        url: URL,
        method: String,
        body: Data? = nil,
        retryOnUnauthorized: Bool = true
    ) async throws -> T {
        guard let token = accessToken else {
            throw AuraAPIError.notAuthenticated
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = body

        let (data, response) = try await urlSession.data(for: request)

        if let http = response as? HTTPURLResponse, http.statusCode == 401, retryOnUnauthorized {
            try await refreshAccessToken()
            return try await authorizedRequest(url: url, method: method, body: body, retryOnUnauthorized: false)
        }

        try validate(response: response, data: data)

        do {
            return try jsonDecoder.decode(T.self, from: data)
        } catch {
            throw AuraAPIError.decodingError(underlying: error)
        }
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            throw AuraAPIError.httpError(statusCode: http.statusCode, body: data)
        }
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension AuraAPIClient: ASWebAuthenticationPresentationContextProviding {
    public nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Returns the key window for the presentation anchor.
        DispatchQueue.main.sync {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}
