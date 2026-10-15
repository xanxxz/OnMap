import Foundation
import os
import React
import UIKit

@objc(OnMapPush)
class OnMapPush: RCTEventEmitter {
  private static let logger = Logger(subsystem: "com.onmap.app", category: "push-registration")
  private static weak var current: OnMapPush?
  private static var token: String?
  private static var initialUrl: String?
  private static var registrationErrorCode: Int?
  private var hasObservers = false

  override init() {
    super.init()
    OnMapPush.current = self
  }

  override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! { ["OnMapPushToken", "OnMapPushOpen", "OnMapPushRegistrationError"] }
  override func startObserving() {
    hasObservers = true
    OnMapPush.logger.info("JS native push event subscriber attached")
    OnMapPush.logger.info("APNs cached token present at subscriber attach: \(OnMapPush.token != nil, privacy: .public)")
    if let code = OnMapPush.registrationErrorCode {
      OnMapPush.logger.info("Forwarding cached APNs registration error to JS subscriber")
      sendEvent(withName: "OnMapPushRegistrationError", body: ["code": code])
      OnMapPush.registrationErrorCode = nil
    }
  }
  override func stopObserving() { hasObservers = false }

  @objc func getToken(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      OnMapPush.logger.info("APNs registration requested")
      UIApplication.shared.registerForRemoteNotifications()
      OnMapPush.logger.info("APNs cached token available: \(OnMapPush.token != nil, privacy: .public)")
      resolve(OnMapPush.token)
    }
  }

  @objc func consumeInitialUrl(_ resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(OnMapPush.initialUrl)
    OnMapPush.initialUrl = nil
  }

  @objc func disable(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      UIApplication.shared.unregisterForRemoteNotifications()
      resolve(nil)
    }
  }

  static func didRegister(token: String) {
    logger.info("APNs registration callback succeeded")
    self.token = token
    registrationErrorCode = nil
    if current?.hasObservers == true {
      current?.sendEvent(withName: "OnMapPushToken", body: ["token": token])
    }
  }

  static func didFailToRegister(errorCode: Int) {
    logger.error("APNs registration callback failed, error code: \(errorCode, privacy: .public)")
    registrationErrorCode = errorCode
    if current?.hasObservers == true {
      current?.sendEvent(withName: "OnMapPushRegistrationError", body: ["code": errorCode])
      registrationErrorCode = nil
    }
  }

  static func didOpen(url: String) {
    initialUrl = url
    if current?.hasObservers == true {
      current?.sendEvent(withName: "OnMapPushOpen", body: ["url": url])
    }
  }
}
