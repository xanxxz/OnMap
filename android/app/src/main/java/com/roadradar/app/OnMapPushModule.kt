package com.roadradar.app

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

class OnMapPushModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  init { activeContext = context }

  override fun getName(): String = "OnMapPush"

  @ReactMethod
  fun getToken(promise: Promise) {
    if (FirebaseApp.getApps(context).isEmpty()) {
      promise.resolve(null)
      return
    }
    try {
      val messaging = FirebaseMessaging.getInstance()
      messaging.isAutoInitEnabled = true
      messaging.token.addOnCompleteListener { task ->
        promise.resolve(if (task.isSuccessful) task.result else null)
      }
    } catch (_: Exception) {
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun disable(promise: Promise) {
    if (FirebaseApp.getApps(context).isEmpty()) {
      promise.resolve(null)
      return
    }
    try {
      val messaging = FirebaseMessaging.getInstance()
      messaging.isAutoInitEnabled = false
      messaging.deleteToken().addOnCompleteListener { promise.resolve(null) }
    } catch (_: Exception) {
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun consumeInitialUrl(promise: Promise) { promise.resolve(null) }

  @ReactMethod
  fun addListener(eventName: String) { /* Required by NativeEventEmitter. */ }

  @ReactMethod
  fun removeListeners(count: Int) { /* Required by NativeEventEmitter. */ }

  companion object {
    private var activeContext: ReactApplicationContext? = null

    fun notifyNewToken(token: String) {
      val context = activeContext ?: return
      if (!context.hasActiveReactInstance()) return
      val payload = Arguments.createMap().apply { putString("token", token) }
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("OnMapPushToken", payload)
    }
  }
}
