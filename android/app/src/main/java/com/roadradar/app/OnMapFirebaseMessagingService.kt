package com.roadradar.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class OnMapFirebaseMessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) { OnMapPushModule.notifyNewToken(token) }

  override fun onMessageReceived(message: RemoteMessage) {
    val kind = message.data["kind"] ?: return
    val targetId = message.data["targetId"] ?: return
    val cityId = message.data["cityId"] ?: return
    if (kind != "ROAD_EVENT" && kind != "PARTNER_POINT") return
    if (!Regex("^[0-9a-fA-F-]{36}$").matches(targetId)) return
    if (!Regex("^[a-zA-Z0-9_-]{1,64}$").matches(cityId)) return
    if (Build.VERSION.SDK_INT >= 33 &&
      checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return

    val manager = getSystemService(NotificationManager::class.java)
    val channelId = "onmap_updates"
    if (Build.VERSION.SDK_INT >= 26)
      manager.createNotificationChannel(NotificationChannel(channelId, "События OnMap", NotificationManager.IMPORTANCE_DEFAULT))

    val intent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra("kind", kind)
      putExtra("targetId", targetId)
      putExtra("cityId", cityId)
    }
    val pending = PendingIntent.getActivity(this, targetId.hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(this, channelId)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(message.notification?.title ?: "OnMap")
      .setContentText(message.notification?.body ?: "Новое событие на карте")
      .setAutoCancel(true)
      .setContentIntent(pending)
      .build()
    manager.notify(targetId.hashCode(), notification)
  }
}
