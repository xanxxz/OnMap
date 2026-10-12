import Foundation
import React
import UIKit

@objc(OnMapPush)
class OnMapPush: RCTEventEmitter {
  private static weak var current: OnMapPush?
  private static var token: String?
  private static var initialUrl: String?
  private var hasObservers = false

  override init() {
    super.init()
    OnMapPush.current = self
  }

  override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! { ["OnMapPushToken", "OnMapPushOpen"] }
  override func startObserving() { hasObservers = true }
  override func stopObserving() { hasObservers = false }

  @objc func getToken(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      UIApplication.shared.registerForRemoteNotifications()
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
    self.token = token
    if current?.hasObservers == true {
      current?.sendEvent(withName: "OnMapPushToken", body: ["token": token])
    }
  }

  static func didOpen(url: String) {
    initialUrl = url
    if current?.hasObservers == true {
      current?.sendEvent(withName: "OnMapPushOpen", body: ["url": url])
    }
  }
}
