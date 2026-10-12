package com.roadradar.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    preparePushIntent(intent)
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    preparePushIntent(intent)
    super.onNewIntent(intent)
    setIntent(intent)
  }

  private fun preparePushIntent(intent: Intent?) {
    if (intent == null || intent.data != null) return
    val kind = intent.getStringExtra("kind") ?: return
    val targetId = intent.getStringExtra("targetId") ?: return
    val cityId = intent.getStringExtra("cityId") ?: return
    if (kind != "ROAD_EVENT" && kind != "PARTNER_POINT") return
    if (!Regex("^[0-9a-fA-F-]{36}$").matches(targetId)) return
    if (!Regex("^[a-zA-Z0-9_-]{1,64}$").matches(cityId)) return
    intent.data = Uri.Builder().scheme("onmap").authority("open")
      .appendPath(kind.lowercase()).appendPath(targetId)
      .appendQueryParameter("cityId", cityId).build()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "RoadRadar"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
